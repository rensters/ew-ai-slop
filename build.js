// build.js - spits out dist/chromium + dist/firefox (+ a zip of each).
// no npm install, no webpack, no bullshit. just:  node build.js
//
// chromium = chrome, edge, opera gx, brave, vivaldi... they all eat the same thing.
// firefox  = same files, the manifest just needs a gecko block bolted on.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const SRC = path.join(__dirname, 'src')
const DIST = path.join(__dirname, 'dist')

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'))

const targets = {
  chromium: (m) => m, // src already speaks chromium
  firefox: (m) => ({
    ...m,
    browser_specific_settings: {
      gecko: {
        id: 'ew-ai-slop@local',
        strict_min_version: '128.0', // "world": "MAIN" content scripts landed in firefox 128
        data_collection_permissions: { required: ['none'] }, // we collect nothing. zero. nada
      },
    },
  }),
}

fs.rmSync(DIST, { recursive: true, force: true })
fs.mkdirSync(DIST, { recursive: true })

for (const [name, tweak] of Object.entries(targets)) {
  const out = path.join(DIST, name)
  fs.cpSync(SRC, out, { recursive: true })
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(tweak(manifest), null, 2) + '\n')

  // windows 10+ ships bsdtar which can write real zips (forward slashes, firefox stops whining)
  const zip = path.join(DIST, `ew-ai-slop-${name}-v${manifest.version}.zip`)
  try {
    execFileSync('tar', ['-a', '-c', '-f', zip, '-C', out, ...fs.readdirSync(out)], { stdio: 'ignore' })
    console.log(`built ${name}  ->  dist/${name}/  +  ${path.relative(__dirname, zip)}`)
  } catch (e) {
    console.log(`built ${name}  ->  dist/${name}/  (no zip, tar threw a fit: ${e.message})`)
  }
}
