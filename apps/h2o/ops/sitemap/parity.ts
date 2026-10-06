/**
 * Sitemap parity against the live Yoast sitemap (CT sitemap brief, "Proof"). Read-only.
 *
 *   Offline (repository authorities, the state after the applied batch):
 *     pnpm exec tsx ops/sitemap/parity.ts --yoast=<SNAPSHOT.tsv> --part-a=<PART_A.tsv> --out=<dir>
 *   Hosted (a running app; the R1.2 rehearsal copy runs with H2O_INDEXING_POLICY=production on 127.0.0.1):
 *     H2O_SEO_ADMIN_EMAIL=… H2O_SEO_ADMIN_PASSWORD=… pnpm exec tsx ops/sitemap/parity.ts --origin=<url> --yoast=… --part-a=… --out=<dir>
 *     (--emitted-only: only the preview read-back and the emitted-URL checks, for a private-policy surface such as staging)
 *
 * Every Yoast URL is reconciled to exactly one class:
 *   IN_SITEMAP · REDIRECT_TO_SITEMAP (301 hops ending at a listed URL) · GONE_410 · NOINDEX (served, deliberately not
 *   indexed) · LOCALE_PENDING (OGCS Part A decides a state Locale Part B has not applied yet) · UNACCOUNTED.
 * Exit 0 only with 0 UNACCOUNTED, every listed URL serving 200 and self-canonical, hreflang reciprocal, and (hosted)
 * the preview refusing anonymous requests with 404.
 * Outputs: sitemap-parity.tsv (Yoast URL → class), sitemap-new-urls.tsv (listed, not in Yoast, with a reason),
 * sitemap-parity-summary.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { completeMfa } from '../mfa/sign-in.mjs'
import { GONE_PATHS, NOINDEX_FOLLOW_PATHS, PUBLIC_ORIGIN, isNoindexFollow } from '../../src/content/config'
import { pathKey, sitemapEntries, type HreflangMember, type LocaleData, type SitemapEntry, type SitemapLedgerRow } from '../../src/content/sitemap'

type Row = SitemapLedgerRow & { routeId: string; indexable?: boolean; redirect?: string | null }
type Hop = { status: number; location?: string }
type Observation = { hops: Hop[]; robots: string | null; canonical: string | null }
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const tsv = (f: string) => {
  const [head, ...lines] = readFileSync(f, 'utf8').replace(/\r/g, '').trim().split('\n')
  const cols = head!.split('\t')
  return lines.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])) as Record<string, string>)
}
const keyOfUrl = (u: string) => pathKey(new URL(u, PUBLIC_ORIGIN).pathname)

const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Row[]; redirects: Array<{ source: string; destination: string; status: number }> }
const locale = JSON.parse(readFileSync(path.join(APP, 'content/locale/sitemap-locale.json'), 'utf8')) as LocaleData
const rowByKey = new Map(ledger.routes.map((r) => [pathKey(r.path), r]))

/** The proxy's redirect table after the applied batch: the release redirects, the batch redirects, minus the retired. */
function redirectTable(): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of ledger.redirects) map.set(pathKey(r.source), r.destination)
  const data = path.join(APP, 'ops/seo-pass/data')
  for (const r of tsv(path.join(data, 'redirects.tsv'))) map.set(pathKey(r.source!), r.destination!)
  for (const r of tsv(path.join(data, 'redirects-retired.tsv'))) map.delete(pathKey(r.source!))
  for (const r of ledger.routes) if (r.state === 'REDIRECT' && r.redirect && !map.has(pathKey(r.path))) map.set(pathKey(r.path), r.redirect)
  return map
}

/** Offline observation: what the proxy and page answer for a path, from the authorities. */
function offlineObserve(redirects: Map<string, string>) {
  return async (url: string): Promise<Observation> => {
    const hops: Hop[] = []
    let key = keyOfUrl(url)
    for (let i = 0; i < 6; i++) {
      if (GONE_PATHS.has(key)) return { hops: [...hops, { status: 410 }], robots: 'noindex, nofollow', canonical: null }
      const to = redirects.get(key)
      if (to) {
        hops.push({ status: 301, location: to })
        key = keyOfUrl(to)
        continue
      }
      const row = rowByKey.get(key)
      if (!row || row.state !== 'PUBLIC') return { hops: [...hops, { status: 404 }], robots: null, canonical: null }
      const robots = isNoindexFollow(row.path, row.indexable) ? 'noindex, follow' : row.indexable ? null : 'noindex, nofollow'
      return { hops: [...hops, { status: 200 }], robots, canonical: row.canonical || PUBLIC_ORIGIN + row.path }
    }
    return { hops, robots: null, canonical: null }
  }
}

/** Hosted observation: manual-redirect requests against the running app (Location followed on the same origin). */
function hostedObserve(origin: string) {
  return async (url: string): Promise<Observation> => {
    const hops: Hop[] = []
    let target = new URL(url, PUBLIC_ORIGIN)
    for (let i = 0; i < 6; i++) {
      const res = await fetch(origin + target.pathname + target.search, { redirect: 'manual' })
      const location = res.headers.get('location') ?? undefined
      hops.push({ status: res.status, location })
      if (res.status >= 300 && res.status < 400 && location) {
        target = new URL(location, PUBLIC_ORIGIN)
        await res.body?.cancel()
        continue
      }
      const html = res.status === 200 && (res.headers.get('content-type') ?? '').includes('html') ? await res.text() : ''
      if (!html) await res.body?.cancel().catch(() => undefined)
      const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(html)?.[1] ?? /<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i.exec(html)?.[1] ?? null
      const meta = /<meta[^>]+name="robots"[^>]+content="([^"]+)"/i.exec(html)?.[1] ?? null
      return { hops, robots: res.headers.get('x-robots-tag') ?? meta, canonical: canonical?.replaceAll('&amp;', '&') ?? null }
    }
    return { hops, robots: null, canonical: null }
  }
}

/** Hosted sitemap read-back through the admin preview (same code path as the public sitemap). */
async function previewEntries(origin: string): Promise<{ entries: SitemapEntry[]; children: Record<string, number>; anonymousStatus: number }> {
  const login = await fetch(`${origin}/api/users/login/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.H2O_SEO_ADMIN_EMAIL, password: process.env.H2O_SEO_ADMIN_PASSWORD }) })
  const token = ((await login.json().catch(() => null)) as { token?: string } | null)?.token
  if (login.status !== 200 || !token) throw new Error(`admin login failed (${login.status})`)
  // Patch L2: the admin session passes two-factor (H2O_SEO_ADMIN_TOTP_SECRET).
  await completeMfa(origin, token, process.env.H2O_SEO_ADMIN_TOTP_SECRET, { envName: 'H2O_SEO_ADMIN_TOTP_SECRET' })
  const get = async (file?: string, auth = true) => fetch(`${origin}/api/sitemap-preview/${file ? `?file=${encodeURIComponent(file)}` : ''}`, { headers: auth ? { Authorization: `JWT ${token}` } : {} })
  const anonymous = await get(undefined, false)
  await anonymous.body?.cancel()
  const index = await get()
  if (index.status !== 200) throw new Error(`preview index answered ${index.status}`)
  const unescape = (v: string) => v.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&')
  const names = [...(await index.text()).matchAll(/<sitemap><loc>([^<]+)<\/loc>/g)].map((m) => new URL(unescape(m[1]!)).pathname.slice(1))
  const entries: SitemapEntry[] = []
  const children: Record<string, number> = {}
  for (const name of names) {
    const res = await get(name)
    if (res.status !== 200) throw new Error(`preview ${name} answered ${res.status}`)
    const xml = await res.text()
    const urls = [...xml.matchAll(/<url>(.*?)<\/url>/g)].map((m) => m[1]!)
    children[name] = urls.length
    for (const u of urls) {
      const loc = unescape(/<loc>([^<]+)<\/loc>/.exec(u)![1]!)
      const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(u)?.[1]
      const alternates = [...u.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map((m) => ({ hreflang: m[1]!, url: unescape(m[2]!) }))
      entries.push({ child: name, loc, key: keyOfUrl(loc), lastmod, alternates: alternates.length ? alternates : undefined })
    }
  }
  return { entries, children, anonymousStatus: anonymous.status }
}

/** hreflang reciprocity: every page named in a set emits the identical set. */
function reciprocityProblems(entries: readonly SitemapEntry[]): string[] {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const sig = (a?: HreflangMember[]) => JSON.stringify([...(a ?? [])].map((m) => `${m.hreflang} ${keyOfUrl(m.url)}`).sort())
  const problems: string[] = []
  for (const e of entries) {
    if (!e.alternates) continue
    if (!e.alternates.some((a) => keyOfUrl(a.url) === e.key)) problems.push(`${e.loc}: no self reference`)
    for (const a of e.alternates) {
      const other = byKey.get(keyOfUrl(a.url))
      if (!other) problems.push(`${e.loc}: alternate ${a.url} is not listed`)
      else if (sig(other.alternates) !== sig(e.alternates)) problems.push(`${e.loc}: alternate ${a.url} emits a different set`)
    }
  }
  return problems
}

function newUrlReason(e: SitemapEntry): string {
  const row = rowByKey.get(e.key)
  if (e.child === 'product_cat-sitemap.xml') return 'product category archive (Yoast published no product_cat sitemap)'
  if (e.child === 'category-sitemap.xml') return 'post category archive (Yoast published no category sitemap)'
  if (row?.routeId.startsWith('ENGLISH-SERVICE-')) return 'English service page new on this site'
  if (row?.routeId.startsWith('SALMON-') && !row.routeId.startsWith('SALMON-p')) return 'new-site page (Salmon)'
  return `published ${row?.routeClass ?? 'route'} that Yoast did not list`
}

async function main() {
  const yoastFile = arg('yoast'), partAFile = arg('part-a'), out = arg('out'), origin = arg('origin')?.replace(/\/+$/, '')
  if (!yoastFile || !partAFile || !out) throw new Error('usage: parity.ts --yoast=<tsv> --part-a=<tsv> --out=<dir> [--origin=<url>] [--emitted-only]')
  mkdirSync(out, { recursive: true })
  const emittedOnly = process.argv.includes('--emitted-only')
  const redirects = redirectTable()
  let entries: SitemapEntry[]
  let children: Record<string, number> = {}
  let anonymousStatus: number | null = null
  if (origin) ({ entries, children, anonymousStatus } = await previewEntries(origin))
  else {
    entries = sitemapEntries({ rows: ledger.routes, origin: PUBLIC_ORIGIN, redirected: new Set(redirects.keys()), gone: GONE_PATHS, noindexFollow: NOINDEX_FOLLOW_PATHS, locale })
    for (const e of entries) children[e.child] = (children[e.child] ?? 0) + 1
  }
  const observe = origin ? hostedObserve(origin) : offlineObserve(redirects)
  const listed = new Set(entries.map((e) => e.key))

  // Every listed URL serves 200 and is self-canonical.
  const emittedProblems: string[] = []
  for (const e of entries) {
    const o = await observe(e.loc)
    const last = o.hops.at(-1)
    if (o.hops.length !== 1 || last?.status !== 200) emittedProblems.push(`${e.loc}: ${o.hops.map((h) => h.status).join('→')}`)
    else if (!o.canonical || keyOfUrl(o.canonical) !== e.key) emittedProblems.push(`${e.loc}: canonical ${o.canonical}`)
    else if (!origin || !emittedOnly) {
      if (o.robots && /noindex/i.test(o.robots)) emittedProblems.push(`${e.loc}: listed but ${o.robots}`)
    }
  }
  const reciprocity = reciprocityProblems(entries)

  const partA = new Map(tsv(partAFile).map((r) => [keyOfUrl(r.url!), r]))
  // Control Tower overrides of single Part A rows (ops/seo-pass/data/locale-overrides.tsv) decide those URLs instead.
  const overridesFile = path.join(APP, 'ops/seo-pass/data/locale-overrides.tsv')
  if (existsSync(overridesFile)) for (const o of tsv(overridesFile)) { const k = keyOfUrl(o.url!); const a = partA.get(k); if (a) partA.set(k, { ...a, final_state: o.final_state!, redirect_target: o.redirect_target! }) }
  const rows: string[][] = []
  const counts: Record<string, number> = {}
  if (!emittedOnly) {
    for (const y of tsv(yoastFile)) {
      const key = keyOfUrl(y.loc!)
      const o = await observe(y.loc!)
      const statuses = o.hops.map((h) => h.status)
      const last = o.hops.at(-1)
      const finalKey = (() => {
        let k = key
        for (const h of o.hops) if (h.location) k = keyOfUrl(h.location)
        return k
      })()
      const a = partA.get(key)
      let cls: string, detail: string
      const only301 = o.hops.slice(0, -1).every((h) => h.status === 301)
      // A Part A URL is reconciled against its decided state first: until Locale Part B lands, any other outcome is pending.
      const asDecided = !a || (a.final_state === '200' ? statuses.length === 1 && last?.status === 200 && listed.has(key) : a.final_state === '410' ? statuses.length === 1 && last?.status === 410 : statuses.length === 2 && only301 && last?.status === 200 && listed.has(finalKey) && finalKey === keyOfUrl(a.redirect_target!))
      if (!asDecided) [cls, detail] = ['LOCALE_PENDING', `Part A ${a!.final_state}${a!.redirect_target ? ' → ' + keyOfUrl(a!.redirect_target) : ''}; now ${statuses.join('→')}${statuses.length > 1 ? ' → ' + finalKey : ''}`]
      else if (statuses.length === 1 && last?.status === 200 && listed.has(key)) [cls, detail] = ['IN_SITEMAP', '']
      else if (statuses.length > 1 && only301 && last?.status === 200 && listed.has(finalKey)) [cls, detail] = ['REDIRECT_TO_SITEMAP', `${statuses.length - 1} hop(s) → ${finalKey}`]
      else if (last?.status === 410 && statuses.length === 1) [cls, detail] = ['GONE_410', '']
      else if (statuses.length === 1 && last?.status === 200 && o.robots && /noindex/i.test(o.robots)) [cls, detail] = ['NOINDEX', o.robots]
      else if (statuses.length > 1 && only301 && last?.status === 200 && o.robots && /noindex/i.test(o.robots)) [cls, detail] = ['NOINDEX', `${statuses.length - 1} hop(s) → ${finalKey} (${o.robots})`]
      else {
        const row = rowByKey.get(finalKey)
        ;[cls, detail] = ['UNACCOUNTED', `${statuses.join('→')} ${finalKey}${row ? ` (${row.state}${row.sitemap === false && row.state === 'PUBLIC' ? ', not sitemap-approved' : ''})` : ' (no route)'}`]
      }
      counts[cls] = (counts[cls] ?? 0) + 1
      rows.push([y.child!, y.loc!, cls, detail])
    }
    writeFileSync(path.join(out, 'sitemap-parity.tsv'), ['yoast_child\tyoast_loc\tclass\tdetail', ...rows.map((r) => r.join('\t'))].join('\n') + '\n')
  }
  const yoastKeys = emittedOnly ? new Set<string>() : new Set(tsv(yoastFile).map((y) => keyOfUrl(y.loc!)))
  const fresh = emittedOnly ? [] : entries.filter((e) => !yoastKeys.has(e.key))
  if (!emittedOnly) writeFileSync(path.join(out, 'sitemap-new-urls.tsv'), ['child\tloc\treason', ...fresh.map((e) => [e.child, e.loc, newUrlReason(e)].join('\t'))].join('\n') + '\n')
  const summary = {
    mode: origin ? `hosted ${origin}${emittedOnly ? ' (emitted only)' : ''}` : 'offline (repository authorities after the applied batch)',
    listed: entries.length,
    children,
    withAlternates: entries.filter((e) => e.alternates).length,
    withLastmod: entries.filter((e) => e.lastmod).length,
    yoast: emittedOnly ? null : rows.length,
    classes: emittedOnly ? null : counts,
    unaccounted: emittedOnly ? null : (counts.UNACCOUNTED ?? 0),
    newNotInYoast: emittedOnly ? null : fresh.length,
    emittedProblems,
    reciprocityProblems: reciprocity,
    previewAnonymousStatus: anonymousStatus,
  }
  writeFileSync(path.join(out, 'sitemap-parity-summary.json'), JSON.stringify(summary, null, 1) + '\n')
  process.stdout.write(JSON.stringify({ ...summary, emittedProblems: emittedProblems.slice(0, 20), reciprocityProblems: reciprocity.slice(0, 20) }, null, 1) + '\n')
  const ok = !emittedProblems.length && !reciprocity.length && (emittedOnly || !counts.UNACCOUNTED) && (anonymousStatus === null || anonymousStatus === 404)
  process.exit(ok ? 0 : 1)
}
main().catch((e) => {
  process.stderr.write(`${(e as Error).message}\n`)
  process.exit(2)
})
