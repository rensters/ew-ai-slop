// tools/check.js - runs the REAL page.js against live youtube pages, no browser needed.
//   node tools/check.js                      -> the default test videos
//   node tools/check.js VIDEOID VIDEOID ...  -> your own
// for when youtube changes something and you wanna know what broke without clicking around for an hour.
// (signed-out data only. signed-in youtube is its own special hell)

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.join(__dirname, '..', 'src')

// fake just enough browser for page.js to boot. it's held together with tape, don't look at it
function loadPageJs(settingsAttr) {
  const noop = () => {}
  const win = {
    fetch: async () => { throw new Error('no network in the sandbox lol') },
    localStorage: { getItem: () => null, setItem: noop },
    location: { pathname: '/watch', search: '' },
    console,
    URLSearchParams,
    MutationObserver: class { observe() {} disconnect() {} },
    XMLHttpRequest: function () {},
    Response: class {},
    setTimeout: () => 0, clearTimeout: noop,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  }
  win.XMLHttpRequest.prototype = { open: noop }
  win.document = {
    documentElement: { getAttribute: (n) => (n === 'data-aioff' ? settingsAttr : null) },
    addEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    title: '',
  }
  win.window = win
  vm.createContext(win)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared', 'settings.js'), 'utf8'), win)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'content', 'page.js'), 'utf8'), win)
  return win.__aioff
}

// yank `var ytInitialData = {...}` out of the html without trusting a regex with my life
function grab(html, name) {
  const i = html.indexOf(name)
  if (i < 0) return null
  const s = html.indexOf('{', i)
  let depth = 0, inStr = false, esc = false
  for (let j = s; j < html.length; j++) {
    const c = html[j]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(s, j + 1))
  }
}

const count = (s, re) => (s.match(re) || []).length
const report = (data) => {
  const s = JSON.stringify(data)
  return {
    autoCh: count(s, /AUTO_CHAPTERS/g),
    descCh: count(s, /DESCRIPTION_CHAPTERS/g),
    chPanels: count(s, /macro-markers-(auto|description)-chapters/g),
    summary: count(s, /"videoSummaryContentViewModel":\{/g),
    spark: count(s, /"(iconType|iconName|imageName)":"[A-Z0-9_]*SPARK/g),
    transcript: count(s, /engagement-panel-searchable-transcript/g), // should NEVER drop, it's the canary
  }
}

const DEFAULTS = Object.entries({ ask: 1, summaries: 1, chapters: 1, jumpahead: 1, origaudio: 1, searchtitles: 1, asksearch: 1, commentai: 1, chatai: 1 }).map(([k]) => k).join(' ')
const MODES = { default: DEFAULTS, 'ALL chapters': DEFAULTS + ' allchapters' }

;(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['MCAPRAEG9wk', 'GF4RGA8daaE']
  for (const id of ids) {
    const html = await (await fetch('https://www.youtube.com/watch?v=' + id, { headers: { 'accept-language': 'en-US,en;q=0.9' } })).text()
    const raw = grab(html, 'var ytInitialData = ')
    if (!raw) { console.log(id, '-> no ytInitialData?? youtube changed the page or blocked us'); continue }
    console.log(`\n${id}`)
    console.log('  before          ', JSON.stringify(report(raw)))
    for (const [name, attr] of Object.entries(MODES)) {
      const data = JSON.parse(JSON.stringify(raw))
      const n = loadPageJs(attr).nuke(data)
      console.log(`  ${name.padEnd(16)}`, JSON.stringify(report(data)), `(${n} nuked)`)
    }
  }
})()
