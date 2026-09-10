#!/usr/bin/env node
/**
 * `pnpm preview:pack` — the client-facing approval pack (C5.5 workstreams D, G, I; ADR-026 §5).
 *
 *   node tools/design-pack/pack.mjs --site syed-ai --pages /,/geo-pricing/ [--base http://localhost:3000]
 *                                   [--viewports 390,1440] [--out <dir>]
 *
 * Screenshots come from a **running** site, never from the blueprint file: before launch that site
 * is seeded from the blueprint, after launch the CMS is the authority, so one path serves both and
 * a pack can never show copy the site does not have.
 *
 * The pack is a design canvas — one `.dc.html` artboard per page and per component card — plus a
 * paginated PDF and a `pack-manifest.json` the `design-pack` skill reads before publishing. Every
 * artboard is checked with the same markup policy the bundle uses, and every one records the
 * viewport it is faithful at.
 */
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : fallback
}
const die = (m) => {
  console.error(`✖ ${m}`)
  process.exit(1)
}

const site = flag('site') ?? die('preview:pack needs --site <client>')
const base = (flag('base', 'http://localhost:3000') ?? '').replace(/\/$/, '')
// ADR-026 §5: a client pack shows the two review widths. The five-viewport sweep is automated QA
// (`design-qa.spec.ts`), not something a client reads — ten full-page screenshots per page make a
// pack nobody can open. `--viewports` overrides when a specific width is under discussion.
const viewports = (flag('viewports', '390,1440') ?? '')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v > 0)
const pages = (flag('pages', '/') ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => (p.startsWith('/') ? p : `/${p}`))

const sha = (b) => createHash('sha256').update(b).digest('hex')
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
const slugOf = (p) =>
  p === '/'
    ? 'home'
    : p
        .replace(/^\/|\/$/g, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .toLowerCase()

// Same refusals the bundle applies to its own cards; a pack artboard is the same kind of artefact.
const MARKUP_RULES = [
  ['script-element', /<\s*script\b/i],
  ['event-handler', /<[^>]*?\son[a-z]+\s*=/i],
  ['embed-element', /<\s*(iframe|frame|object|embed|applet)\b/i],
  ['external-resource', /(?:\ssrc|\sposter)\s*=\s*["']?(?:https?:)?\/\//i],
  ['import-directive', /@import\b/i],
]

const bundleDir = join(root, 'apps', site, 'design/ds-bundle')
const manifestPath = join(bundleDir, '_factory/manifest.json')
if (!existsSync(manifestPath))
  die(`no design bundle for ${site}; run pnpm design:bundle --site ${site} first`)
const bundleManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const gatesPath = join(bundleDir, '_factory/gates.json')
const gates = existsSync(gatesPath)
  ? JSON.parse(readFileSync(gatesPath, 'utf8'))
  : { residue: false, renderCheck: false }

const outDir = flag('out')
  ? resolve(flag('out'))
  : join(
      root,
      'apps',
      site,
      'design/packs',
      `${new Date().toISOString().slice(0, 10)}-${bundleManifest.contractHash.slice(0, 8)}`,
    )
rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'pages'), { recursive: true })
mkdirSync(join(outDir, 'pack/artboards'), { recursive: true })

const findings = []
const artboards = []

/** An artboard: a self-contained document the canvas lays out, carrying its own viewport. */
function artboard({ name, group, viewport, body, style = '' }) {
  return `<!-- @artboard group="${escapeHtml(group)}" name="${escapeHtml(name)}" viewport="${viewport}" -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${viewport}, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="robots" content="noindex">
<title>${escapeHtml(name)}</title>
<style>:root{color-scheme:only light}body{margin:0;background:#0e0c09;color:#f7f5f0;font:14px/1.5 system-ui,sans-serif}
.ab{padding:24px}.ab h1{font:600 16px/1.3 system-ui,sans-serif;margin:0 0 4px}.ab p{margin:0 0 16px;opacity:.72}
.ab img{display:block;inline-size:100%;block-size:auto;border:1px solid #241f17}${style}</style>
</head>
<body><main class="ab">${body}</main></body>
</html>
`
}

function writeArtboard(rel, html, kind, viewport) {
  for (const [rule, re] of MARKUP_RULES)
    if (re.test(html)) findings.push({ rule, detail: `${rel}: ${rule}`, blocking: true })
  const target = join(outDir, rel)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, html)
  artboards.push({ path: rel, kind, viewport, bytes: Buffer.byteLength(html), sha256: sha(html) })
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_EXECUTABLE })
try {
  // 1× JPEG, not 2× PNG: a five-viewport pack of full-page screenshots at 2× runs to hundreds of
  // megabytes, which no client opens and no artifact hosts. 85% at 1× is what a design review
  // actually needs, and it keeps the whole pack in the tens of megabytes.
  const context = await browser.newContext({ deviceScaleFactor: 1 })
  const page = await context.newPage()

  for (const path of pages) {
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 })
      let res
      try {
        res = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30_000 })
      } catch (e) {
        die(`could not reach ${base}${path} — a pack renders from a running site (${String(e).slice(0, 80)})`)
      }
      if (!res || res.status() !== 200)
        die(
          `${base}${path} answered ${res ? res.status() : 'nothing'}; a pack renders only from a healthy site`,
        )

      const shot = join(outDir, 'pages', `${slugOf(path)}-${width}.jpg`)
      await page.screenshot({ path: shot, fullPage: true, type: 'jpeg', quality: 85 })
      const bytes = readFileSync(shot)

      // A page screenshot is embedded as a data URL so the artboard stays self-contained.
      const dataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`
      writeArtboard(
        `pack/artboards/page-${slugOf(path)}-${width}.dc.html`,
        artboard({
          name: `${path} · ${width}`,
          group: 'Pages',
          viewport: width,
          body: `<h1>${escapeHtml(path)}</h1><p>${escapeHtml(base + path)} · ${width}px · contract ${escapeHtml(bundleManifest.contractHash.slice(0, 12))}</p><img alt="${escapeHtml(path)} at ${width} pixels wide" src="${dataUrl}">`,
        }),
        'page-screenshot',
        width,
      )
      artboards.push({
        path: relative(outDir, shot).split('\\').join('/'),
        kind: 'page-screenshot',
        viewport: width,
        bytes: bytes.length,
        sha256: sha(bytes),
      })
    }
  }

  // Component cards come straight from the bundle: the pack shows what the bundle proved, not a
  // second rendering that could disagree with it.
  for (const rel of Object.keys(bundleManifest.files)
    .filter((f) => f.endsWith('.html'))
    .sort()) {
    const html = readFileSync(join(bundleDir, rel), 'utf8')
    if (sha(html) !== bundleManifest.files[rel])
      findings.push({
        rule: 'bundle-drift',
        detail: `${rel} does not match the bundle manifest`,
        blocking: true,
      })
    const viewport = Number(/viewport="(\d+)"/.exec(html)?.[1] ?? 1440)
    const target = `pack/artboards/card-${rel.replace(/[/.]/g, '-')}.dc.html`
    mkdirSync(dirname(join(outDir, target)), { recursive: true })
    writeFileSync(join(outDir, target), html)
    artboards.push({
      path: target,
      kind: 'component-card',
      viewport,
      bytes: Buffer.byteLength(html),
      sha256: sha(html),
    })
  }

  // Index: the page the design-pack skill publishes as the Artifact.
  const groups = { Pages: [], Components: [] }
  for (const a of artboards.filter((x) => x.path.endsWith('.dc.html') || x.path.endsWith('.html')))
    (a.kind === 'page-screenshot' ? groups.Pages : groups.Components).push(a)
  const list = (items) =>
    items
      .map(
        (a) =>
          `<li><code>${escapeHtml(a.path)}</code> — ${a.viewport}px · ${(a.bytes / 1024).toFixed(0)} KiB · <code>${escapeHtml(a.sha256.slice(0, 12))}</code></li>`,
      )
      .join('')
  writeArtboard(
    'pack/index.html',
    artboard({
      name: `${site} design pack`,
      group: 'Pack',
      viewport: 1440,
      body:
        `<h1>${escapeHtml(site)} — design pack</h1>` +
        `<p>contract ${escapeHtml(bundleManifest.contractHash.slice(0, 12))} · registry ${escapeHtml(bundleManifest.registryVersion)} · identity ${escapeHtml(bundleManifest.brand)}</p>` +
        `<h2>Pages</h2><ul>${list(groups.Pages)}</ul>` +
        `<h2>Components and foundations</h2><ul>${list(groups.Components)}</ul>` +
        `<p>Every artboard is faithful at the viewport it names. Comment on the thread; write <strong>APPROVED</strong> to approve.</p>`,
    }),
    'artboard',
    1440,
  )

  // PDF: one stamped page per page screenshot, printed from a local document (no network).
  const pdfBody = pages
    .flatMap((path) =>
      viewports.map((width) => {
        const file = join(outDir, 'pages', `${slugOf(path)}-${width}.jpg`)
        const url = pathToFileURL(file).href
        return `<section><header><strong>${escapeHtml(path)}</strong> · ${escapeHtml(base + path)} · ${width}px · contract ${escapeHtml(bundleManifest.contractHash.slice(0, 12))} · ${escapeHtml(new Date().toISOString().slice(0, 10))}</header><img alt="${escapeHtml(path)} at ${width}px" src="${escapeHtml(url)}"></section>`
      }),
    )
    .join('')
  const pdfDoc = join(outDir, 'pack', 'print.html')
  writeFileSync(
    pdfDoc,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(site)} pack</title>
<style>body{margin:0;font:12px/1.4 system-ui,sans-serif}section{break-after:page;padding:16px}
header{margin-bottom:8px;color:#444}img{inline-size:100%;block-size:auto;border:1px solid #ccc}</style>
</head><body>${pdfBody}</body></html>`,
  )
  const printer = await context.newPage()
  await printer.goto(pathToFileURL(pdfDoc).href, { waitUntil: 'load' })
  await printer.pdf({
    path: join(outDir, 'pack.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  })
  rmSync(pdfDoc)
  const pdfBytes = readFileSync(join(outDir, 'pack.pdf'))
  artboards.push({
    path: 'pack.pdf',
    kind: 'artboard',
    viewport: 0,
    bytes: pdfBytes.length,
    sha256: sha(pdfBytes),
  })

  await context.close()
} finally {
  await browser.close()
}

// Residue over everything the pack will hand over, using the bundle's own gate result plus a
// direct check of the pack directory for the client's *other* siblings.
const otherClients = readdirSync(join(root, 'apps'))
  .filter((c) => c !== site && existsSync(join(root, 'apps', c, 'design/fixture-brand.json')))
  .flatMap((c) => {
    const b = JSON.parse(readFileSync(join(root, 'apps', c, 'design/fixture-brand.json'), 'utf8'))
    return [b.siteName, b.personName].filter((x) => typeof x === 'string' && x.length > 3)
  })
for (const rel of artboards.filter((a) => a.path.endsWith('.html'))) {
  const text = readFileSync(join(outDir, rel.path), 'utf8')
  for (const lit of otherClients)
    if (text.toLowerCase().includes(lit.toLowerCase()))
      findings.push({ rule: 'cross-client-leak', detail: `${rel.path} contains "${lit}"`, blocking: true })
}

// A pack a client cannot open is not a pack; flag it before it is published rather than after.
const PACK_SIZE_ADVISORY = 60 * 1024 * 1024
const totalBytes = artboards.reduce((n, a) => n + a.bytes, 0)
if (totalBytes > PACK_SIZE_ADVISORY)
  findings.push({
    rule: 'pack-large',
    detail: `pack is ${(totalBytes / 1024 / 1024).toFixed(0)} MB; trim the viewport list or the page list before publishing`,
    blocking: false,
  })

const blocking = findings.filter((f) => f.blocking).length
const packManifest = {
  packVersion: 1,
  site,
  base,
  pages,
  viewports,
  contractHash: bundleManifest.contractHash,
  registryVersion: bundleManifest.registryVersion,
  revision: bundleManifest.contractHash.slice(0, 12),
  brand: bundleManifest.brand,
  fonts: bundleManifest.fonts,
  bundleGates: gates,
  residue: { ok: !findings.some((f) => f.rule === 'cross-client-leak'), checked: otherClients.length },
  bytes: artboards.reduce((n, a) => n + a.bytes, 0),
  blocking,
  advisory: findings.length - blocking,
  findings,
  artboards: artboards.sort((a, b) => (a.path < b.path ? -1 : 1)),
}
writeFileSync(join(outDir, 'pack-manifest.json'), JSON.stringify(packManifest, null, 2) + '\n')

for (const f of findings) console.error(`${f.blocking ? '✖' : '•'} [${f.rule}] ${f.detail}`)
console.error(
  `${blocking ? '✖' : '✔'} pack ${site}: ${pages.length} page(s) × ${viewports.length} viewport(s), ${artboards.length} artefacts → ${relative(root, outDir)}`,
)
if (!gates.residue || !gates.renderCheck)
  console.error(
    '• the bundle gates are not both green for this bundle; design-pack will refuse to publish until they are',
  )
process.exit(blocking ? 1 : 0)
