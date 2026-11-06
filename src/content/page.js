// content/page.js
// runs INSIDE youtube's own javascript world (MAIN), at document_start, before youtube's code.
//
// why the hell does it live in there? because the cleanest way to kill AI crap is to rip it out
// of the data before youtube even gets to draw it. no flash, no "hide it after it pops in",
// it just never exists. hide.css is only the backup plan.
//
// hey. why are you reading this? go outside. ...fine. here's the deal:
//   1. we wrap fetch + XHR + window.ytInitialData
//   2. every youtubei json blob that goes by gets walked and the AI bits get yanked out
//   3. we babysit the player so it plays the ORIGINAL audio and not some robot dub
//   4. (opt-in) we swap translated titles back to whatever the creator actually typed

;(() => {
  if (window.__aioff) return // already hooked, chrome being chrome
  const stats = (window.__aioff = { nuked: 0, audioFixes: 0, titlesFixed: 0 })

  // flight recorder for the popup's "copy debug info" button. what we saw, what we killed, who beat us to it
  const diag = { initHook: 'not tried', initSeen: false, seen: [] }
  const chapterKeysIn = (s) => [...new Set((s.match(/"key":"[A-Z_]*CHAPTERS"/g) || []).map((m) => m.slice(7, -1)))]
  const remember = (where, before, after, n) => {
    diag.seen.push({ where, chaptersBefore: before.join(',') || '-', chaptersAfter: after.join(',') || '-', nuked: n })
    if (diag.seen.length > 12) diag.seen.shift()
  }
  const endpointOf = (url) => String(url).split('?')[0].replace(/.*\/youtubei\/v1\//, '')

  const DEFAULTS = (window.AIOFF && window.AIOFF.defaults) || {}
  const LS_KEY = (window.AIOFF && window.AIOFF.LS_KEY) || 'aioff:settings'
  // gemini's stupid little sparkle icon, under whatever name youtube gives it this week
  const SPARK = /"(?:iconType|iconName|imageName)":"[A-Z0-9_]*SPARK[A-Z0-9_]*"/
  const HOOK_ME = /\/youtubei\/v1\/(?:next|browse|search|get_watch|reel)/

  let debug = false
  try { debug = !!localStorage.getItem('aioff:debug') } catch (e) {}
  const log = (...a) => { if (debug) console.log('%c[ew AI slop]', 'color:#1b2935;background:#e6cf3a;font-weight:bold;padding:0 4px', ...a) }

  // ---------------------------------------------------------------- settings
  // bridge.js puts them on <html data-aioff="...">. if it hasn't yet (document_start race, lol)
  // use the localStorage copy, and if THAT'S missing too, defaults
  function opts() {
    const attr = document.documentElement && document.documentElement.getAttribute('data-aioff')
    if (attr) {
      const on = new Set(attr.split(' '))
      return (k) => on.has(k)
    }
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(LS_KEY)) } catch (e) {}
    const s = Object.assign({}, DEFAULTS, saved)
    return (k) => !!s[k]
  }

  const unb64 = (s) => {
    try { return atob(decodeURIComponent(s).replace(/-/g, '+').replace(/_/g, '/')) } catch (e) { return '' }
  }
  const textOf = (t) => (t && (t.simpleText || (t.runs || []).map((r) => r.text).join(''))) || ''
  const smellsLikeAI = (o) => {
    const s = JSON.stringify(o)
    return s.includes('videoSummary') || SPARK.test(s)
  }

  // ---------------------------------------------------------------- the nuke
  // walks youtube's json and deletes AI stuff IN PLACE. returns how many things died
  function nuke(root) {
    const on = opts()
    const want = {
      chapters: on('chapters') || on('allchapters'),
      allChapters: on('allchapters'),
      summaries: on('summaries'),
      ask: on('ask'),
      titles: on('searchtitles'),
      comments: on('commentai'),
    }
    if (!Object.values(want).some(Boolean)) return 0
    let killed = 0

    // which chapters die. robot ones always, the "creator" ones only if you went nuclear.
    // (lots of channels paste AI-written timestamps into the description now, so youtube thinks
    // a human made them. it did not. looking at you "Establishing a temporary base")
    const chapterPanel = want.allChapters ? /macro-markers-(?:auto|description)-chapters/ : /macro-markers-auto-chapters/
    const markerDies = (key) => key === 'AUTO_CHAPTERS' || (want.allChapters && /CHAPTERS$/.test(key || ''))

    // should this array item just... not exist
    const drop = (it) => {
      if (want.chapters) {
        if (typeof it.key === 'string' && 'value' in it && markerDies(it.key)) return true // player bar marker set
        const ep = it.engagementPanelSectionListRenderer
        if (ep && chapterPanel.test((ep.panelIdentifier || '') + ' ' + (ep.targetId || ''))) return true // the side panel
        // "Chapters" chip in the "In this video" panel, and the chapters carousel in the description
        if ((it.chipViewModel || it.chipCloudChipRenderer) && chapterPanel.test(JSON.stringify(it))) return true
        if (it.horizontalCardListRenderer && chapterPanel.test(JSON.stringify(it.horizontalCardListRenderer.header || {}))) return true
        // newer entity-store version, key is base64 and says AUTO_CHAPTERS inside
        if (typeof it.entityKey === 'string' && it.payload &&
            (want.allChapters ? /CHAPTERS/ : /AUTO_CHAPTERS/).test(unb64(it.entityKey))) return true
      }
      if (want.summaries) {
        if (it.expandableMetadataRenderer && smellsLikeAI(it.expandableMetadataRenderer)) return true
        if (it.videoSummaryContentViewModel) return true
      }
      const keys = Object.keys(it)
      if (keys.length === 1) {
        const k = keys[0]
        // any button with a sparkle on it. that's the Ask button (and friends)
        if (want.ask && /button/i.test(k) && SPARK.test(JSON.stringify(it[k]))) return true
        if (want.ask && k === 'engagementPanelSectionListRenderer' &&
            /youchat|conversational/i.test((it[k].panelIdentifier || '') + ' ' + (it[k].targetId || ''))) return true
        // the "Ask - Get answers, explore topics" section in the description. signed-in only so I can't see
        // its real name from here, so: anything NAMED like ask/gemini, or a description section with a sparkle on it
        if (want.ask && (/Ask[A-Z]|^ask[A-Z]/.test(k) || /youchat|gemini|conversational/i.test(k))) return true
        if (want.ask && /^videoDescription\w*Section|SectionViewModel$/.test(k)) {
          const s = JSON.stringify(it[k])
          if (s.length < 30000 && SPARK.test(s)) return true // size check so we never eat a big container by accident
        }
        // AI summary/topics thing in comments. NOT actual comments and NOT the header (sort menu lives there)
        if (want.comments && /comment|summar|topic/i.test(k) &&
            !/^comment(Thread)?Renderer$|^commentViewModel$|header/i.test(k) &&
            SPARK.test(JSON.stringify(it[k]))) return true
      }
      return false
    }

    // stuff that has to be edited, not deleted
    const fix = (o) => {
      if (want.chapters) {
        const mm = o.multiMarkersPlayerBarRenderer
        if (mm && Array.isArray(mm.markersMap)) {
          const before = mm.markersMap.length
          mm.markersMap = mm.markersMap.filter((m) => !m || !markerDies(m.key))
          killed += before - mm.markersMap.length
          if (mm.visibleOnLoad && markerDies(mm.visibleOnLoad.key)) {
            // creator chapters left? show those. otherwise show nothing
            if (mm.markersMap.length) mm.visibleOnLoad.key = mm.markersMap[0].key
            else delete mm.visibleOnLoad
          }
        }
        // the "View Chapters" button under the player
        if (o.playerBarActionButton && chapterPanel.test(JSON.stringify(o.playerBarActionButton))) {
          delete o.playerBarActionButton
          killed++
        }
      }
      // nuclear mode also eats the "22 chapters" strip under search results
      if (want.allChapters && o.expandableMetadata && JSON.stringify(o.expandableMetadata).includes('macroMarkersListItemRenderer')) {
        delete o.expandableMetadata
        killed++
      }

      if (want.summaries && o.expandableMetadata && smellsLikeAI(o.expandableMetadata)) {
        delete o.expandableMetadata // AI summary hanging off a search result
        killed++
      }

      // search results ship the real title right next to the machine-translated one. thanks I guess??
      if (want.titles && o.untranslatedTitle) {
        const fake = textOf(o.title)
        const real = textOf(o.untranslatedTitle)
        o.title = o.untranslatedTitle
        delete o.untranslatedTitle
        // screen reader label still has the translated title baked in. fix that too
        const acc = o.title.accessibility && o.title.accessibility.accessibilityData
        if (acc && acc.label && fake && real) acc.label = acc.label.replace(fake, real)
        // the untranslated link drops the &pp= thing that makes the watch page pick a dub
        if (o.untranslatedNavigationEndpoint) {
          o.navigationEndpoint = o.untranslatedNavigationEndpoint
          delete o.untranslatedNavigationEndpoint
        }
        if (o.inlineTitleIcon && /TRANSLATE/.test(o.inlineTitleIcon.iconType || '')) delete o.inlineTitleIcon
        if (Array.isArray(o.badges)) {
          o.badges = o.badges.filter((b) => {
            const groups = (b && b.metadataBadgeRenderer && b.metadataBadgeRenderer.groups) || []
            return !groups.includes('METADATA_BADGE_GROUP_TRANSLATION')
          })
        }
        killed++
      }
    }

    const walk = (node) => {
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) {
          const it = node[i]
          if (it && typeof it === 'object' && !Array.isArray(it) && drop(it)) {
            node.splice(i, 1)
            killed++
            continue
          }
          walk(it)
        }
      } else if (node && typeof node === 'object') {
        fix(node)
        for (const k in node) {
          const v = node[k]
          if (v && typeof v === 'object') walk(v)
        }
      }
    }

    walk(root)
    stats.nuked += killed
    return killed
  }

  // returns the cleaned json text, or null if there was nothing to clean
  function patchText(txt, url) {
    if (typeof txt !== 'string' || (txt[0] !== '{' && txt[0] !== '[')) return null
    let data
    try { data = JSON.parse(txt) } catch (e) { return null }
    const n = nuke(data)
    const out = n ? JSON.stringify(data) : null
    remember(endpointOf(url), chapterKeysIn(txt), chapterKeysIn(out || txt), n)
    return out
  }

  // ---------------------------------------------------------------- hook: fetch
  const ogFetch = window.fetch
  window.fetch = async function (input, init) {
    const res = await ogFetch.apply(window, arguments)
    let url = ''
    try { url = typeof input === 'string' ? input : (input && input.url) || String(input) } catch (e) {}
    if (!HOOK_ME.test(url) || !res.ok) return res
    try {
      const out = patchText(await res.clone().text(), url)
      if (out == null) return res
      const fake = new Response(out, { status: res.status, statusText: res.statusText, headers: res.headers })
      Object.defineProperty(fake, 'url', { value: res.url })
      log('cleaned', url.split('?')[0], '| total nuked:', stats.nuked)
      return fake
    } catch (e) {
      return res // NEVER break youtube over this. worst case the AI shit shows up, whatever
    }
  }
  const ourFetch = window.fetch

  // ---------------------------------------------------------------- hook: XHR
  // youtube mostly uses fetch now but some code paths still do XHR like it's 2012
  const ogOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__aioffUrl = String(url || '')
    return ogOpen.apply(this, arguments)
  }
  const ourOpen = XMLHttpRequest.prototype.open
  for (const prop of ['responseText', 'response']) {
    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, prop)
    if (!desc || !desc.get) continue
    Object.defineProperty(XMLHttpRequest.prototype, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        const raw = desc.get.call(this)
        if (this.readyState !== 4 || !HOOK_ME.test(this.__aioffUrl || '')) return raw
        if (this.__aioffCache && this.__aioffCache.raw === raw) return this.__aioffCache.out
        let out = raw
        try {
          if (typeof raw === 'string') out = patchText(raw, this.__aioffUrl) || raw
          else if (raw && typeof raw === 'object' && this.responseType === 'json') remember('xhr json', [], [], nuke(raw))
        } catch (e) {}
        this.__aioffCache = { raw, out }
        return out
      },
    })
  }

  // ---------------------------------------------------------------- hook: first page load
  // the very first page doesn't fetch anything, it's baked into the html as
  // `var ytInitialData = {...}`. we grab it on the way in with a setter
  let initialData
  const initGet = function () { return initialData }
  try {
    Object.defineProperty(window, 'ytInitialData', {
      configurable: true,
      enumerable: true,
      get: initGet,
      set(v) {
        diag.initSeen = true
        if (v && typeof v === 'object') {
          try {
            const before = chapterKeysIn(JSON.stringify(v))
            const n = nuke(v)
            remember('first page load', before, chapterKeysIn(JSON.stringify(v)), n)
            log('initial data: nuked', n)
          } catch (e) { diag.initErr = String(e) }
        }
        initialData = v
      },
    })
    diag.initHook = 'ok'
  } catch (e) {
    // somebody (an adblocker?) grabbed ytInitialData before us. the css backup still works
    diag.initHook = 'beaten to it: ' + e.message
    log('could not hook ytInitialData (too late?)', e)
  }

  // ---------------------------------------------------------------- original audio
  // each track object has a minified prop (name changes every player update, cool) holding
  // { name, id, isDefault, isAutoDubbed }. isDefault === the real original track
  const trackInfo = (t) => {
    for (const k in t) {
      const v = t[k]
      if (v && typeof v === 'object' && !Array.isArray(v) && 'id' in v && ('isDefault' in v || 'isAutoDubbed' in v)) return v
    }
    return null
  }
  const isOriginal = (t) => {
    if (!t) return false
    const info = trackInfo(t)
    if (info && typeof info.isDefault === 'boolean') return info.isDefault && !info.isAutoDubbed
    // plan b: track id is "itag;base64(xtags)" and the xtags literally say acont=original
    return /original/.test(unb64(String(t.id || '').split(';')[1] || ''))
  }

  let audioDoneFor = null
  function fixAudio() {
    if (!opts()('origaudio')) return
    const p = document.getElementById('movie_player')
    if (!p || typeof p.getAvailableAudioTracks !== 'function') return
    const vid = ((p.getVideoData && p.getVideoData()) || {}).video_id
    if (!vid || vid === audioDoneFor) return
    const tracks = p.getAvailableAudioTracks() || []
    if (tracks.length < 2) return // no dubs (or not loaded yet, we get called again anyway)
    const orig = tracks.find(isOriginal)
    if (!orig) return
    // once per video. if you pick a dub by hand after this, that's on you, we won't fight you
    audioDoneFor = vid
    const cur = p.getAudioTrack && p.getAudioTrack()
    if (isOriginal(cur)) return
    p.setAudioTrack(orig)
    stats.audioFixes++
    log('robot dub detected on', vid, '-> back to original audio')
  }
  let audioTimer = 0
  const soonAudio = () => { clearTimeout(audioTimer); audioTimer = setTimeout(fixAudio, 150) }
  document.addEventListener('yt-navigate-finish', soonAudio)
  document.addEventListener('yt-player-updated', soonAudio)
  // media events don't bubble but capture still sees them
  for (const ev of ['loadedmetadata', 'playing']) {
    document.addEventListener(ev, (e) => { if (e.target && e.target.tagName === 'VIDEO') soonAudio() }, true)
  }

  // ---------------------------------------------------------------- original titles everywhere (opt-in)
  // feeds don't ship the original title at all, so we ask oembed, which always has the real one.
  // 1 tiny request per video, cached, max 4 at once. no cookies so it can't "helpfully" translate
  const titleCache = new Map() // videoId -> Promise<string|null>
  const queue = []
  let inflight = 0
  const pump = () => {
    while (inflight < 4 && queue.length) {
      const job = queue.shift()
      inflight++
      ogFetch('/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + job.id), { credentials: 'omit' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => job.done((j && j.title) || null), () => job.done(null))
        .finally(() => { inflight--; pump() })
    }
  }
  const realTitle = (id) => {
    if (!titleCache.has(id)) titleCache.set(id, new Promise((done) => { queue.push({ id, done }); pump() }))
    return titleCache.get(id)
  }

  const TITLE_SPOTS = [
    'a#video-title', 'a#video-title-link', 'ytd-playlist-panel-video-renderer #video-title',
    'a.ytLockupMetadataViewModelTitle', 'a.yt-lockup-metadata-view-model__title', 'a.yt-lockup-metadata-view-model-wiz__title',
  ].join(',')

  const vidOf = (el) => {
    const a = el.matches('a[href]') ? el : el.closest('a[href]') || el.querySelector('a[href]')
    const m = a && /[?&]v=([\w-]{11})/.exec(a.getAttribute('href') || '')
    return m && m[1]
  }
  // some real titles come back with trailing newlines + spaces. compare without that crap or
  // we "fix" the same title every 350ms forever (yes that happened. yes I'm mad about it)
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()

  async function fixTitle(el) {
    const id = vidOf(el)
    if (!id) return
    const box = el.querySelector('yt-formatted-string, span.ytAttributedStringHost, span') || el
    if (el.__aioffId === id && el.__aioffSet === norm(box.textContent)) return // done + youtube didn't stomp it
    el.__aioffId = id
    const real = norm(await realTitle(id))
    if (!real || vidOf(el) !== id) return // element got recycled for another video while we waited lmao
    if (norm(box.textContent) !== real) {
      box.textContent = real
      stats.titlesFixed++
    }
    el.__aioffSet = real
    if (el.hasAttribute('title')) el.setAttribute('title', real)
    const h3 = el.closest('h3')
    if (h3 && h3.hasAttribute('title')) h3.setAttribute('title', real)
  }

  async function fixWatchTitle() {
    if (location.pathname !== '/watch') return
    const id = new URLSearchParams(location.search).get('v')
    const h = document.querySelector('ytd-watch-metadata h1 yt-formatted-string')
    if (!id || !h) return
    const real = norm(await realTitle(id))
    if (!real || new URLSearchParams(location.search).get('v') !== id) return
    const shown = norm(h.textContent)
    if (shown && shown !== real) {
      h.__aioffFake = shown
      h.textContent = real
      h.setAttribute('title', real)
      stats.titlesFixed++
    }
    // youtube sets the tab title on its own schedule, usually AFTER we fixed the h1. keep fixing it
    const fake = h.__aioffFake
    if (fake && fake !== real && document.title.includes(fake)) document.title = document.title.replace(fake, real)
  }

  // ---------------------------------------------------------------- "Ask" last resort
  // if the data trick misses signed-in youtube's "Ask" section, hide it by what it SAYS.
  // english only, sorry. ugly, but it's the backup to the backup
  const ASK_WORDS = /^ask( questions)?$/i
  // textContent not innerText: innerText makes the browser re-layout the page and this runs a lot
  const looksLikeAsk = (el) => {
    const btns = el.matches('button, yt-button-view-model, ytd-button-renderer') ? [el] : el.querySelectorAll('button, a[role="button"]')
    return [...btns].some((b) => ASK_WORDS.test((b.textContent || '').trim() || b.getAttribute('aria-label') || ''))
  }
  // we only TAG stuff here, hide.css does the hiding (and stops hiding the second you flip the switch off).
  // do NOT touch el.style: youtube's button elements override "style" with their own junk (on
  // yt-button-view-model it's literally a Symbol??) so el.style.setProperty just explodes. ask me how I know
  function sweepAsk(on) {
    if (!on) return
    const spots = document.querySelectorAll(
      'ytd-structured-description-content-renderer > #items > *,' +
      '#flexible-item-buttons > *, #top-level-buttons-computed > *')
    spots.forEach((el) => {
      const ask = looksLikeAsk(el)
      const tagged = el.hasAttribute('data-aioff-hid')
      // youtube recycles these elements, so yesterday's Ask button can turn into a Save button. re-check every time
      if (ask && !tagged) {
        el.setAttribute('data-aioff-hid', '')
        log('hid an Ask thing by its text, the data trick missed it:', el.tagName)
      } else if (!ask && tagged) {
        el.removeAttribute('data-aioff-hid')
      }
    })
  }

  // one debounced sweep for both DOM jobs (titles + ask) so we only watch the page once
  let sweepTimer = 0
  let watcher = null
  const sweep = () => {
    sweepTimer = 0
    const on = opts()
    sweepAsk(on('ask'))
    if (on('alltitles')) {
      document.querySelectorAll(TITLE_SPOTS).forEach(fixTitle)
      fixWatchTitle()
    }
  }
  const soonSweep = () => { if (!sweepTimer) sweepTimer = setTimeout(sweep, 350) }
  const syncWatcher = () => {
    const on = opts()
    const want = on('alltitles') || on('ask')
    if (want && !watcher) {
      watcher = new MutationObserver(soonSweep)
      watcher.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    } else if (!want && watcher) {
      watcher.disconnect()
      watcher = null
    }
    soonSweep() // also un-hides stuff right away when you flip ask off
  }
  // settings changed in the popup -> start/stop without a reload
  new MutationObserver(syncWatcher).observe(document.documentElement, { attributes: true, attributeFilter: ['data-aioff'] })
  syncWatcher()

  // poke these from devtools if something's acting weird: __aioff.recheck(), __aioff.nuke(obj)
  stats.nuke = nuke
  stats.recheck = () => { audioDoneFor = null; fixAudio(); sweep() }
  // popup's "copy debug info" -> bridge.js fires this event -> we dump a report onto <html> for it.
  // (two different JS worlds, the DOM is the only phone line between them)
  document.addEventListener('aioff:diag', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'ytInitialData')
    const label = document.querySelector('#movie_player .ytp-chapter-container')
    const report = {
      page: location.pathname + location.search,
      settings: document.documentElement.getAttribute('data-aioff'),
      stats: { nuked: stats.nuked, audioFixes: stats.audioFixes, titlesFixed: stats.titlesFixed },
      hooks: {
        fetchStillOurs: window.fetch === ourFetch,
        xhrStillOurs: XMLHttpRequest.prototype.open === ourOpen,
        firstLoadHook: diag.initHook,
        firstLoadSeen: diag.initSeen,
        firstLoadStillOurs: !!(desc && desc.get === initGet),
        firstLoadError: diag.initErr || null,
      },
      responses: diag.seen,
      onScreen: {
        chapterSegments: document.querySelectorAll('#movie_player .ytp-chapter-hover-container').length,
        chapterLabel: label ? label.textContent.trim().slice(0, 60) : null,
        descSections: [...document.querySelectorAll('ytd-structured-description-content-renderer > #items > *')]
          .map((el) => el.tagName.toLowerCase() + (getComputedStyle(el).display === 'none' ? ' [hidden]' : '')),
        underVideo: [...document.querySelectorAll('#flexible-item-buttons > *, #top-level-buttons-computed > *')]
          .map((el) => (el.textContent || '').trim().slice(0, 20)),
      },
    }
    document.documentElement.setAttribute('data-aioff-diag', JSON.stringify(report))
  })

  log('hooked in. let the purge begin')
})()
