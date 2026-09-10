#!/usr/bin/env node
/**
 * Route-parity gate (C5, master prompt §Migration). Fetches every legacy route from the staged site with
 * JavaScript disabled and diffs the SEO surface against docs/baselines/seo-baseline.json.
 *
 *   node tools/parity/compare.mjs --base http://127.0.0.1:3000 [--json out.json] [--routes /,/geo-pricing/]
 *
 * Blocking (exit 1): status, <title>, meta description, canonical path, robots, og and twitter values,
 * exactly one identical h1, JSON-LD @type multiset, JSON-LD @id set, glossary anchors, internal links
 * (removals blocked; additions allowed; legacy hash routes count as present when their mapped URL is).
 * Advisory: word count outside ±5 % (blocking for routes listed in blueprint.parity.wordCountBlocking).
 * Accepted differences are declared in the blueprint (`parity.accept`) with a reason — never silently.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : [],
    )
    .filter((x) => x.length),
)
const base = String(args.base || process.env.E2E_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const root = resolve(import.meta.dirname, '../..')
const baseline = JSON.parse(readFileSync(resolve(root, 'docs/baselines/seo-baseline.json'), 'utf8')).sites[
  'syed-ai-site'
]
const blueprint = JSON.parse(
  readFileSync(resolve(root, 'apps/syed-ai/content/syed-ai.blueprint.json'), 'utf8'),
)
const routes = args.routes
  ? String(args.routes).split(',')
  : Object.keys(baseline).filter((r) => !r.endsWith('.html'))
const accept = blueprint.parity?.accept ?? [] // [{ route, field, value?, reason }]
const wordCountBlocking = new Set(blueprint.parity?.wordCountBlocking ?? [])
const LEGACY_ORIGIN = 'https://syed.ai'

const hashMap = blueprint.hashRoutes ?? {}
const mapLegacyLink = (href) => {
  const m = href.match(/^\/#case\/([a-z0-9-]+)$/)
  if (m) return `/work/${m[1]}/`
  if (href.startsWith('/#')) return hashMap[href.slice(1)] ?? href
  return href
}
const isAccepted = (route, field, value) =>
  accept.some((a) => a.route === route && a.field === field && (a.value === undefined || a.value === value))

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_EXECUTABLE })
const ctx = await browser.newContext({ javaScriptEnabled: false })
const report = { base, generatedAt: new Date().toISOString(), routes: {}, blocking: 0, advisory: 0 }

for (const route of routes) {
  const legacy = baseline[route]
  const page = await ctx.newPage()
  const res = await page.goto(base + route, { waitUntil: 'domcontentloaded' })
  const status = res?.status() ?? 0
  const live = await page.evaluate(() => {
    const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
    const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null
    const og = {}
    const tw = {}
    document
      .querySelectorAll('meta[property^="og:"]')
      .forEach((m) => (og[m.getAttribute('property')] = m.getAttribute('content')))
    document
      .querySelectorAll('meta[name^="twitter:"]')
      .forEach((m) => (tw[m.getAttribute('name')] = m.getAttribute('content')))
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => {
      try {
        const d = JSON.parse(s.textContent)
        return d['@graph'] ?? [d]
      } catch {
        return []
      }
    })
    const types = ld.flatMap((n) => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]))
    const nested = (o) => {
      let out = []
      if (Array.isArray(o)) o.forEach((x) => (out = out.concat(nested(x))))
      else if (o && typeof o === 'object') {
        if (o['@type']) out = out.concat(Array.isArray(o['@type']) ? o['@type'] : [o['@type']])
        for (const v of Object.values(o)) out = out.concat(nested(v))
      }
      return out
    }
    const allTypes = types.concat(ld.flatMap((n) => Object.values(n).flatMap(nested)))
    return {
      title: document.title,
      description: meta('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      robots: meta('meta[name="robots"]'),
      og,
      twitter: tw,
      h1: [...document.querySelectorAll('h1')].map((h) => norm(h.textContent)),
      jsonLdTypes: [...new Set(allTypes)].sort(),
      jsonLdIds: ld
        .map((n) => n['@id'])
        .filter(Boolean)
        .sort(),
      anchors: [...document.querySelectorAll('dl [id], .blk-glossary__item[id], article.term[id]')].map(
        (e) => e.id,
      ),
      internalLinks: [
        ...new Set(
          [...document.querySelectorAll('a[href]')]
            .map((a) => a.getAttribute('href'))
            .filter((h) => h.startsWith('/'))
            .map((h) => h.split('?')[0]),
        ),
      ].sort(),
      wordCount: norm(document.body.innerText).split(' ').filter(Boolean).length,
    }
  })
  await page.close()

  const findings = []
  const block = (field, expected, actual, note) =>
    findings.push({
      level: isAccepted(route, field, actual) ? 'accepted' : 'blocking',
      field,
      expected,
      actual,
      note,
    })
  const advise = (field, expected, actual, note) =>
    findings.push({ level: 'advisory', field, expected, actual, note })
  const L = legacy.noJs

  if (status !== legacy.status) block('status', legacy.status, status)
  if (live.title !== L.title) block('title', L.title, live.title)
  if (live.description !== L.description) block('description', L.description, live.description)
  const canonPath = (u) => (u ? u.replace(/^https?:\/\/[^/]+/, '') : u)
  if (canonPath(live.canonical) !== canonPath(L.canonical))
    block(
      'canonical',
      canonPath(L.canonical),
      canonPath(live.canonical),
      'origin ignored (staging vs production)',
    )
  if ((live.robots ?? '') !== (L.robots ?? '')) block('robots', L.robots, live.robots)
  for (const [k, v] of Object.entries(L.og ?? {})) {
    if (k === 'og:url') {
      if (canonPath(live.og[k]) !== canonPath(v)) block(`og:url`, canonPath(v), canonPath(live.og[k]))
      continue
    }
    if (k === 'og:image') {
      if (canonPath(live.og[k]) !== canonPath(v)) block('og:image', canonPath(v), canonPath(live.og[k]))
      continue
    }
    if ((live.og[k] ?? null) !== v) block(k, v, live.og[k] ?? null)
  }
  for (const [k, v] of Object.entries(L.twitter ?? {})) {
    if (k === 'twitter:image' || k === 'twitter:url') continue
    if ((live.twitter[k] ?? null) !== v) block(k, v, live.twitter[k] ?? null)
  }
  if (live.h1.length !== 1 || live.h1[0] !== L.h1[0]) block('h1', L.h1, live.h1)
  const legacyTypes = [...new Set(L.jsonLdTypes)].sort()
  const missingTypes = legacyTypes.filter((t) => !live.jsonLdTypes.includes(t))
  if (missingTypes.length)
    block('jsonLdTypes', legacyTypes, live.jsonLdTypes, `missing: ${missingTypes.join(', ')}`)
  const legacyIds = (legacy.legacyIds ?? blueprint.pages.find((p) => p.path === route)?.legacyJsonLd ?? [])
    .flatMap((g) => (g['@graph'] ?? [g]).map((n) => n['@id']).filter(Boolean))
    .map((id) => id.replace(LEGACY_ORIGIN, ''))
    .sort()
  const liveIds = live.jsonLdIds.map((id) => id.replace(/^https?:\/\/[^/]+/, '')).sort()
  const missingIds = legacyIds.filter((id) => !liveIds.includes(id))
  if (missingIds.length) block('jsonLdIds', legacyIds, liveIds, `missing: ${missingIds.join(', ')}`)
  if (route === '/glossary/') {
    const legacyAnchors =
      blueprint.pages
        .find((p) => p.path === route)
        ?.layout.find((b) => b.blockType === 'glossaryList')
        ?.terms.map((t) => t.anchor) ?? []
    const missingAnchors = legacyAnchors.filter((a) => !live.anchors.includes(a))
    if (missingAnchors.length || legacyAnchors.length !== 12)
      block('glossaryAnchors', legacyAnchors, live.anchors, `expected the 12 legacy anchors`)
  }
  const legacyLinks = (L.internalLinks ?? []).map(mapLegacyLink)
  const removed = legacyLinks.filter(
    (l) => !live.internalLinks.includes(l) && !live.internalLinks.includes(l.split('#')[0]),
  )
  if (removed.length)
    block('internalLinks', legacyLinks, live.internalLinks, `removed: ${removed.join(', ')}`)
  const drift = (live.wordCount - L.wordCount) / L.wordCount
  if (Math.abs(drift) > 0.05)
    (wordCountBlocking.has(route) ? block : advise)(
      'wordCount',
      L.wordCount,
      live.wordCount,
      `${(drift * 100).toFixed(1)} %`,
    )

  const blocking = findings.filter((f) => f.level === 'blocking').length
  const advisory = findings.filter((f) => f.level === 'advisory').length
  report.routes[route] = { status, findings, blocking, advisory }
  report.blocking += blocking
  report.advisory += advisory
}
await browser.close()

// Plain-English report
for (const [route, r] of Object.entries(report.routes)) {
  const ok = r.blocking === 0
  console.log(
    `${ok ? '✔' : '✖'} ${route}  (${r.blocking} blocking, ${r.advisory} advisory, ${r.findings.filter((f) => f.level === 'accepted').length} accepted)`,
  )
  for (const f of r.findings) {
    const tag = f.level === 'blocking' ? 'BLOCK' : f.level === 'advisory' ? 'advise' : 'accepted'
    const show = (v) =>
      typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.length}]` : JSON.stringify(v)
    console.log(
      `    ${tag.padEnd(8)} ${f.field}: expected ${show(f.expected)} got ${show(f.actual)}${f.note ? ` — ${f.note}` : ''}`,
    )
  }
}
console.log(
  `\n${report.blocking === 0 ? 'PARITY OK' : 'PARITY FAILED'} — ${report.blocking} blocking, ${report.advisory} advisory across ${routes.length} routes`,
)
if (args.json) writeFileSync(String(args.json), JSON.stringify(report, null, 2))
process.exit(report.blocking === 0 ? 0 : 1)
