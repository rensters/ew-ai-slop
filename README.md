# ew AI slop, nty

youtube decided every single video needed a robot narrator, a robot summary, robot chapters and a little gemini
sparkle button begging me to "Ask" it things. i did not ask. i will never ask. so i built this.

it's a browser extension that rips youtube's AI features back out. works on Chrome, Edge, Opera GX, Brave
(anything Chromium really) and Firefox.

everything's a switch in the popup, so if you actually *like* one of these (why) you can bring it back. no judgement.
ok a little judgement.

if it saved your sanity, you can [buy me a coffee on Ko-fi](https://ko-fi.com/rensters) ☕

## what it kills

| Thing | On by default | How | Tested on live YouTube (Nov 4 2026) |
|---|---|---|---|
| **Auto-generated chapters** | yes | deleted from youtube's data before the page even draws. chapters the creator actually wrote stay | ✅ player bar, chapter label, description carousel, "In this video" panel, "View Chapters" button |
| **ALL chapters** | no (opt-in) | same thing, but also kills chapters from the description. lots of channels paste AI-written timestamps in there now and youtube can't tell those apart from real ones, so this is the only way to get rid of them. nuclear option | ✅ data-checked with `tools/check.js` |
| **AI video summaries** | yes | deleted from the data + CSS backup, just in case | ✅ description box + the "Summary ✨" thing on search results |
| **Auto-dubbing** | yes | flips the player back to the original audio track (once per video, so you can still pick a dub yourself if you want) | ✅ forced a German robot dub on purpose, it switched right back to the original. danke |
| **Machine-translated titles in search** | yes | youtube ships the real title right next to the translated one (lol), we just swap it back. also drops the link param that makes the watch page pick a dub | ✅ |
| **Real titles everywhere** | no (opt-in) | asks youtube's own oEmbed endpoint for the real title of every video you see. catches translations youtube *doesn't* flag (there are a lot), but it's 1 small request per video and it also undoes translations the creator made on purpose | ✅ search, sidebar, watch page + tab title |
| **Hide auto-dubbed videos** | no (opt-in) | hides anything with the "Auto-dubbed" badge on Home and the sidebar. out of sight, out of mind | ✅ badge icon matched exactly |
| **Ask button** | yes | hides any button with gemini's sparkle icon + drops sparkle buttons from the data. sparkle = gone | ⚠️ best effort |
| **Ask YouTube in search** | yes | hides the AI part of the search bar + the AI answer blocks on top of results | ⚠️ best effort |
| **Jump ahead** | yes | hides the button | ⚠️ best effort |
| **AI comment summaries / topics** | yes | sparkle-icon stuff around the comments | ⚠️ best effort |
| **AI live chat summaries** | yes | sparkle-icon banner in live chat | ⚠️ best effort |

⚠️ = i couldn't actually see these from my test browser (signed out, in the Philippines, no Premium, broke), and
most of them are US-only or Premium-only right now. they use the same selectors other open-source blockers use plus
"anything with the gemini sparkle on it", so they *should* work. if one slips through anyway, see
[when youtube breaks it](#when-youtube-breaks-it).

## install

the ready-to-load builds are already in `dist/`. you don't need to build anything. that's the whole trick.

> **don't delete or move the folder after loading it.** unpacked extensions load straight from disk, so if you
> delete it, it's gone. copy `dist\chromium` somewhere permanent first if you want (like `Documents\extensions\ew-ai-slop`).

### Chrome, Edge, Opera GX, Brave

1. open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera GX: `opera://extensions`
   - Brave: `brave://extensions`
2. turn on **Developer mode**: top right in Chrome, Opera and Brave; left sidebar in Edge (because Edge has to be different).
3. click **Load unpacked** and pick the **`dist\chromium`** folder (the one with `manifest.json` directly inside).
4. pin it from the puzzle-piece menu so the switches are one click away.
5. reload any youtube tabs that were already open.

Edge sometimes nags about "developer mode extensions" on startup. hit keep. ignore it. it's fine.

### Firefox (128 or newer)

Firefox won't permanently install unsigned extensions, so pick one:

**quick test, gone after restart**
1. go to `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** and pick `dist\firefox\manifest.json`

**permanent: sign it for free (about 5 minutes, promise)**
1. log in at [addons.mozilla.org](https://addons.mozilla.org/developers/) and open the **Developer Hub**
2. **Submit a New Add-on**, then choose **On your own** (unlisted, so nobody else sees it)
3. upload `dist\ew-ai-slop-firefox-v1.0.0.zip`
4. once the automatic check passes, download the signed `.xpi` and drag it into Firefox

**permanent: Firefox Developer Edition / Nightly only**
1. `about:config`, then set `xpinstall.signatures.required` to `false`
2. `about:addons`, then gear menu, **Install Add-on From File…**, then pick the firefox zip

if it loads but nothing changes on youtube: click the extensions button in the toolbar, then **ew AI slop, nty**,
then **Always allow on www.youtube.com**. Firefox likes to leave that off. it's not broken, i swear.

## rebuilding

changed something in `src/`? rebuild `dist/` with:

```bash
node build.js
```

the icon is drawn by a script (yes really), run this if you change it:

```bash
powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
```

## something AI slipped through? report it

the ⚠️ stuff up top is mostly US-only or Premium-only, so it's half guesswork until someone actually runs into it.
if that someone is you, congrats, and also:

1. on the youtube page where it shows up, open the extension popup
2. click **"something still showing up? copy debug info"** at the bottom (it copies a report to your clipboard, nothing gets sent anywhere)
3. [open an issue](https://github.com/rensters/ew-ai-slop/issues/new) with a screenshot of the thing, the video link, and paste the report

want extra detail? turn on debug mode first (F12, Console, `localStorage.setItem('aioff:debug', 1)`, reload) and
then copy the report. it'll also show which chapters each youtube response had before and after.

## when youtube breaks it

they change their page code constantly, so at some point something *will* slip through. not if. when.

- quick check without a browser: `node tools/check.js` runs the real `page.js` against live youtube videos and shows what got stripped. add your own video IDs after it to test those.
- turn on logging: in a youtube tab press F12, open the Console, run `localStorage.setItem('aioff:debug', 1)`, reload. every cleaned request gets logged.
- `__aioff` in that console shows counters (`nuked`, `audioFixes`, `titlesFixed`). yes the counter is called nuked. `__aioff.recheck()` re-runs the audio + title fixes.
- where stuff lives:
  - `src/content/page.js`: the data layer, the main thing. runs inside youtube's own page and edits their JSON before it's drawn.
  - `src/content/hide.css`: backup CSS. each rule is keyed to a switch.
  - `src/shared/settings.js`: the list of switches + defaults.
  - `src/content/bridge.js`: carries the settings from extension storage onto the page.
  - `src/popup/`: the switches UI.

## privacy

collects nothing, sends nothing anywhere. i don't want your data, i just want youtube to stop being weird.
the only network request it ever makes is "Real titles everywhere" asking `youtube.com/oembed` (youtube itself)
for titles, and that's off by default. settings live in your browser's extension storage, with a copy in youtube's
localStorage (`aioff:settings`) so the page doesn't flash AI junk at you before the settings load.

that's it. go watch a video narrated by an actual human. 🫡
