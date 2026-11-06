// content/bridge.js
// isolated world. its whole job: get the settings out of extension storage and slap them
// onto <html data-aioff="ask chapters ..."> so hide.css + page.js can read them.
// it's a mailman. it doesn't think. let it be a mailman

;(() => {
  const api = globalThis.browser || globalThis.chrome
  const html = document.documentElement
  const KEYS = Object.keys(AIOFF.defaults)

  const paint = (s) => {
    const on = KEYS.filter((k) => s[k])
    // "none" so the attribute always exists, page.js uses that to know we showed up
    html.setAttribute('data-aioff', on.length ? on.join(' ') : 'none')
  }

  // 1. paint RIGHT NOW from the localStorage copy. it's sync, so no flash of AI crap on load
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(AIOFF.LS_KEY)) } catch (e) { /* private mode or whatever */ }
  paint(Object.assign({}, AIOFF.defaults, saved))

  const store = api && api.storage && (api.storage.sync || api.storage.local)
  if (!store) return // no extension storage?? running somewhere cursed. defaults it is

  const apply = (s) => {
    try { localStorage.setItem(AIOFF.LS_KEY, JSON.stringify(s)) } catch (e) {}
    paint(s)
  }
  const pull = () => Promise.resolve(store.get(AIOFF.defaults)).then(apply, () => {})

  // 2. now the real settings
  pull()

  // 3. popup flipped a switch -> repaint. css stuff updates live, no reload needed
  api.storage.onChanged.addListener(pull)

  // 4. popup's "copy debug info" button. poke page.js, grab what it dumps on <html>, mail it back.
  //    top frame only, the live chat iframe has nothing useful to say
  if (window === window.top) {
    api.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || msg.aioff !== 'diag') return
      html.removeAttribute('data-aioff-diag')
      document.dispatchEvent(new CustomEvent('aioff:diag')) // sync, so the answer's there right after
      let page = null
      try { page = JSON.parse(html.getAttribute('data-aioff-diag')) } catch (e) {}
      reply({
        version: api.runtime.getManifest().version,
        brave: !!navigator.brave, // brave doesn't say it's brave in the user agent. sneaky
        ua: navigator.userAgent,
        pageJsAlive: !!page, // false = page.js never loaded. that's a whole different problem
        page,
      })
    })
  }
})()
