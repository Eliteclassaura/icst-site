/**
 * Pre-cutover QA sweep (Control Tower brief H2O_CUTOVER_PREP_MAIN_BRIEF_R1, 2026-10-05). Read-only; rerunnable against any origin.
 *
 *   pnpm exec tsx ops/qa/cutover-sweep.mjs --origin=https://staging.h2ocooling.org --out=<dir> [--yoast=<SNAPSHOT.tsv>]
 *       [--policy=private|production] [--preview] [--browser=40] [--browser-urls=/a/,/b/] [--no-assets] [--rps=4] [--limit=N]
 *
 * Inputs: the sitemap (the admin preview with --preview, else the public /sitemap_index.xml; when that is not served, the
 * release's expected sitemap from the repository), every redirect source (ops/seo-pass/data/redirects.tsv and the release
 * ledger), every 410 path (ops/seo-pass/data/gone.tsv), and the Yoast snapshot when given.
 * --preview needs an admin session supplied by Commander: H2O_SEO_ADMIN_EMAIL + H2O_SEO_ADMIN_PASSWORD (as parity.ts), or
 * H2O_SWEEP_ADMIN_TOKEN. They are read from the environment only and never printed or written.
 *
 * Behaviour: GET and HEAD only (the preview login is the one POST, and only with --preview); never requests /crm, /admin or
 * /api except the preview route; never submits a form or clicks; one shared limiter of ≤ 4 requests/second covers every
 * request, the browser sample's same-origin requests included. Outputs sweep.json and sweep.md in --out.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GONE_PATHS, NOINDEX_FOLLOW_PATHS } from '../../src/content/config.ts'
import { sitemapEntries } from '../../src/content/sitemap.ts'
import { allowedPath, brokenAssets, classify, decode, internalTarget, keyOf, parsePage, reciprocity, summaryMarkdown } from './sweep-lib.mjs'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const flag = (n) => process.argv.includes(`--${n}`)
const ORIGIN = arg('origin')?.replace(/\/+$/, '')
const OUT = arg('out')
if (!ORIGIN || !OUT) throw new Error('usage: cutover-sweep.mjs --origin=<url> --out=<dir> [--yoast=<tsv>] [--policy=private|production] [--preview] [--browser=40] [--no-assets]')
const HOST = new URL(ORIGIN).host
const PUBLIC_ORIGIN = 'https://h2ocooling.com'
const POLICY = arg('policy') ?? (HOST === 'h2ocooling.com' || HOST === 'www.h2ocooling.com' ? 'production' : 'private')
const RPS = Math.min(Number(arg('rps') ?? 4), 4)
const LIMIT = Number(arg('limit') ?? Infinity)
const BROWSER = Number(arg('browser') ?? 40)
const UA = 'H2O-cutover-sweep/1 (read-only)'
const HOSTS = new Set([HOST, 'h2ocooling.com', 'www.h2ocooling.com'])

/* ---------- one limiter for every request ---------- */
let next = 0
let requests = 0
const slot = async () => {
  const now = Date.now()
  const at = Math.max(now, next)
  next = at + 1000 / RPS
  if (at > now) await new Promise((r) => setTimeout(r, at - now))
  requests++
}
/** The origin's URL for a site path (sitemap and ledger URLs name the public origin). */
const onOrigin = (u) => {
  const x = new URL(u, ORIGIN)
  return HOSTS.has(x.host) ? ORIGIN + x.pathname + x.search : x.href
}
let token = null
const authHeaders = () => (token ? { Authorization: `JWT ${token}` } : {})
async function request(url, method = 'GET') {
  const p = new URL(url).pathname
  if (!allowedPath(p, { preview: Boolean(token) })) throw new Error(`refused private path ${p}`)
  await slot()
  const preview = /^\/api\/sitemap-preview\//.test(p)
  return fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(30_000), headers: { 'user-agent': UA, ...(preview ? authHeaders() : {}) } })
}

/* ---------- observations (cached per URL) ---------- */
const observed = new Map()
async function observe(raw) {
  const start = onOrigin(raw)
  if (observed.has(start)) return observed.get(start)
  const hops = []
  let url = start
  let page = null
  let headers = {}
  for (let i = 0; i < 6; i++) {
    let res
    try {
      res = await request(url)
    } catch (e) {
      hops.push({ status: 0, error: String(e.message).slice(0, 80) })
      break
    }
    const location = res.headers.get('location')
    hops.push({ status: res.status, location: location ?? undefined })
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel()
      const nextUrl = new URL(location, url)
      if (!HOSTS.has(nextUrl.host)) break
      url = onOrigin(nextUrl.href)
      continue
    }
    headers = { 'x-robots-tag': res.headers.get('x-robots-tag') ?? '', 'content-type': res.headers.get('content-type') ?? '' }
    if (res.status === 200 && /text\/html/.test(headers['content-type'])) page = parsePage(await res.text())
    else await res.body?.cancel()
    break
  }
  const o = { hops, page, headers, finalUrl: url }
  observed.set(start, o)
  return o
}

/* ---------- inputs ---------- */
const tsv = (f) => {
  const [head, ...lines] = readFileSync(f, 'utf8').replace(/\r/g, '').trim().split('\n')
  const cols = head.split('\t')
  return lines.filter(Boolean).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])))
}
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8'))
const locale = JSON.parse(readFileSync(path.join(APP, 'content/locale/sitemap-locale.json'), 'utf8'))
const rows = new Map(ledger.routes.map((r) => [keyOf(r.path), r]))
const batchRedirects = tsv(path.join(APP, 'ops/seo-pass/data/redirects.tsv'))
const redirectSources = new Map()
for (const r of ledger.redirects) redirectSources.set(keyOf(r.source), { source: r.source, destination: r.destination, status: r.status })
for (const r of batchRedirects) redirectSources.set(keyOf(r.source), { source: r.source, destination: r.destination, status: Number(r.status) })
const gone = tsv(path.join(APP, 'ops/seo-pass/data/gone.tsv')).map((g) => g.path + (g.query ?? ''))
const yoast = arg('yoast') ? tsv(arg('yoast')).map((y) => y.loc) : []

async function sitemapUrls() {
  const unescape = (v) => v.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&')
  const notes = []
  const read = async (u) => {
    const res = await request(u)
    const body = res.status === 200 ? await res.text() : (await res.body?.cancel(), '')
    return { status: res.status, body }
  }
  if (flag('preview')) {
    const email = process.env.H2O_SEO_ADMIN_EMAIL
    const password = process.env.H2O_SEO_ADMIN_PASSWORD
    token = process.env.H2O_SWEEP_ADMIN_TOKEN ?? null
    if (!token) {
      if (!email || !password) throw new Error('--preview needs H2O_SWEEP_ADMIN_TOKEN or H2O_SEO_ADMIN_EMAIL/H2O_SEO_ADMIN_PASSWORD in the environment')
      await slot()
      const login = await fetch(`${ORIGIN}/api/users/login/`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': UA }, body: JSON.stringify({ email, password }) })
      token = (await login.json().catch(() => null))?.token ?? null
      if (login.status !== 200 || !token) throw new Error(`admin login failed (${login.status})`)
    }
    const index = await read(`${ORIGIN}/api/sitemap-preview/`)
    if (index.status !== 200) throw new Error(`preview index answered ${index.status}`)
    const names = [...index.body.matchAll(/<sitemap><loc>([^<]+)<\/loc>/g)].map((m) => new URL(unescape(m[1])).pathname.slice(1))
    const locs = []
    for (const n of names) {
      const child = await read(`${ORIGIN}/api/sitemap-preview/?file=${encodeURIComponent(n)}`)
      locs.push(...[...child.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => unescape(m[1])))
    }
    return { source: `admin preview (${names.length} children)`, locs, notes }
  }
  const index = await read(`${ORIGIN}/sitemap_index.xml`)
  const names = [...index.body.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)].map((m) => unescape(m[1]))
  if (index.status === 200 && names.length) {
    const locs = []
    for (const n of names) {
      const child = await read(onOrigin(n))
      locs.push(...[...child.body.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map((m) => unescape(m[1])))
    }
    return { source: `public sitemap (${names.length} children)`, locs, notes }
  }
  // Private policy serves no public sitemap: sweep the release's expected sitemap instead (production policy, repository data).
  notes.push(`public /sitemap_index.xml answered ${index.status}${index.status === 200 ? ' with no children' : ''}; swept the repository's expected sitemap instead`)
  const redirected = new Set([...redirectSources.keys()])
  const entries = sitemapEntries({ rows: ledger.routes, origin: PUBLIC_ORIGIN, redirected, gone: GONE_PATHS, noindexFollow: NOINDEX_FOLLOW_PATHS, locale })
  return { source: 'repository expected sitemap (no public sitemap served)', locs: entries.map((e) => e.loc), notes, indexStatus: index.status }
}

/** What the authority says a served page must carry. */
function expectFor(finalUrl) {
  const key = keyOf(finalUrl)
  const row = rows.get(key)
  const lang = locale.contentLanguages?.[key] ?? locale.languages?.[key] ?? 'en'
  let robots
  if (row) robots = row.state === 'PUBLIC' && NOINDEX_FOLLOW_PATHS.has(row.path) ? 'noindex,follow' : row.indexable ? 'index' : 'noindex'
  return { canonical: row?.canonical, lang, robots }
}

/* ---------- run ---------- */
async function main() {
  mkdirSync(OUT, { recursive: true })
  const startedAt = new Date().toISOString()
  const findings = []
  const sm = await sitemapUrls()
  if (sm.indexStatus !== undefined && POLICY === 'production') findings.push({ class: 'SITEMAP_INDEX_NOT_SERVED', severity: 'fail', url: `${ORIGIN}/sitemap_index.xml`, detail: String(sm.indexStatus) })
  const robotsTxt = await (async () => {
    const res = await request(`${ORIGIN}/robots.txt`)
    const body = res.status === 200 ? await res.text() : ''
    if (res.status !== 200) findings.push({ class: 'ROBOTS_TXT_NOT_SERVED', severity: 'fail', url: `${ORIGIN}/robots.txt`, detail: String(res.status) })
    else if (POLICY === 'production' && /^\s*disallow:\s*\/\s*$/im.test(body)) findings.push({ class: 'ROBOTS_TXT_BLOCKS_ALL', severity: 'fail', url: `${ORIGIN}/robots.txt`, detail: 'Disallow: /' })
    else if (POLICY === 'production' && !/sitemap_index\.xml/i.test(body)) findings.push({ class: 'ROBOTS_TXT_NO_SITEMAP', severity: 'warn', url: `${ORIGIN}/robots.txt`, detail: '' })
    return { status: res.status, bytes: body.length }
  })()
  const work = [
    ...sm.locs.map((u) => ({ url: u, role: 'sitemap' })),
    ...[...redirectSources.values()].map((r) => ({ url: r.source, role: 'redirect', expect: { redirectTo: r.destination, status: r.status } })),
    ...gone.map((g) => ({ url: g, role: 'gone' })),
    ...yoast.map((u) => ({ url: u, role: 'yoast' })),
  ].slice(0, LIMIT)
  const sets = new Map()
  const assets = new Map()
  let done = 0
  for (const w of work) {
    const p = new URL(w.url, ORIGIN).pathname
    if (!allowedPath(p)) {
      findings.push({ class: 'SKIPPED_PRIVATE_PATH', severity: 'info', url: w.url, detail: w.role })
      continue
    }
    const o = await observe(w.url)
    const expect = { ...expectFor(o.finalUrl), ...(w.expect ?? {}) }
    findings.push(...classify(w.url, w.role, o, expect, POLICY))
    if (o.page) {
      const k = keyOf(o.finalUrl)
      if (!sets.has(k)) {
        sets.set(k, o.page.alternates)
        for (const [list, kind] of [[o.page.anchors, 'link'], [o.page.images, 'image'], [o.page.headMedia, 'image']]) // R2.3: head media must serve 200 too
          for (const raw of list) {
            const t = internalTarget(raw, o.finalUrl, HOSTS)
            if (!t) continue
            const a = assets.get(t) ?? { kind, from: [] }
            if (a.from.length < 3) a.from.push(decode(k))
            assets.set(t, a)
          }
      }
    }
    if (++done % 100 === 0) process.stderr.write(`… ${done}/${work.length} URLs, ${requests} requests\n`)
  }
  // A page body is classified once per final URL; duplicate findings from overlapping inputs (Yoast ∩ sitemap) collapse.
  findings.push(...reciprocity(sets))
  if (!flag('no-assets')) {
    const results = new Map()
    for (const [t, a] of assets) {
      if (!allowedPath(t.split('?')[0])) continue
      const known = observed.get(ORIGIN + t)
      let status = known?.hops[0]?.status ?? 0
      if (!known) try {
        let res = await request(ORIGIN + t, 'HEAD')
        if (res.status === 405) res = await request(ORIGIN + t, 'GET')
        await res.body?.cancel()
        status = res.status
      } catch {
        status = 0
      }
      results.set(t, { ...a, status })
      if (status >= 300 && status < 400 && a.kind === 'link') findings.push({ class: 'INTERNAL_LINK_REDIRECTS', severity: 'warn', url: t, detail: `${status} (on ${a.from[0]})` })
    }
    findings.push(...brokenAssets(results))
  }
  const browser = BROWSER > 0 ? await browserSample(sm.locs, findings) : null
  const unique = []
  const seen = new Set()
  for (const f of findings) {
    const id = `${f.class}\u0000${keyOf(f.url)}\u0000${f.detail}`
    if (seen.has(id)) continue
    seen.add(id)
    unique.push(f)
  }
  const report = {
    origin: ORIGIN,
    policy: POLICY,
    preview: Boolean(token),
    rps: RPS,
    startedAt,
    finishedAt: new Date().toISOString(),
    requests,
    sitemapSource: sm.source,
    notes: sm.notes,
    robotsTxt,
    inputs: { sitemap: sm.locs.length, redirects: redirectSources.size, gone: gone.length, yoast: yoast.length, 'pages parsed': sets.size, 'links/images checked': assets.size },
    findings: unique,
    browser,
  }
  writeFileSync(path.join(OUT, 'sweep.json'), JSON.stringify(report, null, 1) + '\n')
  writeFileSync(path.join(OUT, 'sweep.md'), summaryMarkdown(report) + (sm.notes.length ? `\nNotes:\n${sm.notes.map((n) => `- ${n}`).join('\n')}\n` : ''))
  const fails = unique.filter((f) => f.severity === 'fail').length
  process.stdout.write(`sweep: ${requests} requests, ${unique.length} findings (${fails} fail) → ${OUT}/sweep.md\n`)
}

/** ~N sitemap URLs spread across templates (route class) and languages, deterministic. */
export function sampleUrls(locs, n) {
  const groups = new Map()
  for (const u of locs) {
    const k = keyOf(u)
    const row = rows.get(k)
    const g = `${row?.routeClass ?? 'other'}|${locale.languages?.[k] ?? 'en'}`
    groups.set(g, [...(groups.get(g) ?? []), u])
  }
  const out = []
  const lists = [...groups.values()]
  for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i])
  return out
}

async function browserSample(locs, findings) {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    return { pages: 0, consoleErrors: 0, overflow: 0, skipped: 'playwright not installed' }
  }
  // --browser-urls pins pages into the sample (comma-separated paths), ahead of the spread across templates and languages.
  const pinned = (arg('browser-urls') ?? '').split(',').filter(Boolean)
  const urls = [...pinned, ...sampleUrls(locs, Math.max(BROWSER - pinned.length, 0))]
  const b = await chromium.launch()
  let consoleErrors = 0
  let overflow = 0
  try {
    for (const width of [390, 1440]) {
      const ctx = await b.newContext({ viewport: { width, height: 900 }, userAgent: UA, serviceWorkers: 'block' })
      await ctx.route('**/*', async (route) => {
        const r = route.request()
        const u = new URL(r.url())
        if (!HOSTS.has(u.host)) return route.continue()
        if (!['GET', 'HEAD'].includes(r.method()) || !allowedPath(u.pathname) || u.host !== HOST) return route.abort()
        await slot()
        return route.continue()
      })
      for (const u of urls) {
        const page = await ctx.newPage()
        const errors = []
        page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text().slice(0, 160)}${m.location()?.url ? ` (${m.location().url.slice(0, 160)})` : ''}`))
        page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
        try {
          await page.goto(onOrigin(u), { waitUntil: 'load', timeout: 45_000 })
          await page.waitForTimeout(800)
          const over = await page.evaluate(() => {
            const d = document.documentElement
            if (d.scrollWidth <= d.clientWidth + 1) return null
            const wide = [...document.body.querySelectorAll('*')].find((el) => el.getBoundingClientRect().right > d.clientWidth + 1)
            return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, el: wide ? wide.tagName.toLowerCase() + (wide.className && typeof wide.className === 'string' ? '.' + wide.className.split(/\s+/)[0] : '') : '' }
          })
          if (over) {
            overflow++
            findings.push({ class: `OVERFLOW_${width}`, severity: 'fail', url: u, detail: `${over.scrollWidth}>${over.clientWidth} ${over.el}` })
          }
        } catch (e) {
          errors.push(`navigation: ${String(e.message).split('\n')[0].slice(0, 120)}`)
        }
        for (const e of errors) findings.push({ class: `CONSOLE_ERROR_${width}`, severity: 'fail', url: u, detail: e })
        consoleErrors += errors.length
        await page.close()
      }
      await ctx.close()
    }
  } finally {
    await b.close()
  }
  return { pages: urls.length, consoleErrors, overflow }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main()
