import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { composePublicDocument } from '../compose'
import { contentSource, indexingPolicy, snapshotRoot } from '../config'
import { isStructural, STRUCTURAL_ROUTE_IDS } from '../structural'

/**
 * Content bridge — unit and static tests (no database). DB behaviour is in `../__dbtests__/bridge.dbtest.ts`;
 * the running-build evidence is `runtime-e2e.mjs` in the package.
 */
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(DIR, '..', '..')
const APP = path.resolve(SRC, '..')
const read = (f: string) => readFileSync(f, 'utf8')
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(d, e.name)
    if (e.isDirectory()) return e.name === '__tests__' || e.name === '__dbtests__' ? [] : walk(f)
    return /\.(ts|tsx)$/.test(e.name) ? [f] : []
  })

const envBackup = { ...process.env }
afterEach(() => {
  process.env = { ...envBackup }
})

describe('configuration', () => {
  it('repository mode is the default; payload mode is explicit', () => {
    expect(contentSource({} as NodeJS.ProcessEnv)).toBe('repository')
    expect(contentSource({ H2O_CONTENT_SOURCE: 'payload' } as unknown as NodeJS.ProcessEnv)).toBe('payload')
  })
  it('the indexing policy is private unless production is stated', () => {
    expect(indexingPolicy({} as NodeJS.ProcessEnv)).toBe('private')
    expect(indexingPolicy({ H2O_INDEXING_POLICY: 'yes' } as unknown as NodeJS.ProcessEnv)).toBe('private')
    expect(indexingPolicy({ H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv)).toBe('production')
  })
  it('persistent directories must be explicit and absolute (fail closed)', () => {
    expect(() => snapshotRoot({} as NodeJS.ProcessEnv)).toThrow(/CONTENT_SNAPSHOT_DIR/)
    expect(() => snapshotRoot({ CONTENT_SNAPSHOT_DIR: 'relative' } as unknown as NodeJS.ProcessEnv)).toThrow(/absolute/)
    expect(snapshotRoot({ CONTENT_SNAPSHOT_DIR: '/data/snapshot' } as unknown as NodeJS.ProcessEnv)).toBe('/data/snapshot')
  })
  it('the Payload config has no default origin (no localhost fallback in deployable code)', () => {
    const cfg = read(path.join(SRC, 'payload.config.ts'))
    expect(cfg).toMatch(/const serverURL = requireEnv\('NEXT_PUBLIC_SERVER_URL'\)/)
    expect(cfg).not.toMatch(/NEXT_PUBLIC_SERVER_URL \|\| 'http/)
  })
})

describe('structural (cohort-bound) routes', () => {
  it('equal the route-id literals the accepted templates dereference', () => {
    const literals = new Set<string>()
    // Family configuration selects a renderer for an existing document; it does not dereference
    // required sibling documents. Those pages retain the existing editorial withdrawal rules.
    for (const f of [...walk(path.join(SRC, 'site')), ...walk(path.join(SRC, 'app', '(site)'))].filter((f) => path.basename(f) !== 'salmon-family-adapter.ts'))
      for (const m of read(f).matchAll(/'((?:SALMON|LIVE)-[a-z_]+-[0-9a-f]+)'/g)) literals.add(m[1]!)
    for (const id of literals) expect(STRUCTURAL_ROUTE_IDS.has(id), id).toBe(true)
  })
  it('does not make dispatch-only family pages structural or prevent their withdrawal', () => {
    expect(isStructural({ routeId: 'SALMON-pages-2651', family: 'salmon', routeClass: 'pages' })).toBe(false)
  })
  it('cover the frozen cohorts (products, matched articles, live posts, categories, services, alias)', () => {
    expect(isStructural({ routeId: 'SALMON-product-123' })).toBe(true)
    expect(isStructural({ routeId: 'SALMON-posts-1', disposition: { matchedArticle: true } })).toBe(true)
    expect(isStructural({ routeId: 'LIVE-posts-1', family: 'live', routeClass: 'posts' })).toBe(true)
    expect(isStructural({ routeId: 'SALMON-product_cat-1', routeClass: 'product_cat' })).toBe(true)
    expect(isStructural({ routeId: 'ENGLISH-SERVICE-X', family: 'english-service' })).toBe(true)
    expect(isStructural({ routeId: 'SALMON-pages-2380', family: 'salmon', routeClass: 'pages' })).toBe(false)
  })
})

describe('typed content contract', () => {
  const doc = { routeId: 'R', targetPath: '/r/', title: 'T', children: ['x'], seo: { title: 'S', h1: ['H'], meta: [{ name: 'description', value: 'd' }] } }
  it('an unedited record renders the stored document unchanged, with `text` derived from the rendered tree', () => {
    expect(composePublicDocument({ routeId: 'R', path: '/r/', family: 'salmon', title: 'T', document: doc })).toEqual({ ...doc, text: 'x' })
  })
  it('a stored or supplied summary never survives composition (probe F2: body-only edit refreshes text)', () => {
    const out = composePublicDocument({ routeId: 'R', path: '/r/', family: 'salmon', title: 'T', document: { ...doc, text: 'STALE' } })
    expect(out.text).toBe('x')
  })
  it('editorial overrides: title → title + heading; SEO title; description', () => {
    const out = composePublicDocument({ routeId: 'R', path: '/r/', family: 'salmon', title: 'New', seo: { title: 'NS', description: 'nd' }, document: doc }) as typeof doc
    expect(out.title).toBe('New')
    expect(out.seo.h1[0]).toBe('New')
    expect(out.seo.title).toBe('NS')
    expect(out.seo.meta[0]!.value).toBe('nd')
    expect(out.children).toEqual(['x'])
    expect(doc.title).toBe('T') // input not mutated
  })
})

/** Promote generation `g` the way the runtime reads it: releases/<id>.json + the single `release` pointer. */
function pointAt(root: string, g: string) {
  mkdirSync(path.join(root, 'releases'), { recursive: true })
  writeFileSync(path.join(root, 'releases', `r-${g}.json`), JSON.stringify({ format: 1, id: `r-${g}`, content: g, search: `s-${g}` }))
  const tmp = path.join(root, `release.${g}.tmp`)
  symlinkSync(`releases/r-${g}.json`, tmp)
  renameSync(tmp, path.join(root, 'release'))
}

describe('runtime read seam', () => {
  it('reads the promoted generation and follows promotion without a restart', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'h2o-snap-'))
    for (const g of ['a', 'b']) {
      mkdirSync(path.join(root, 'generations', g), { recursive: true })
      writeFileSync(path.join(root, 'generations', g, 'ledger.json'), JSON.stringify({ gen: g }))
    }
    pointAt(root, 'a')
    process.env.H2O_CONTENT_SOURCE = 'payload'
    process.env.CONTENT_SNAPSHOT_DIR = root
    const { releaseLedger } = await import('../runtime-read')
    expect(releaseLedger()).toEqual({ gen: 'a' })
    pointAt(root, 'b')
    expect(releaseLedger()).toEqual({ gen: 'b' })
  })
  it('reads only through the release pointer: a per-kind `current` link alone is never served', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'h2o-snap-'))
    mkdirSync(path.join(root, 'generations', 'a'), { recursive: true })
    symlinkSync('generations/a', path.join(root, 'current'))
    process.env.H2O_CONTENT_SOURCE = 'payload'
    process.env.CONTENT_SNAPSHOT_DIR = root
    const { snapshotGeneration } = await import('../runtime-read')
    expect(() => snapshotGeneration()).toThrow(/No published release/)
  })
  it('fails closed when no snapshot has been promoted', async () => {
    process.env.H2O_CONTENT_SOURCE = 'payload'
    process.env.CONTENT_SNAPSHOT_DIR = mkdtempSync(path.join(tmpdir(), 'h2o-empty-'))
    const { snapshotGeneration } = await import('../runtime-read')
    expect(() => snapshotGeneration()).toThrow(/No published release/)
  })
})

describe('CSP for the Payload public runtime', () => {
  it('nonce + strict-dynamic, never unsafe-inline scripts or wildcards; Typeform frame allowance kept; wasm only for search', async () => {
    const { payloadPublicPolicy } = await import('../../proxy')
    const page = payloadPublicPolicy('abc', '/')
    expect(page).toMatch(/script-src 'self' 'nonce-abc' 'strict-dynamic';/)
    expect(page).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(page).not.toMatch(/\*/)
    expect(page).toMatch(/frame-src[^;]*https:\/\/form\.typeform\.com/)
    expect(page).toMatch(/frame-ancestors 'none'/)
    expect(page).not.toMatch(/wasm-unsafe-eval/)
    expect(payloadPublicPolicy('abc', '/search/')).toMatch(/'wasm-unsafe-eval'/)
    expect(payloadPublicPolicy('abc', '/pagefind/pagefind-worker.js')).toMatch(/'wasm-unsafe-eval'/)
  })
  it('payload mode serves sitemap/robots from published state; private policy offers nothing for indexing', async () => {
    process.env.H2O_CONTENT_SOURCE = 'payload'
    const root = mkdtempSync(path.join(tmpdir(), 'h2o-sm-'))
    mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
    writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes: [{ path: '/a/', state: 'PUBLIC', sitemap: true, canonical: 'https://h2ocooling.com/a/' }, { path: '/h/', state: 'REVIEW_HOLD', sitemap: false }], redirects: [] }))
    pointAt(root, 'g')
    process.env.CONTENT_SNAPSHOT_DIR = root
    const { sitemapResponse, robotsResponse } = await import('../../proxy')
    expect(await sitemapResponse().text()).not.toMatch(/<loc>/)
    expect(await robotsResponse().text()).toMatch(/Disallow: \//)
    process.env.H2O_INDEXING_POLICY = 'production'
    const prod = await sitemapResponse().text()
    expect(prod).toMatch(/<loc>https:\/\/h2ocooling\.com\/a\/<\/loc>/)
    expect(prod).not.toMatch(/\/h\//)
    // A withdrawal the release does not reflect yet is subtracted (revocation overlay).
    expect(await sitemapResponse(new Set(['/a/'])).text()).not.toMatch(/<loc>/)
  })
})

describe('static: runtime build and boundaries', () => {
  it('the catch-all never imports the Payload bridge statically (repository mode stays Payload-free)', () => {
    const page = read(path.join(SRC, 'app', '(site)', '[[...slug]]', 'page.tsx'))
    expect(page).not.toMatch(/^import .*content\/page-bridge/m)
    expect(page).toMatch(/import\('\.\.\/\.\.\/\.\.\/content\/page-bridge'\)/)
    // the static release rewrite targets exactly these strings
    const prepare = read(path.join(APP, 'release', 'prepare.mjs'))
    expect(prepare).toContain(`replaceAll("import('../../../content/page-bridge')"`)
    expect(prepare).toContain(`replaceAll("'../../../content/runtime-read'"`)
  })
  it('the runtime search page is the accepted release template verbatim, except the route context that closes the RFQ gap', () => {
    const template = read(path.join(APP, 'release', 'templates', 'search.tsx'))
    const runtime = read(path.join(SRC, 'content', 'ReleaseSearchPage.tsx'))
    const body = (s: string) => s.slice(s.indexOf('return <div className="luxury-site">'))
    const withoutRoute = body(runtime)
      .replace('<LuxuryHeader routePath={SEARCH_ROUTE_PATH}/>', '<LuxuryHeader/>')
      .replace('<LuxuryFooter routePath={SEARCH_ROUTE_PATH}/>', '<LuxuryFooter/>')
      // R1B: generation-pinned client script (public/runtime-search.js)
      .replace(' data-search-generation={searchGeneration??undefined}', '')
      .replace('<RuntimeSearchController/>', '<StaticSearchController/>')
    expect(withoutRoute).toBe(body(template))
    expect(body(runtime)).not.toBe(body(template))
  })
  it('the runtime image is the Node server, not nginx; no env file; no repository documents; non-root; readiness probe', () => {
    const df = read(path.join(APP, 'Dockerfile.runtime'))
    expect(df.split('\n').filter((l) => !l.startsWith('#')).join('\n')).not.toMatch(/nginx/)
    expect(df).toMatch(/CMD \["node", "server\.js"\]/)
    expect(df).toMatch(/--frozen-lockfile/)
    // Image slimming R1: the page documents are excluded from the build context (never a deleted-later layer),
    // and a build step proves they are absent from the content layer.
    expect(df).toMatch(/test ! -e content\/salmon\/documents/)
    expect(df).not.toMatch(/COPY[^\n]*salmon\/documents/)
    expect(df).toMatch(/^USER app$/m)
    expect(df).toMatch(/api\/ready/)
    expect(df).toMatch(/NEXT_PUBLIC_SERVER_URL build arg is required/)
    expect(df).not.toMatch(/COPY[^\n]*\.env/)
    const ignore = read(path.join(APP, 'Dockerfile.runtime.dockerignore'))
    for (const p of ['**/.env', 'legacy-reference', '**/node_modules', '**/__tests__', 'apps/h2o/content/salmon/documents']) expect(ignore).toContain(p)
  })
  it('bridge code has no network client, mail transport or AI call', () => {
    for (const f of walk(path.join(SRC, 'content'))) expect(read(f), f).not.toMatch(/\bfetch\(|nodemailer|sendEmail|anthropic|openai/i)
  })
  it('public reads in the page bridge are anonymous (overrideAccess false) with bounded select', () => {
    const b = read(path.join(SRC, 'content', 'page-bridge.ts'))
    expect(b).not.toMatch(/overrideAccess: true/)
    expect(b).toMatch(/select: SELECT/)
    expect(b).toMatch(/depth: 0/)
  })
  it('the Payload admin is never framed in the runtime (X-Frame-Options DENY + frame-ancestors none)', () => {
    const cfg = read(path.join(APP, 'next.config.ts'))
    expect(cfg).toMatch(/source: '\/admin\/:path\*', headers: \[\{ key: 'X-Frame-Options', value: 'DENY' \}, \{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" \}\]/)
  })
  it('the runner role starts Payload job crons at server start; web replicas do not', () => {
    const inst = read(path.join(SRC, 'instrumentation.ts'))
    expect(inst).toMatch(/H2O_PUBLISHING_RUNNER !== '1'\) return/)
    expect(inst).toMatch(/getPayload\(\{ config, cron: true \}\)/)
  })
  it('only the publishing queue is configured; job endpoints are admin-only', () => {
    const j = read(path.join(SRC, 'content', 'jobs.ts'))
    expect(j).toMatch(/queue: PUBLISHING_QUEUE/)
    expect(j).not.toMatch(/queue: ['"]email/)
    expect(j).toMatch(/access: \{ queue: adminsOnly as never, run: adminsOnly as never, cancel: adminsOnly as never \}/)
  })
})

describe('nested identity never overrides the protected record identity (R1B, Control Tower C5)', () => {
  it('composition takes routeId from the record (or its alias source), not from the stored tree', () => {
    const out = composePublicDocument({ routeId: 'SALMON-pages-1', path: '/a/', family: 'salmon', title: 'T', document: { routeId: 'SALMON-pages-999', children: [] } })
    expect(out.routeId).toBe('SALMON-pages-1')
    const alias = composePublicDocument({ routeId: 'ALIAS-a', path: '/b/', family: 'salmon', title: 'T', document: { routeId: 'X', children: [] }, source: { aliasOf: 'SALMON-pages-2' } })
    expect(alias.routeId).toBe('SALMON-pages-2')
  })
})
