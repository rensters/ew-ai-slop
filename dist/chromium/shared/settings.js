// shared/settings.js
// the one list of every AI thing this extension kills + whether it's on out of the box.
// this file gets loaded in THREE places (popup, bridge.js, and youtube's own page world)
// so no chrome.* calls in here. just data. dumb, beautiful data.

var AIOFF = {
  defaults: {
    ask: true,          // the "Ask" sparkle button + any other gemini sparkle buttons
    summaries: true,    // "AI-generated video summary" garbage in the description + search
    chapters: true,     // auto chapters. the ones the creator wrote themselves stay
    allchapters: false, // nuclear: ALL chapters, incl. the AI-written ones creators paste into descriptions
    jumpahead: true,    // "Jump ahead" premium skip button
    origaudio: true,    // auto-dubbing. no. original voice please
    searchtitles: true, // machine-translated titles in search results
    alltitles: false,   // original titles EVERYWHERE (1 tiny request per video so it's opt-in)
    asksearch: true,    // "Ask YouTube" in the search bar + AI answers on top of results
    commentai: true,    // AI comment summaries / topics
    chatai: true,       // AI live chat summaries
    dubbedvids: false,  // just straight up hide auto-dubbed videos on home + sidebar
  },
  // localStorage copy of the settings so the page doesn't flash AI junk before storage loads
  LS_KEY: 'aioff:settings',
}
