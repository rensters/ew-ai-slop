// popup.js - the little panel with the switches. nothing clever in here, I promise

const api = globalThis.browser || globalThis.chrome
// fake storage so the popup can be opened as a plain html file to look at it. not used for real
const fakeStore = {
  data: {},
  get(d) { return Promise.resolve(Object.assign({}, d, this.data)) },
  set(o) { Object.assign(this.data, o); return Promise.resolve() },
}
const store = (api && api.storage && (api.storage.sync || api.storage.local)) || fakeStore

// [key, name, what it does, needs a reload?]
const GROUPS = [
  ['Watch page', [
    ['ask', 'Ask button', 'the gemini "Ask" button. nobody asked'],
    ['summaries', 'AI summaries', 'AI "summary" of the video you were literally about to watch', true],
    ['chapters', 'Auto chapters', 'robot chapters gone. real ones from the creator stay', true],
    ['allchapters', 'ALL chapters', 'even the "creator" ones. half of em are AI-written and pasted in anyway', true],
    ['jumpahead', 'Jump ahead', 'i\'ll skip when i wanna skip thx'],
  ]],
  ['Dubs & translations', [
    ['origaudio', 'Original audio', 'no more robot dub voice. the actual person talks'],
    ['searchtitles', 'Real titles in search', 'search titles stop getting machine translated', true],
    ['alltitles', 'Real titles everywhere', 'catches the sneaky translations too. 1 tiny request per video and it also undoes ones the creator made, so it\'s off'],
    ['dubbedvids', 'Hide auto-dubbed videos', 'auto-dubbed vids just vanish from home + sidebar'],
  ]],
  ['Search, comments & chat', [
    ['asksearch', 'Ask YouTube in search', 'it\'s a search bar. let it search'],
    ['commentai', 'AI comment summaries', 'AI summary of the comments. i can read, thanks'],
    ['chatai', 'AI live chat summaries', 'AI recap in live chat. just scroll up lol'],
  ]],
]

const list = document.getElementById('list')
const hint = document.getElementById('hint')
const reloadBtn = document.getElementById('reload')

function render(s) {
  list.textContent = '' // nuke and redraw, it's like 11 rows, who cares
  for (const [title, rows] of GROUPS) {
    const h = document.createElement('h2')
    h.textContent = title
    const box = document.createElement('div')
    box.className = 'group'
    for (const [key, name, blurb, needsReload] of rows) {
      const row = document.createElement('label')
      row.className = 'row'
      const txt = document.createElement('span')
      txt.className = 'txt'
      const b = document.createElement('b')
      b.textContent = name
      if (!AIOFF.defaults[key]) {
        const tag = document.createElement('span')
        tag.className = 'tag'
        tag.textContent = 'opt-in'
        b.append(tag)
      }
      const small = document.createElement('small')
      small.textContent = blurb
      txt.append(b, small)
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = !!s[key]
      input.setAttribute('aria-label', name)
      input.addEventListener('change', () => {
        store.set({ [key]: input.checked })
        if (needsReload) {
          hint.hidden = false
          reloadBtn.classList.remove('pulse')
          void reloadBtn.offsetWidth // restart the animation. yes this is how you do it. yes it's dumb
          reloadBtn.classList.add('pulse')
        }
      })
      row.append(txt, input)
      box.append(row)
    }
    list.append(h, box)
  }
}

Promise.resolve(store.get(AIOFF.defaults)).then(render)

reloadBtn.addEventListener('click', async () => {
  try { await api.tabs.reload() } catch (e) { /* no tab to reload, oh well */ }
  window.close()
})

document.getElementById('reset').addEventListener('click', async () => {
  await store.set(Object.assign({}, AIOFF.defaults))
  render(AIOFF.defaults)
  hint.hidden = false
})

// "copy debug info": asks the youtube tab what it saw, copies it, you paste it to whoever's fixing this
const diagBtn = document.getElementById('diag')
const diagSay = (txt) => {
  const was = 'something still showing up? copy debug info'
  diagBtn.textContent = txt
  setTimeout(() => { diagBtn.textContent = was }, 4000)
}
diagBtn.addEventListener('click', async () => {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true })
    const res = await api.tabs.sendMessage(tab.id, { aioff: 'diag' }, { frameId: 0 })
    await navigator.clipboard.writeText(JSON.stringify(res, null, 1))
    diagSay('copied! paste it in the chat')
  } catch (e) {
    // no content script on this tab = not youtube, or the tab was open before the extension loaded
    diagSay('open (or reload) the youtube video first, then try again')
  }
})

// ko-fi opens in a real tab. target=_blank inside an extension popup is a coin flip depending
// on which browser you're in, so just ask the browser directly
document.getElementById('kofi').addEventListener('click', (e) => {
  if (!api || !api.tabs || !api.tabs.create) return // not in an extension, let the link do its thing
  e.preventDefault()
  Promise.resolve(api.tabs.create({ url: e.currentTarget.href })).finally(() => window.close())
})
