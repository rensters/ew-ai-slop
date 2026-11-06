# ew AI slop, nty

Browser extension that rips YouTube's AI features back out. Chrome, Edge, Opera GX, Brave (anything Chromium) and Firefox.

Everything's a switch in the popup, so if you actually *like* one of these you can bring it back.

If it saved your sanity, you can [buy me a coffee on Ko-fi](https://ko-fi.com/rensters) ☕

## What it kills

| Thing | On by default | How | Tested on live YouTube (Nov 4 2026) |
|---|---|---|---|
| **Auto-generated chapters** | yes | Deleted from YouTube's data before the page draws. Chapters the creator wrote stay. | ✅ player bar, chapter label, description carousel, "In this video" panel, "View Chapters" button |
| **ALL chapters** | no (opt-in) | Same thing but also kills chapters from the description. Lots of channels paste AI-written timestamps in there now, and YouTube can't tell those apart from real ones, so this is the only way to get rid of them | ✅ data-checked with `tools/check.js` |
| **AI video summaries** | yes | Deleted from the data + CSS backup | ✅ description box + the "Summary ✨" thing on search results |
| **Auto-dubbing** | yes | Flips the player back to the original audio track (once per video, so you can still pick a dub yourself) | ✅ forced a German robot dub, it switched back to the original |
| **Machine-translated titles in search** | yes | YouTube ships the real title right next to the translated one, we swap it back. Also drops the link param that makes the watch page pick a dub | ✅ |
| **Real titles everywhere** | no (opt-in) | Asks YouTube's own oEmbed endpoint for the real title of every video you see. Catches translations YouTube *doesn't* flag (there are a lot), but it's 1 small request per video and it also undoes translations the creator made on purpose | ✅ search, sidebar, watch page + tab title |
| **Hide auto-dubbed videos** | no (opt-in) | Hides anything with the "Auto-dubbed" badge on Home and the sidebar | ✅ badge icon matched exactly |
| **Ask button** | yes | Hides any button with Gemini's sparkle icon + drops sparkle buttons from the data | ⚠️ best effort |
| **Ask YouTube in search** | yes | Hides the AI part of the search bar + AI answer blocks on top of results | ⚠️ best effort |
| **Jump ahead** | yes | Hides the button | ⚠️ best effort |
| **AI comment summaries / topics** | yes | Sparkle-icon stuff around the comments | ⚠️ best effort |
| **AI live chat summaries** | yes | Sparkle-icon banner in live chat | ⚠️ best effort |

⚠️ = I couldn't see these from the test browser (signed out, in the Philippines, no Premium), and most of them are US-only or Premium-only right now. They use the same selectors other open-source blockers use plus "anything with the Gemini sparkle on it", so they should work, but if one slips through, see [When YouTube breaks it](#when-youtube-breaks-it).

## Install

The ready-to-load builds are already in `dist/`. You don't need to build anything.

> **Don't delete or move the folder after loading it.** Unpacked extensions load straight from disk, so copy `dist\chromium` somewhere permanent first if you want (like `Documents\extensions\ew-ai-slop`).

### Chrome, Edge, Opera GX, Brave

1. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera GX: `opera://extensions`
   - Brave: `brave://extensions`
2. Turn on **Developer mode**: top right in Chrome, Opera and Brave; left sidebar in Edge.
3. Click **Load unpacked** and pick the **`dist\chromium`** folder (the one with `manifest.json` directly inside).
4. Pin it from the puzzle-piece menu so the switches are one click away.
5. Reload any YouTube tabs that were already open.

Edge sometimes nags about "developer mode extensions" on startup. Hit keep.

### Firefox (128 or newer)

Firefox won't permanently install unsigned extensions, so pick one:

**Quick test, gone after restart**
1. Go to `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** and pick `dist\firefox\manifest.json`

**Permanent: sign it for free (about 5 minutes)**
1. Log in at [addons.mozilla.org](https://addons.mozilla.org/developers/) and open the **Developer Hub**
2. **Submit a New Add-on**, then choose **On your own** (unlisted, so nobody else sees it)
3. Upload `dist\ew-ai-slop-firefox-v1.0.0.zip`
4. Once the automatic check passes, download the signed `.xpi` and drag it into Firefox

**Permanent: Firefox Developer Edition / Nightly only**
1. `about:config`, then set `xpinstall.signatures.required` to `false`
2. `about:addons`, then gear menu, **Install Add-on From File…**, then pick the firefox zip

If it loads but nothing changes on YouTube: click the extensions button in the toolbar, then **ew AI slop, nty**, then **Always allow on www.youtube.com**.

## Rebuilding

Changed something in `src/`? Rebuild `dist/` with:

```bash
node build.js
```

The icon is drawn by a script, run this if you change it:

```bash
powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
```

## When YouTube breaks it

They change their page code constantly, so at some point something will slip through.

- Quick check without a browser: `node tools/check.js` runs the real `page.js` against live YouTube videos and shows what got stripped. Add your own video IDs after it to test those.
- Turn on logging: in a YouTube tab press F12, open the Console, run `localStorage.setItem('aioff:debug', 1)`, reload. Every cleaned request gets logged.
- `__aioff` in that console shows counters (`nuked`, `audioFixes`, `titlesFixed`). `__aioff.recheck()` re-runs the audio + title fixes.
- Where stuff lives:
  - `src/content/page.js`: the data layer, the main thing. Runs inside YouTube's own page and edits their JSON before it's drawn.
  - `src/content/hide.css`: backup CSS. Each rule is keyed to a switch.
  - `src/shared/settings.js`: the list of switches + defaults.
  - `src/content/bridge.js`: carries the settings from extension storage onto the page.
  - `src/popup/`: the switches UI.

## Privacy

Collects nothing, sends nothing anywhere. The only network request it ever makes is "Real titles everywhere" asking `youtube.com/oembed` (YouTube itself) for titles, and that's off by default. Settings live in your browser's extension storage, with a copy in YouTube's localStorage (`aioff:settings`) so the page doesn't flash AI junk before the settings load.
