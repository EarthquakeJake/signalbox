// The render harness: draws every fixture tall and wide straight from
// hooks/draw.ts, writes the SVGs, PNGs where a Chrome or Edge is installed, and
// one HTML page with them all side by side and the layout check's findings.
//
//   node tools/render.ts [out folder] [--no-png] [--only <id,id>] [--strict]
//
// Node 24 runs it as it is: types are stripped, and a resolve hook lets the
// hooks' own extensionless imports (`./lanes`) find their `.ts` files.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith('file:')) {
      const base = fileURLToPath(new URL(specifier, context.parentURL))
      for (const ext of ['.ts', '.tsx', '/index.ts', '.d.ts']) {
        if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, context)
      }
    }
    return next(specifier, context)
  },
})

const here = dirname(fileURLToPath(import.meta.url))
const { drawBoard } = await import('../hooks/draw.ts')
const { drawSpine } = await import('../hooks/spine.ts')
const { FIXTURES } = await import('./fixtures.ts')
const { layoutProblems } = await import('./layout.ts')

const args = process.argv.slice(2)
const flag = (name: string): boolean => args.includes(name)
const valueOf = (name: string): string | undefined => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const only = valueOf('--only')?.split(',')
const positional = args.filter((a, at) => !a.startsWith('--') && args[at - 1] !== '--only')
const out = resolve(positional[0] ?? join(here, 'out'))

mkdirSync(join(out, 'svg'), { recursive: true })

type Drawn = { id: string; title: string; shape: 'tall' | 'wide'; file: string; svg: string; w: number; h: number; problems: string[] }
const drawn: Drawn[] = []
// Every fixture is drawn as the board and as the spine view; the spine's files start `spine-`.
const views = [
  { prefix: '', title: '', draw: (f: (typeof FIXTURES)[number], isWide: boolean) => drawBoard(f.board, isWide, f.names, f.now) },
  { prefix: 'spine-', title: 'Spine: ', draw: (f: (typeof FIXTURES)[number], isWide: boolean) => drawSpine(f.board, isWide, f.now, f.names) },
]
for (const view of views) {
  for (const f of FIXTURES) {
    const id = `${view.prefix}${f.id}`
    if (only !== undefined && !only.includes(id) && !only.includes(f.id)) continue
    for (const shape of ['tall', 'wide'] as const) {
      const svg = view.draw(f, shape === 'wide')
      const size = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
      const file = `${id}_${shape}`
      writeFileSync(join(out, 'svg', `${file}.svg`), svg)
      drawn.push({ id, title: `${view.title}${f.title}`, shape, file, svg, w: Number(size?.[1] ?? 440), h: Number(size?.[2] ?? 436), problems: layoutProblems(svg) })
    }
  }
}

// PNGs, from a Chrome or Edge already on the machine: nothing is installed for this.
const browser = [
  process.env.SIGNALBOX_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].find(p => p !== undefined && p !== '' && existsSync(p))

const page = (body: string, background = '#0b0f10'): string =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${background}}svg{display:block}</style></head><body>${body}</body></html>`

const shoot = (html: string, png: string, w: number, h: number, profile: string): Promise<void> =>
  new Promise(done => {
    const child = spawn(browser as string, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--force-device-scale-factor=2', `--window-size=${w},${h}`, `--screenshot=${png}`, pathToFileURL(html).href,
    ], { stdio: 'ignore' })
    child.on('exit', () => done())
    child.on('error', () => done())
  })

let pngNote = 'PNGs skipped (--no-png).'
if (!flag('--no-png')) {
  if (browser === undefined) {
    pngNote = 'No Chrome or Edge found, so no PNGs; set SIGNALBOX_BROWSER to one to get them.'
  } else {
    const tmp = join(out, '.shots')
    mkdirSync(join(out, 'png'), { recursive: true })
    mkdirSync(tmp, { recursive: true })
    const queue = [...drawn]
    const worker = async (n: number): Promise<void> => {
      for (let d = queue.shift(); d !== undefined; d = queue.shift()) {
        const html = join(tmp, `${d.file}.html`)
        writeFileSync(html, page(d.svg))
        await shoot(html, join(out, 'png', `${d.file}.png`), d.w, d.h, join(tmp, `profile-${n}`))
      }
    }
    await Promise.all([0, 1, 2, 3].map(worker))
    rmSync(tmp, { recursive: true, force: true })
    const made = drawn.filter(d => existsSync(join(out, 'png', `${d.file}.png`))).length
    pngNote = `${made} of ${drawn.length} PNGs drawn at 2x by ${browser}.`
  }
}

// One page: a row per fixture, tall beside wide, with what the check found under each.
const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const ids = [...new Set(drawn.map(d => d.id))]
const total = drawn.reduce((n, d) => n + d.problems.length, 0)
const rows = ids
  .map(id => {
    const pair = drawn.filter(d => d.id === id)
    const cells = pair
      .map(
        d =>
          `<figure><figcaption>${d.shape} · ${d.w}×${d.h}</figcaption>${d.svg}` +
          (d.problems.length === 0 ? '<p class="ok">layout check: clear</p>' : `<ul class="bad">${d.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`) +
          `</figure>`,
      )
      .join('')
    return `<section id="${id}"><h2>${esc(pair[0]?.title ?? id)} <code>${id}</code></h2><div class="pair">${cells}</div></section>`
  })
  .join('')
const sheet = `<!doctype html><html><head><meta charset="utf-8"><title>Signalbox renders</title><style>
body{margin:0;padding:24px;background:#1b2124;color:#d8e0de;font:13px/1.5 'Segoe UI',system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:28px 0 8px;font-weight:600}code{color:#8a9b98;font-weight:400;margin-left:6px}
.pair{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}figure{margin:0}figcaption{color:#8a9b98;font-size:12px;margin-bottom:6px}
svg{display:block}.ok{color:#7fb58a;margin:6px 0}.bad{color:#e08a7a;margin:6px 0;padding-left:18px;max-width:900px}.note{color:#8a9b98}
</style></head><body><h1>Signalbox renders</h1><p class="note">${drawn.length} boards from ${ids.length} fixtures, drawn by hooks/draw.ts with the fonts installed here. Layout check: ${total === 0 ? 'nothing found' : `${total} finding${total === 1 ? '' : 's'}`}. ${esc(pngNote)}</p>${rows}</body></html>`
writeFileSync(join(out, 'index.html'), sheet)

console.log(`${drawn.length} boards drawn to ${out}`)
console.log(pngNote)
console.log(`Page: ${join(out, 'index.html')}`)
for (const d of drawn) for (const p of d.problems) console.log(`  ${d.file}: ${p}`)
console.log(total === 0 ? 'Layout check: nothing found.' : `Layout check: ${total} finding${total === 1 ? '' : 's'}.`)
if (flag('--strict') && total > 0) process.exitCode = 1
