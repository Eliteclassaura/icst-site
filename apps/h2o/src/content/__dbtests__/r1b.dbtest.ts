import { existsSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { sql } from '@payloadcms/db-postgres'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { payload, rest, user, type TestUser } from '../../crm/__dbtests__/harness'
import { importAuthority } from '../import/authority-import'
import { runPublishingSync } from '../jobs'
import { armFault, buildBarriers, contentDirOf, currentRelease, disarmFaults, listReleases, releaseReadiness, repointRelease, searchDirOf, type FaultPoint } from '../release'
import { maxVisibleSeq, pendingEvents } from '../events'
import { computeRevocations, resetRevocationCache } from '../revocation'
import { withheldNodesIn, PUBLIC_EXCLUSIONS } from '../public-exclusions'
import { emailShapedCount } from '../public-author'
import { nodesToLexical, type ContentSlot } from '../content-slots'
import { siteChromeSeed } from '../site-chrome'
import { DEFAULT_SITE_CHROME } from '../../site/site-chrome-content'

/**
 * R1B publication-safety and editor-workflow gates against the isolated synthetic PostgreSQL (loopback,
 * database name contains "synthetic"/"test"; see ../../crm/__dbtests__/setup.ts). Real Payload, real
 * transactions, real Pagefind builds, real file system releases. Each Control Tower probe (F2/F3/F4/F5/F6)
 * has a DB-level counterpart here that fails on R1A behaviour and passes on R1B.
 */
type Doc = Record<string, unknown>
type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
const FANS = 'SALMON-pages-2712' // /fans/: D1 product cards + D3 "Contact for pricing"
const SOLUTIONS = 'SALMON-pages-7'
const INDUSTRIES = 'SALMON-pages-8'
// The page a test withdraws and republishes: an ordinary published LIVE page (PUBLIC, exported, indexable, in the sitemap; not
// structural, no quote intent, no exclusions). R2.5: it was /new-cooling-tower-page/ (LIVE-pages-19498) until R2.4 R2 withdrew
// that page to a 301 on a CT ruling — a REDIRECT record is frozen reference data, so an editor's unpublish is refused (403),
// correctly. The tests' intent is unchanged.
const WITHDRAWABLE_PAGE = 'LIVE-pages-5010'
const WITHDRAWABLE_PATH = '/dry-soda-blast-cleaning-services-2/'
const AUTHOR = 'SALMON-7a930f374040c43c'
const CONTACT = 'SALMON-pages-1446'
const SLICE = new Set([FANS, SOLUTIONS, INDUSTRIES, WITHDRAWABLE_PAGE, AUTHOR, 'SALMON-pages-48', 'SALMON-posts-3968', 'RELEASE-SEARCH', CONTACT])
let admin: TestUser, editor: TestUser, sales: TestUser
let product = ''
const sys = { overrideAccess: true as const, depth: 0 }
const db = async () => ((await payload()).db as unknown as { drizzle: Exec }).drizzle
const seqNow = async () => maxVisibleSeq(await db())
const rec = async (routeId: string, draft = false): Promise<Doc> =>
  (await (await payload()).find({ collection: 'public-routes' as never, where: { routeId: { equals: routeId } } as never, limit: 1, draft, ...sys })).docs[0] as unknown as Doc
/** The withdrawal target, checked first (CT 2026-10-05): a page that is no longer published, PUBLIC and exported fails here
 * with a clear message instead of a bare 403 from the authority freeze further down. */
const withdrawableTarget = async (): Promise<Doc> => {
  const r = await rec(WITHDRAWABLE_PAGE)
  const d = (r?.disposition ?? {}) as Doc
  if (!r || r._status !== 'published' || d.state !== 'PUBLIC' || d.export !== true)
    throw new Error(`fixture no longer withdrawable: ${WITHDRAWABLE_PAGE} (${WITHDRAWABLE_PATH}) is ${r ? `${String(r._status)}, ${String(d.state)}, export ${String(d.export)}` : 'missing'}; pick another published, exported LIVE page`)
  return r
}
/** The records actually inside the promoted Pagefind index (decoded fragment files). */
const searchRecords = (): Array<{ url: string; content: string }> => {
  const dir = path.join(searchDirOf(currentRelease()!), 'pagefind', 'fragment')
  return readdirSync(dir).map((f) => {
    const raw = gunzipSync(readFileSync(path.join(dir, f))).toString('utf8')
    const j = JSON.parse(raw.startsWith('pagefind_dcd') ? raw.slice('pagefind_dcd'.length) : raw) as { url: string; content: string }
    return { url: j.url, content: j.content }
  })
}
const releasedDoc = (routeId: string): Doc | null => {
  const f = path.join(contentDirOf(currentRelease()!), 'documents', `${routeId}.json`)
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Doc) : null
}
const ledgerRow = (routeId: string) =>
  (JSON.parse(readFileSync(path.join(contentDirOf(currentRelease()!), 'ledger.json'), 'utf8')).routes as Doc[]).find((r) => r.recordRouteId === routeId || r.routeId === routeId)
async function editSlots(routeId: string, who: TestUser, mutate: (s: ContentSlot[]) => ContentSlot[], publish = true) {
  const r = await rec(routeId, true)
  return rest.patch(`public-routes/${String(r.id)}?draft=${publish ? 'false' : 'true'}`, who.token, { slots: mutate(structuredClone(r.slots as ContentSlot[])), ...(publish ? { _status: 'published' } : {}) })
}

beforeAll(async () => {
  const p = await payload()
  await (await db()).execute(sql.raw(`TRUNCATE "public_routes", "_public_routes_v", "public_redirects", "payload_jobs", "h2o_publication_events" RESTART IDENTITY CASCADE`))
  ;[admin, editor, sales] = await Promise.all([user('platform-admin'), user('editor'), user('sales')])
  const fans = JSON.parse(readFileSync(path.join(process.cwd(), 'content/salmon/documents', `${FANS}.json`), 'utf8')) as Doc
  const { releaseAuthority } = (await import(path.join(process.cwd(), 'release/authority.mjs'))) as { releaseAuthority: (r: string) => { routes: Array<{ routeId: string; path: string; state: string; export: boolean }> } }
  const byPath = new Map(releaseAuthority(process.cwd()).routes.map((r) => [r.path, r]))
  // The first public product the /fans/ cards point at.
  const m = JSON.stringify(fans).match(/\/product\/[a-z0-9-]+\//g) ?? []
  product = m.map((x) => byPath.get(x)).find((r) => r && r.state === 'PUBLIC' && r.export)!.routeId
  SLICE.add(product)
  const { ledger } = await importAuthority(p, process.cwd(), { only: (id) => SLICE.has(id) })
  expect(ledger.filter((l) => l.status === 'ERROR')).toEqual([])
  const first = await runPublishingSync(p, null)
  expect(first.outcome).toBe('PROMOTED')
}, 600_000)
afterEach(() => {
  disarmFaults()
  buildBarriers.afterIndex = null
  resetRevocationCache()
})

describe('BODY_ONLY_SEARCH_REFRESH (probe F2)', () => {
  it('a body-only edit (one paragraph slot) changes the published text and the search record of that page', async () => {
    const ART = 'SALMON-posts-3968'
    const r = await rec(ART, true)
    const slot = (r.slots as ContentSlot[]).find((s) => s.kind === 'text')!
    const res = await editSlots(ART, editor, (all) => all.map((s) => (s.key === slot.key ? { ...s, text: nodesToLexical(['Synthetic body marker R1B-F2 evaporative cooling']) } : s)))
    expect(res.status).toBe(200)
    const out = await runPublishingSync(await payload(), await seqNow())
    expect(out.outcome).toBe('PROMOTED')
    expect(String(releasedDoc(ART)!.text)).toContain('Synthetic body marker R1B-F2')
    expect(searchRecords().find((x) => x.url === String(r.path))!.content).toContain('Synthetic body marker R1B-F2')
  })
})

describe('EXCLUSION_PROJECTION (probe F3)', () => {
  it('all seven withheld elements are absent from stored records, release documents, search and editor slots; 64afe52 stays', async () => {
    for (const routeId of [SOLUTIONS, INDUSTRIES]) {
      const r = await rec(routeId, true)
      expect(withheldNodesIn(routeId, r.document)).toEqual([])
      expect((r.slots as ContentSlot[]).some((s) => PUBLIC_EXCLUSIONS.some((e) => e.dataId === s.elementId))).toBe(false)
      expect(withheldNodesIn(routeId, releasedDoc(routeId))).toEqual([])
    }
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), 'content/salmon/documents', `${INDUSTRIES}.json`), 'utf8')) as Doc
    const cardText = (id: string): string => {
      let t = ''
      const walk = (n: unknown, inside: boolean) => {
        if (typeof n === 'string') {
          if (inside) t += n + ' '
          return
        }
        const e = n as { attrs?: Record<string, string>; children?: unknown[] }
        const here = inside || e.attrs?.['data-id'] === id
        for (const c of e.children ?? []) walk(c, here)
      }
      for (const c of raw.children as unknown[]) walk(c, false)
      return t.replace(/\s+/g, ' ').trim()
    }
    // /industries/ and /solutions/ are not searchable in the accepted authority: not in the index at all, and
    // the released (derived) text carries no withheld words.
    expect(searchRecords().some((x) => x.url === '/industries/' || x.url === '/solutions/')).toBe(false)
    const text = String(releasedDoc(INDUSTRIES)!.text)
    for (const e of PUBLIC_EXCLUSIONS.filter((x) => x.routeId === INDUSTRIES)) expect(text).not.toContain(cardText(e.dataId).slice(0, 80))
    expect(JSON.stringify(releasedDoc(INDUSTRIES))).toContain('64afe52')
  })
  it('an editor cannot re-key a slot onto a withheld element or add rows', async () => {
    const res = await editSlots(INDUSTRIES, editor, (all) => [...all, { ...all[0]!, key: 'body.5' }], false)
    expect(res.status).toBe(400)
  })
})

describe('PUBLISH_FAILURE_RETRY (probe F4.1/F4.2)', () => {
  it('a search failure promotes nothing; the same event retried rebuilds (never ALREADY_REFLECTED after a partial failure)', async () => {
    const p = await payload()
    const before = currentRelease()!
    const r = await rec('SALMON-posts-3968')
    await rest.patch(`public-routes/${String(r.id)}?draft=false`, editor.token, { seo: { title: 'R1B retry marker' }, _status: 'published' })
    const seq = await seqNow()
    armFault('search-build')
    await expect(runPublishingSync(p, seq)).rejects.toThrow(/INJECTED_FAULT:search-build/)
    disarmFaults()
    expect(currentRelease()!.id).toBe(before.id)
    expect(releaseReadiness().ok).toBe(true)
    const state = (await p.findGlobal({ slug: 'publication-state' as never, overrideAccess: true })) as unknown as Doc
    expect(state.state).toBe('FAILED')
    const retry = await runPublishingSync(p, seq)
    expect(retry.outcome).toBe('PROMOTED')
    expect(ledgerRow('SALMON-posts-3968')).toBeTruthy()
    expect((await runPublishingSync(p, seq)).outcome).toBe('ALREADY_REFLECTED')
    expect(((await p.findGlobal({ slug: 'publication-state' as never, overrideAccess: true })) as unknown as Doc).state).toBe('CURRENT')
  })

  for (const point of ['after-content-candidate', 'after-search-candidate', 'before-release-pointer', 'after-release-pointer', 'status-write'] as FaultPoint[])
    it(`crash at ${point}: a coherent release is served, and the retry converges`, async () => {
      const p = await payload()
      const before = currentRelease()!
      const r = await rec('SALMON-posts-3968')
      await rest.patch(`public-routes/${String(r.id)}?draft=false`, editor.token, { seo: { title: `crash ${point}` }, _status: 'published' })
      const seq = await seqNow()
      armFault(point)
      await expect(runPublishingSync(p, seq)).rejects.toThrow()
      disarmFaults()
      const now = currentRelease()!
      expect(releaseReadiness().ok).toBe(true)
      if (['after-release-pointer', 'status-write'].includes(point)) expect(now.id).not.toBe(before.id)
      else expect(now.id).toBe(before.id)
      const retry = await runPublishingSync(p, seq)
      expect(['PROMOTED', 'ALREADY_REFLECTED']).toContain(retry.outcome)
      expect((await pendingEvents(await db(), currentRelease()!.pgSnapshot)).count).toBe(0)
    })
})

describe('WITHDRAWAL_DURING_SNAPSHOT (probe F5)', () => {
  it('a withdrawal committed between the index and document reads: the build stays one coherent snapshot, the withdrawal is revoked at once and the next release drops it', async () => {
    const p = await payload()
    const target = await withdrawableTarget()
    let committed = 0
    buildBarriers.afterIndex = async () => {
      buildBarriers.afterIndex = null
      const res = await rest.patch(`public-routes/${String(target.id)}`, editor.token, { _status: 'draft' })
      expect(res.status).toBe(200)
      committed = await seqNow()
    }
    const out = await runPublishingSync(p, null)
    expect(out.outcome).toBe('PROMOTED')
    expect(committed).toBeGreaterThan(0)
    // The release reflects the snapshot it read (page still listed) — never a mixed/older-file fallback …
    expect(ledgerRow(WITHDRAWABLE_PAGE)!.state).toBe('PUBLIC')
    // … and the withdrawal is not covered, so it is revoked for every public request right now.
    resetRevocationCache()
    const rev = await computeRevocations(p)
    expect(rev.routeIds.has(WITHDRAWABLE_PAGE)).toBe(true)
    expect(rev.paths.has(WITHDRAWABLE_PATH)).toBe(true)
    const next = await runPublishingSync(p, committed)
    expect(next.outcome).toBe('PROMOTED')
    expect(ledgerRow(WITHDRAWABLE_PAGE)).toBeUndefined()
    resetRevocationCache()
    expect((await computeRevocations(p)).routeIds.size).toBe(0)
    await rest.patch(`public-routes/${String(target.id)}?draft=false`, editor.token, { _status: 'published' })
    await runPublishingSync(p, await seqNow())
  })
  it('a withdrawal stays revoked while the runner keeps failing (no stale release presents it)', async () => {
    const p = await payload()
    const target = await withdrawableTarget()
    await rest.patch(`public-routes/${String(target.id)}`, editor.token, { _status: 'draft' })
    armFault('search-build')
    await expect(runPublishingSync(p, await seqNow())).rejects.toThrow()
    resetRevocationCache()
    expect((await computeRevocations(p)).paths.has(WITHDRAWABLE_PATH)).toBe(true)
    disarmFaults()
    await rest.patch(`public-routes/${String(target.id)}?draft=false`, editor.token, { _status: 'published' })
    resetRevocationCache()
    expect((await computeRevocations(p)).paths.has(WITHDRAWABLE_PATH)).toBe(false) // republished: live again
    await runPublishingSync(p, await seqNow())
  })
})

describe('ATOMIC_CONTENT_SEARCH_RELEASE (probe F4.3) and lock waiters', () => {
  it('concurrent events: every runner waits for the lock; no commit is skipped; the final release covers both', async () => {
    const p = await payload()
    const a = await rec('SALMON-posts-3968')
    const b = await rec(SOLUTIONS)
    await rest.patch(`public-routes/${String(a.id)}?draft=false`, editor.token, { seo: { description: 'concurrent A' }, _status: 'published' })
    const s1 = await seqNow()
    const run1 = runPublishingSync(p, s1)
    await rest.patch(`public-routes/${String(b.id)}?draft=false`, editor.token, { seo: { description: 'concurrent B' }, _status: 'published' })
    const s2 = await seqNow()
    const run2 = runPublishingSync(p, s2)
    const outs = await Promise.all([run1, run2])
    for (const o of outs) expect(['PROMOTED', 'ALREADY_REFLECTED', 'ALREADY_REFLECTED_AFTER_WAIT']).toContain(o.outcome)
    expect((await pendingEvents(await db(), currentRelease()!.pgSnapshot)).count).toBe(0)
    const m = currentRelease()!
    const sm = JSON.parse(readFileSync(path.join(searchDirOf(m), 'search-manifest.json'), 'utf8')) as Doc
    expect(sm.snapshot).toBe(m.content)
  })
})

describe('READINESS_RELEASE_COHERENCE and ROLLBACK_SCOPE_AND_PROOF (probe F6)', () => {
  const root = () => process.env.CONTENT_SNAPSHOT_DIR!
  it('readiness fails for a dangling pointer, a manifest naming a missing search generation, and a deleted artifact', async () => {
    const good = currentRelease()!
    const link = path.join(root(), 'release')
    const swap = (target: string) => {
      const tmp = `${link}.t${Date.now()}`
      symlinkSync(target, tmp)
      renameSync(tmp, link)
    }
    swap('releases/does-not-exist.json')
    expect(releaseReadiness().ok).toBe(false)
    const bad = { ...good, id: 'forged', search: 'no-such-generation' }
    writeFileSync(path.join(root(), 'releases', 'forged.json'), JSON.stringify(bad))
    swap('releases/forged.json')
    expect(releaseReadiness()).toMatchObject({ ok: false })
    unlinkSync(path.join(root(), 'releases', 'forged.json'))
    swap(`releases/${good.id}.json`)
    expect(releaseReadiness().ok).toBe(true)
    const entry = path.join(searchDirOf(good), 'pagefind', 'pagefind-entry.json')
    const saved = readFileSync(entry)
    rmSync(entry)
    expect(releaseReadiness()).toMatchObject({ ok: false, reason: 'SEARCH_ARTIFACT_MISSING' })
    writeFileSync(entry, saved)
    expect(releaseReadiness().ok).toBe(true)
  })
  it('rollback re-points the derived content+search pair only; later withdrawals stay revoked; the database is unchanged', async () => {
    const p = await payload()
    const before = currentRelease()!
    const target = await withdrawableTarget()
    await rest.patch(`public-routes/${String(target.id)}`, editor.token, { _status: 'draft' })
    await runPublishingSync(p, await seqNow())
    expect(ledgerRow(WITHDRAWABLE_PAGE)).toBeUndefined()
    const rolled = repointRelease(before.id)
    expect(currentRelease()!.id).toBe(rolled.id)
    expect(releaseReadiness().ok).toBe(true)
    expect((await rec(WITHDRAWABLE_PAGE))._status).toBe('draft') // DB untouched by the rollback
    resetRevocationCache()
    expect((await computeRevocations(p)).paths.has(WITHDRAWABLE_PATH)).toBe(true)
    expect(listReleases().length).toBeGreaterThan(1)
    await rest.patch(`public-routes/${String(target.id)}?draft=false`, editor.token, { _status: 'published' })
    await runPublishingSync(p, await seqNow())
  })
})

describe('EDITOR_BODY_MEDIA_GLOBALS (typed controls, not raw JSON)', () => {
  let mediaId = ''
  beforeAll(async () => {
    const file = path.join(tmpdir(), `r1b-synthetic-${Date.now()}.png`)
    await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toFile(file)
    const m = (await (await payload()).create({ collection: 'media', data: { alt: 'Synthetic cooling tower test image', rights: 'owned' } as never, filePath: file, user: editor.user as never, overrideAccess: false })) as unknown as Doc
    mediaId = String(m.id)
  })
  it('every imported slot round-trips through Payload unedited (an untouched page renders exactly as imported)', async () => {
    const { slotEdited } = await import('../content-slots')
    for (const id of [FANS, INDUSTRIES, WITHDRAWABLE_PAGE, 'SALMON-pages-48']) {
      const r = await rec(id, true)
      expect((r.slots as ContentSlot[]).filter((s) => slotEdited(s)).map((s) => s.key)).toEqual([])
    }
  })
  it('the provenance tree is hidden and not writable by an editor; slot rows are fixed', async () => {
    const r = await rec(FANS, true)
    await rest.patch(`public-routes/${String(r.id)}?draft=true`, editor.token, { document: { children: ['forged'] } })
    expect(((await rec(FANS, true)).document as Doc).children).not.toEqual(['forged'])
    expect((await editSlots(FANS, editor, (all) => all.slice(1), false)).status).toBe(400)
    // Immutable slot identity: kind/tag/elementId/sourceHash are restored from the stored row.
    const first = (r.slots as ContentSlot[])[0]!
    await editSlots(FANS, editor, (all) => all.map((s) => (s.key === first.key ? { ...s, elementId: '11cbd29', kind: 'image' } : s)), false)
    const after = ((await rec(FANS, true)).slots as ContentSlot[]).find((s) => s.key === first.key)!
    expect([after.kind, after.elementId]).toEqual([first.kind, first.elementId ?? null])
  })
  it('heading, paragraph, image upload, CTA label and SEO edits publish through the typed fields', async () => {
    const r = await rec(FANS, true)
    const slots = r.slots as ContentSlot[]
    const heading = slots.find((s) => s.kind === 'heading')!
    const image = slots.find((s) => s.kind === 'image')!
    const cta = slots.find((s) => s.kind === 'action' && s.intent === 'quote' && !s.productRouteId)!
    const res = await rest.patch(`public-routes/${String(r.id)}?draft=false`, editor.token, {
      slots: slots.map((s) =>
        s.key === heading.key ? { ...s, heading: 'Synthetic Fans Heading' } : s.key === image.key ? { ...s, image: mediaId, alt: 'Synthetic alt' } : s.key === cta.key ? { ...s, label: 'Ask about fan pricing' } : s,
      ),
      seo: { title: 'Synthetic fans SEO title', description: 'Synthetic fans description' },
      _status: 'published',
    })
    expect(res.status).toBe(200)
    await runPublishingSync(await payload(), await seqNow())
    const d = JSON.stringify(releasedDoc(FANS))
    expect(d).toContain('Synthetic Fans Heading')
    expect(d).toMatch(/"src":"\/api\/media\/file\/[^"]+"/)
    expect(d).toContain('Synthetic alt')
    expect(d).toContain('Ask about fan pricing')
    expect(d).toContain('"data-rfq-intent":"quote"')
    expect(d).toContain('Synthetic fans SEO title')
  })
  it('server validation refuses unsafe or unknown destinations and unknown-rights media on publish', async () => {
    const r = await rec(FANS, true)
    const link = (r.slots as ContentSlot[]).find((s) => s.kind === 'action' && !s.productRouteId && s.intent !== 'quote')
    if (link) {
      for (const href of ['javascript:alert(1)', '//evil.example/x', '/no-such-page/', 'http://insecure.example/'])
        expect((await editSlots(FANS, editor, (all) => all.map((s) => (s.key === link.key ? { ...s, href } : s)), false)).status).toBe(400)
    }
    const file = path.join(tmpdir(), `r1b-unknown-${Date.now()}.png`)
    await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toFile(file)
    const unknown = (await (await payload()).create({ collection: 'media', data: { alt: 'x', rights: 'unknown' } as never, filePath: file, overrideAccess: true })) as unknown as Doc
    const img = (r.slots as ContentSlot[]).find((s) => s.kind === 'image')!
    expect((await editSlots(FANS, editor, (all) => all.map((s) => (s.key === img.key ? { ...s, image: String(unknown.id) } : s)), true)).status).toBe(400)
  })
  it('footer words are editable in the site-chrome global, validated, versioned and released; the menu and footer link columns stay code-owned', async () => {
    const p = await payload()
    const bad = await rest.post('globals/site-chrome?draft=false', editor.token, { footer: { heading: 'x', columns: [{ title: 'c', links: [{ label: 'bad', href: 'javascript:alert(1)' }] }] }, _status: 'published' })
    expect(bad.status).toBe(400)
    const seed = siteChromeSeed()
    const ok = await rest.post('globals/site-chrome?draft=false', editor.token, { ...seed, footer: { ...(seed.footer as Doc), heading: 'Synthetic footer heading' }, _status: 'published' })
    expect(ok.status).toBe(200)
    expect((await rest.post('globals/site-chrome?draft=false', sales.token, { footer: { heading: 'no' } })).status).toBe(403)
    await runPublishingSync(p, await seqNow())
    const sc = JSON.parse(readFileSync(path.join(contentDirOf(currentRelease()!), 'site-chrome.json'), 'utf8')) as Doc
    expect((sc.footer as Doc).heading).toBe('Synthetic footer heading')
    // SITE-CHROME-DURABLE-1: the structure in the release is the code defaults, whatever the stored global holds
    expect(sc.navigation).toEqual(JSON.parse(JSON.stringify(DEFAULT_SITE_CHROME.navigation)))
    expect((sc.footer as Doc).columns).toEqual(JSON.parse(JSON.stringify(DEFAULT_SITE_CHROME.footer.columns)))
  })
})

describe('NORMAL_DRAFT_CREATION and PUBLISH_WITHDRAWAL_LIFECYCLE (editorial pages)', () => {
  const lexical = nodesToLexical(['A synthetic editorial paragraph about ', { tag: 'strong', attrs: {}, children: ['crossflow towers'] }])
  it('an editor creates a draft page from sections; identity is server-set; paths are validated', async () => {
    const res = await rest.post('public-routes?draft=true', editor.token, {
      title: 'Synthetic Cooling News', requestedPath: '/synthetic-cooling-news/', lead: 'Synthetic lead',
      routeId: 'SALMON-pages-48', family: 'salmon', disposition: { state: 'PUBLIC' },
      sections: [{ blockType: 'heading', text: 'Synthetic section', level: '2' }, { blockType: 'paragraph', content: lexical }, { blockType: 'button', label: 'Request a quote', intent: 'quote' }],
    })
    expect(res.status).toBe(201)
    const doc = (res.body.doc ?? res.body) as Doc
    expect(String(doc.routeId)).toMatch(/^EDITORIAL-[0-9a-f]{12}$/)
    expect(doc.family).toBe('editorial')
    expect(doc.path).toBe('/synthetic-cooling-news/')
    expect(doc._status).toBe('draft')
    for (const bad of ['/synthetic-cooling-news/', '/fans/', '/api/x/', '/admin/', '/Upper/', '/a/b/c/', 'no-slash'])
      expect((await rest.post('public-routes?draft=true', editor.token, { title: 't', requestedPath: bad })).status).toBe(400)
    expect((await rest.post('public-routes?draft=true', sales.token, { title: 't', requestedPath: '/synthetic-other/' })).status).toBe(403)
  })
  it('publish → released, searchable, in the sitemap membership; unpublish → revoked at once and dropped', async () => {
    const p = await payload()
    const r = (await p.find({ collection: 'public-routes' as never, where: { path: { equals: '/synthetic-cooling-news/' } } as never, draft: true, limit: 1, ...sys })).docs[0] as unknown as Doc
    expect((await rest.patch(`public-routes/${String(r.id)}?draft=false`, editor.token, { _status: 'published' })).status).toBe(200)
    await runPublishingSync(p, await seqNow())
    expect(ledgerRow(String(r.routeId))).toMatchObject({ state: 'PUBLIC', sitemap: true, searchable: true })
    expect(searchRecords().find((x) => x.url === '/synthetic-cooling-news/')!.content).toContain('crossflow towers')
    expect(releasedDoc(String(r.routeId))).toMatchObject({ family: 'editorial', title: 'Synthetic Cooling News' })
    expect((await rest.patch(`public-routes/${String(r.id)}`, editor.token, { _status: 'draft' })).status).toBe(200)
    resetRevocationCache()
    expect((await computeRevocations(p)).paths.has('/synthetic-cooling-news/')).toBe(true)
    await runPublishingSync(p, await seqNow())
    expect(ledgerRow(String(r.routeId))?.state ?? 'ABSENT').not.toBe('PUBLIC')
  })
  it('unpublishing a page that has a pending draft still records the withdrawal (revoked at once, dropped next release)', async () => {
    const p = await payload()
    const r = await rec('SALMON-posts-3968')
    await rest.patch(`public-routes/${String(r.id)}?draft=true`, editor.token, { seo: { title: 'pending draft only' } })
    const before = await seqNow()
    expect((await rest.patch(`public-routes/${String(r.id)}`, admin.token, { _status: 'draft' })).status).toBe(200)
    const ev = (await (await db()).execute(sql`SELECT reason, route_id FROM h2o_publication_events WHERE seq > ${before} ORDER BY seq`)).rows ?? []
    expect(ev.map((e) => `${e.reason}:${e.route_id}`)).toEqual(['unpublish:SALMON-posts-3968'])
    resetRevocationCache()
    expect((await computeRevocations(p)).routeIds.has('SALMON-posts-3968')).toBe(true)
    await runPublishingSync(p, await seqNow())
    expect(ledgerRow('SALMON-posts-3968')).toBeUndefined()
    await rest.patch(`public-routes/${String(r.id)}?draft=false`, admin.token, { seo: { title: null }, _status: 'published' })
    await runPublishingSync(p, await seqNow())
  })
  it('imported held/private records are still never publishable, and structural pages still cannot be withdrawn by an editor', async () => {
    const home = await rec('SALMON-pages-48')
    expect((await rest.patch(`public-routes/${String(home.id)}`, editor.token, { _status: 'draft' })).status).toBe(403)
  })
})

describe('cohort tolerance: withdrawing a product never crashes the build or a listing', () => {
  it('admin withdraws the product a /fans/ card points at; the release builds and the card relation is not offered', async () => {
    const p = await payload()
    const prod = await rec(product)
    expect((await rest.patch(`public-routes/${String(prod.id)}`, admin.token, { _status: 'draft' })).status).toBe(200)
    const out = await runPublishingSync(p, await seqNow())
    expect(out.outcome).toBe('PROMOTED')
    expect(ledgerRow(product)?.state ?? 'ABSENT').not.toBe('PUBLIC')
    await rest.patch(`public-routes/${String(prod.id)}?draft=false`, admin.token, { _status: 'published' })
    await runPublishingSync(p, await seqNow())
  })
})

describe('AUTHOR_PUBLIC_OUTPUT (ADR-028)', () => {
  it('the author archive keeps its route and canonical; no email-shaped identity in the record, release document, search or ledger', async () => {
    const r = await rec(AUTHOR)
    expect(String(r.path)).toMatch(/^\/author\/[^/]+\/$/)
    expect(emailShapedCount({ title: r.title, seo: r.seo, document: r.document, slots: r.slots })).toBe(0)
    expect(emailShapedCount(releasedDoc(AUTHOR))).toBe(0)
    expect(emailShapedCount(searchRecords().find((x) => x.url === r.path))).toBe(0)
    expect(emailShapedCount(ledgerRow(AUTHOR))).toBe(0)
    expect(JSON.stringify(releasedDoc(AUTHOR))).toContain('ICS Editorial Team')
  })
})

describe('SEO batch lifecycle read-back (R1 residual, Control Tower 2026-10-05)', () => {
  it('a withdrawn page still comes back from an admin draft=false read, as an unpublished main row; a published-only query returns nothing', async () => {
    const r = await rec(CONTACT)
    expect((await rest.patch(`public-routes/${String(r.id)}`, admin.token, { _status: 'published' })).status).toBe(200)
    const key = encodeURIComponent(String(r.pathKey))
    expect((await rest.patch(`public-routes/${String(r.id)}`, admin.token, { _status: 'draft' })).status).toBe(200)
    // What the R1 script read back and counted as "still published": the main row, now a draft.
    const main = await rest.get(`public-routes?where[pathKey][equals]=${key}&limit=1&depth=0&draft=false`, admin.token)
    expect(((main.body.docs as Doc[])[0] ?? {})._status).toBe('draft')
    // The corrected proof: nothing is published at that path.
    const onlyPublished = await rest.get(`public-routes?where[pathKey][equals]=${key}&where[_status][equals]=published&limit=1&depth=0&draft=false`, admin.token)
    expect(onlyPublished.body.docs).toEqual([])
    expect((await rest.patch(`public-routes/${String(r.id)}`, admin.token, { _status: 'published' })).status).toBe(200)
  })
})
