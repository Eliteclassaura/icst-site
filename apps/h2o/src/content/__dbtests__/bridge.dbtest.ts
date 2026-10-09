import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'
import { payload, rest, user, type TestUser } from '../../crm/__dbtests__/harness'
import { importAuthority } from '../import/authority-import'
import { runPublishingSync } from '../jobs'
import { readManifest } from '../snapshot'
import { contentDirOf, currentRelease, repointRelease, searchDirOf } from '../release'
import { maxVisibleSeq } from '../events'

const currentGenerationDir = () => { const m = currentRelease(); return m ? contentDirOf(m) : null }
const seqNow = async () => maxVisibleSeq(((await payload()).db as unknown as { drizzle: never }).drizzle)
import { composePublicDocument } from '../compose'

/**
 * Content bridge — database-backed behaviour against the isolated synthetic database.
 *
 * A small, representative slice of the accepted release authority is imported (a public article, a public
 * project page, a structural page, a held record, a private archive, the /resources/ alias and its REDIRECT
 * source, the search route and one English service). Everything runs through the Local API with access on,
 * or through the app's real REST handlers; the publishing runner is invoked directly.
 */
type Doc = Record<string, unknown>
const SLICE = new Set([
  'SALMON-posts-3968', 'SALMON-pages-2380', 'SALMON-pages-48', 'SALMON-pages-1761', 'ALIAS-resources', 'RELEASE-SEARCH',
  'ENGLISH-SERVICE-CROSSFLOW', 'SALMON-pages-1353',
])
let admin: TestUser, editor: TestUser, seo: TestUser, sales: TestUser, viewer: TestUser
let heldId = '', privateId = ''
const sys = { overrideAccess: true as const, depth: 0 }
const byRoute = async (routeId: string, draft = false): Promise<Doc> =>
  (await (await payload()).find({ collection: 'public-routes' as never, where: { routeId: { equals: routeId } } as never, limit: 1, draft, ...sys })).docs[0] as unknown as Doc
const jobs = async (): Promise<number> => (await (await payload()).count({ collection: 'payload-jobs' as never, where: { taskSlug: { equals: 'publishingSync' } } as never, overrideAccess: true })).totalDocs
const anonFind = async (routeId: string) =>
  (await (await payload()).find({ collection: 'public-routes' as never, where: { routeId: { equals: routeId } } as never, limit: 1, depth: 0, overrideAccess: false })).docs[0] as unknown as Doc | undefined

beforeAll(async () => {
  const p = await payload()
  const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
  await drizzle.execute(sql.raw(`TRUNCATE "public_routes", "_public_routes_v", "public_redirects", "payload_jobs" RESTART IDENTITY CASCADE`))
  ;[admin, editor, seo, sales, viewer] = await Promise.all([user('platform-admin'), user('editor'), user('search-analyst'), user('sales'), user('viewer')])
  // Pick one held and one private-archive record from the authority, then import the slice.
  const { releaseAuthority } = (await import(path.join(process.cwd(), 'release/authority.mjs'))) as { releaseAuthority: (r: string) => { routes: Array<{ routeId: string; state: string; path: string }> } }
  const routes = releaseAuthority(process.cwd()).routes
  heldId = routes.find((r) => r.state === 'REVIEW_HOLD' && !r.path.includes('%'))!.routeId
  privateId = routes.find((r) => r.state === 'PRIVATE_ARCHIVE')!.routeId
  SLICE.add(heldId)
  SLICE.add(privateId)
  const { ledger } = await importAuthority(p, process.cwd(), { only: (id) => SLICE.has(id) })
  expect(ledger.filter((l) => l.status === 'ERROR')).toEqual([])
}, 120_000)

describe('BR1 import / reconciliation', () => {
  it('imports the slice with exact dispositions; nothing held is published; rerun preserves editorial edits', async () => {
    expect((await byRoute('SALMON-posts-3968'))._status).toBe('published')
    expect((await byRoute(heldId))._status).toBe('draft')
    expect((await byRoute(privateId))._status).toBe('draft')
    expect((await byRoute('SALMON-pages-1761'))._status).toBe('draft') // REDIRECT source
    expect((await byRoute('ALIAS-resources'))._status).toBe('published')
    const doc = (await byRoute('SALMON-posts-3968')) as Doc
    const repo = JSON.parse(readFileSync(path.join(process.cwd(), 'content/salmon', String((doc.source as Doc).sourceFile)), 'utf8')) as Doc
    delete repo.contentHtml
    delete repo.text // R1B: derived at composition, never stored
    expect((doc.document as Doc).children).toBeDefined()
    expect(JSON.stringify(doc.document).length).toBeGreaterThan(1000)
    expect((doc.document as Doc).text).toBeUndefined()
    expect(Array.isArray(doc.slots) && (doc.slots as unknown[]).length > 0).toBe(true)
    const p = await payload()
    await p.update({ collection: 'public-routes' as never, id: String(doc.id), data: { seo: { description: 'Edited by an editor' } } as never, user: editor.user as never, overrideAccess: false, draft: false })
    const again = await importAuthority(p, process.cwd(), { only: (id) => SLICE.has(id) })
    expect(again.ledger.every((l) => l.status === 'UNCHANGED')).toBe(true)
    expect(((await byRoute('SALMON-posts-3968')).seo as Doc).description).toBe('Edited by an editor')
    // A changed authority row is reported, never overwritten.
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
    await drizzle.execute(sql`UPDATE "public_routes" SET "source_source_sha256" = 'tampered' WHERE "route_id" = 'SALMON-pages-2380'`)
    const third = await importAuthority(p, process.cwd(), { only: (id) => id === 'SALMON-pages-2380' })
    expect(third.ledger[0]!.status).toBe('HELD_CONFLICT')
    await drizzle.execute(sql`UPDATE "public_routes" SET "source_source_sha256" = ${String(((await byRoute('SALMON-posts-3968')).source as Doc).sourceSha256 ?? '')} WHERE false`)
  })
})

describe('BR2 access: published-only public reads; editorial vs CRM privileges', () => {
  it('anonymous Local API reads published PUBLIC only; REST lists nothing to anonymous, Sales or viewer', async () => {
    expect(await anonFind('SALMON-posts-3968')).toBeTruthy()
    expect(await anonFind(heldId)).toBeUndefined()
    expect(await anonFind(privateId)).toBeUndefined()
    expect(await anonFind('SALMON-pages-1761')).toBeUndefined()
    for (const t of [null, sales.token, viewer.token]) expect((await rest.get('public-routes?limit=5', t)).status).toBe(403)
    expect((await rest.get('public-routes?limit=5&draft=true', seo.token)).status).toBe(200)
    expect((await rest.get('public-redirects', sales.token)).status).toBe(403)
    expect((await rest.get('globals/publication-state', editor.token)).status).toBe(403)
    expect((await rest.get('payload-jobs', editor.token)).status).toBe(403)
  })
  it('Sales and viewer cannot write; search-analyst cannot write; editors cannot create imported identities', async () => {
    const id = String((await byRoute('SALMON-pages-2380')).id)
    for (const t of [sales.token, viewer.token, seo.token]) expect((await rest.patch(`public-routes/${id}`, t, { title: 'x' })).status).toBe(403)
    // An editor may create a new page (family editorial, server-set identity) but never an imported identity:
    // supplied routeId/path/family are stripped, and a missing page address is refused.
    expect((await rest.post('public-routes', editor.token, { title: 'n', routeId: 'N', path: '/n/', pathKey: '/n/', family: 'salmon' })).status).toBeGreaterThanOrEqual(400)
    for (const t of [sales.token, viewer.token, seo.token]) expect((await rest.post('public-routes', t, { title: 'n', requestedPath: '/syn-n/' })).status).toBe(403)
  })
})

describe('BR3 editorial lifecycle and guards', () => {
  it('draft save changes nothing public and queues no job; publish/unpublish queue one each', async () => {
    const p = await payload()
    const rec = await byRoute('SALMON-pages-2380')
    const j0 = await jobs()
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { seo: { title: 'Draft only' } } as never, draft: true, user: editor.user as never, overrideAccess: false })
    expect(((await anonFind('SALMON-pages-2380'))!.seo as Doc).title ?? null).not.toBe('Draft only')
    expect(await jobs()).toBe(j0)
    const draft = (await p.find({ collection: 'public-routes' as never, where: { routeId: { equals: 'SALMON-pages-2380' } } as never, draft: true, user: editor.user as never, overrideAccess: false, depth: 0 })).docs[0] as unknown as Doc
    expect((draft.seo as Doc).title).toBe('Draft only')
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { seo: { title: 'Published once' }, _status: 'published' } as never, user: editor.user as never, overrideAccess: false })
    expect(((await anonFind('SALMON-pages-2380'))!.seo as Doc).title).toBe('Published once')
    expect(await jobs()).toBe(j0 + 1)
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { _status: 'draft' } as never, user: editor.user as never, overrideAccess: false })
    expect(await anonFind('SALMON-pages-2380')).toBeUndefined()
    expect(await jobs()).toBe(j0 + 2)
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { seo: { title: null }, _status: 'published' } as never, user: editor.user as never, overrideAccess: false })
  })
  it('held records cannot be published by anyone; editors cannot edit frozen held content', async () => {
    const held = await byRoute(heldId)
    expect((await rest.patch(`public-routes/${held.id}`, admin.token, { _status: 'published' })).status).toBe(400)
    expect((await rest.patch(`public-routes/${held.id}?draft=true`, editor.token, { title: 'x' })).status).toBe(403)
    expect((await byRoute(heldId))._status).toBe('draft')
  })
  it('structural pages cannot be withdrawn by an editor (rolled back); an admin can', async () => {
    const home = await byRoute('SALMON-pages-48')
    expect((await rest.patch(`public-routes/${home.id}`, editor.token, { _status: 'draft' })).status).toBe(403)
    expect((await byRoute('SALMON-pages-48'))._status).toBe('published')
    const art = await byRoute('SALMON-posts-3968') // one of the 177 matched articles
    expect((await rest.patch(`public-routes/${art.id}`, editor.token, { _status: 'draft' })).status).toBe(403)
    expect((await rest.patch(`public-routes/${home.id}`, admin.token, { _status: 'draft' })).status).toBe(200)
    expect((await rest.patch(`public-routes/${home.id}?draft=false`, admin.token, { _status: 'published' })).status).toBe(200)
  })
  it('identity, provenance, disposition and canonical cannot be changed by an editor', async () => {
    const rec = await byRoute('SALMON-pages-2380')
    expect((await rest.patch(`public-routes/${rec.id}`, admin.token, { path: '/moved/' })).status).toBe(400)
    await rest.patch(`public-routes/${rec.id}?draft=false`, editor.token, { disposition: { indexable: false, sitemap: false }, seo: { canonical: 'https://evil.example/' }, _status: 'published' })
    const after = await byRoute('SALMON-pages-2380')
    expect((after.seo as Doc).canonical).toBe((rec.seo as Doc).canonical)
    expect((after.disposition as Doc).indexable).toBe((rec.disposition as Doc).indexable)
    expect(after.path).toBe(rec.path)
    expect((await rest.patch(`public-routes/${rec.id}`, admin.token, { source: { sourceSha256: 'x' } })).status).toBe(400)
  })
  it('malformed and unknown ids are refused without leaking', async () => {
    expect([400, 404]).toContain((await rest.get('public-routes/not-a-uuid', editor.token)).status)
    expect([400, 404, 403]).toContain((await rest.patch('public-routes/00000000-0000-7000-8000-000000000000', editor.token, { title: 'x' })).status)
  })
})

describe('BR4 publishing runner: snapshot, search, stale jobs, lock, failure, last-good', () => {
  it('snapshot holds published versions only (never a draft), frozen reference data for non-public records, nothing withdrawn', async () => {
    const p = await payload()
    const rec = await byRoute('SALMON-pages-2380')
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { seo: { title: 'UNPUBLISHED DRAFT MARKER' } } as never, draft: true, user: editor.user as never, overrideAccess: false })
    const r = await runPublishingSync(p, null)
    expect(r.outcome).toBe('PROMOTED')
    const dir = currentGenerationDir()!
    const ledger = JSON.parse(readFileSync(path.join(dir, 'ledger.json'), 'utf8')) as { routes: Doc[] }
    const blob = readFileSync(path.join(dir, 'documents', 'SALMON-pages-2380.json'), 'utf8')
    expect(blob).not.toContain('UNPUBLISHED DRAFT MARKER')
    expect(ledger.routes.find((x) => x.routeId === heldId)!.state).toBe('REVIEW_HOLD')
    expect(ledger.routes.find((x) => x.routeId === 'SALMON-posts-3968')!.state).toBe('PUBLIC')
    expect(existsSync(path.join(dir, 'documents', `${heldId}.json`))).toBe(true)
    // search index: only PUBLIC + searchable
    const sm = JSON.parse(readFileSync(path.join(searchDirOf(currentRelease()!), 'search-manifest.json'), 'utf8')) as Doc
    expect(sm.snapshot).toBe(readManifest(dir)!.id)
    expect(Number(sm.records)).toBe(ledger.routes.filter((x) => x.state === 'PUBLIC' && x.searchable && x.family !== 'search').length)
    // Withdraw and rebuild: gone from routes, documents and ledger.
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { _status: 'draft' } as never, user: editor.user as never, overrideAccess: false })
    await runPublishingSync(p, null)
    const d2 = currentGenerationDir()!
    const l2 = JSON.parse(readFileSync(path.join(d2, 'ledger.json'), 'utf8')) as { routes: Doc[] }
    expect(l2.routes.some((x) => x.routeId === 'SALMON-pages-2380')).toBe(false)
    expect(existsSync(path.join(d2, 'documents', 'SALMON-pages-2380.json'))).toBe(false)
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { seo: { title: null }, _status: 'published' } as never, user: editor.user as never, overrideAccess: false })
  })
  it('covered jobs are no-ops and can never resurrect withdrawn content', async () => {
    const p = await payload()
    await runPublishingSync(p, null)
    const covered = await seqNow()
    const r = await runPublishingSync(p, covered)
    expect(r.outcome).toBe('ALREADY_REFLECTED')
    // a publish job queued earlier, then the page is withdrawn, then the (stale) job runs: still withdrawn
    const rec = await byRoute('SALMON-pages-2380')
    const t = await seqNow()
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { _status: 'draft' } as never, user: editor.user as never, overrideAccess: false })
    const late = await runPublishingSync(p, t)
    expect(late.outcome).toBe('ALREADY_REFLECTED') // the older event is covered; it rebuilds nothing …
    const { computeRevocations, resetRevocationCache } = await import('../revocation')
    resetRevocationCache()
    expect((await computeRevocations(p)).routeIds.has('SALMON-pages-2380')).toBe(true) // … and cannot resurrect: revoked
    await runPublishingSync(p, await seqNow()) // the withdrawal's own event
    const l = JSON.parse(readFileSync(path.join(currentGenerationDir()!, 'ledger.json'), 'utf8')) as { routes: Doc[] }
    expect(l.routes.some((x) => x.routeId === 'SALMON-pages-2380')).toBe(false)
    await p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { _status: 'published' } as never, user: editor.user as never, overrideAccess: false })
    await runPublishingSync(p, null)
  })
  it('two concurrent runners serialise on the advisory lock (the second waits; nothing is skipped)', async () => {
    const p = await payload()
    const [a, b] = await Promise.all([runPublishingSync(p, null), runPublishingSync(p, null)])
    expect(a.outcome).toBe('PROMOTED')
    expect(b.outcome).toBe('PROMOTED')
    expect(a.release).not.toBe(b.release)
  })
  it('a failed search build promotes nothing: the last good release (both halves) stays live; derived rollback re-points the pair', async () => {
    const p = await payload()
    const before = currentRelease()!
    const prevSearch = process.env.SEARCH_INDEX_DIR
    process.env.SEARCH_INDEX_DIR = 'relative/not-allowed'
    await expect(runPublishingSync(p, null)).rejects.toThrow()
    process.env.SEARCH_INDEX_DIR = prevSearch
    expect(currentRelease()!.id).toBe(before.id)
    const state = (await p.findGlobal({ slug: 'publication-state' as never, overrideAccess: true })) as unknown as Doc
    expect(String(state.lastError)).toMatch(/SEARCH_INDEX_DIR/)
    const next = await runPublishingSync(p, null)
    expect(next.outcome).toBe('PROMOTED')
    const rolled = repointRelease(before.id)
    expect(currentRelease()!.id).toBe(rolled.id)
    expect(currentGenerationDir()).toBe(contentDirOf(before))
    await runPublishingSync(p, null)
    expect(((await p.findGlobal({ slug: 'publication-state' as never, overrideAccess: true })) as unknown as Doc).lastError ?? null).toBeNull()
  })
  it('rebuilding with no change reproduces identical route lists (deterministic)', async () => {
    const p = await payload()
    const a = currentGenerationDir()!
    await runPublishingSync(p, null)
    const b = currentGenerationDir()!
    expect(a).not.toBe(b)
    for (const f of ['routes.salmon.json', 'routes.live.json', 'english-services.json'])
      expect(readFileSync(path.join(b, f), 'utf8')).toBe(readFileSync(path.join(a, f), 'utf8'))
  })
})

describe('BR5 typed content contract', () => {
  it('an unedited record composes to the accepted document byte-for-byte; edits override title/heading/SEO only', async () => {
    const rec = (await byRoute('SALMON-posts-3968')) as never
    const doc = composePublicDocument({ ...(rec as object), seo: { ...((rec as Doc).seo as object), description: null } } as never) as Doc
    const { text: _t, ...rest } = doc
    void _t
    const stored = (rec as Doc).document as Doc
    // HOME-LOADMORE-1.1: composing applies the read-time dead-widget transform (the Elementor "Load More" widget whose script is gone). It is the
    // ONLY deliberate difference from the stored document: every key but `children` is the stored value, and `children` is the stored tree after
    // that same transform (a record without such a widget is untouched, so for it this is byte-for-byte).
    const { withoutDeadLoadMore, deadWidgetCount } = await import('../dead-widgets')
    const accepted = withoutDeadLoadMore(stored)
    for (const k of new Set([...Object.keys(stored), ...Object.keys(rest)])) expect(JSON.stringify((rest as Doc)[k]), k).toBe(JSON.stringify(accepted[k]))
    for (const k of Object.keys(stored)) if (k !== 'children') expect(JSON.stringify((rest as Doc)[k]), `${k} is the stored value`).toBe(JSON.stringify(stored[k]))
    expect(deadWidgetCount(rest)).toBe(0)
    expect(deadWidgetCount(stored) > 0, 'the stored record carries a dead widget (the transform is what differs)').toBe(JSON.stringify(rest.children) !== JSON.stringify(stored.children))
    const edited = composePublicDocument({ ...(rec as object), title: 'New heading', seo: { title: 'New title', description: 'New desc' } } as never) as Doc
    expect(edited.title).toBe('New heading')
    expect(((edited.seo as Doc).h1 as string[])[0]).toBe('New heading')
    expect((edited.seo as Doc).title).toBe('New title')
    expect(((edited.seo as Doc).meta as Array<{ name: string; value: string }>).find((m) => m.name === 'description')!.value).toBe('New desc')
    expect(edited.children).toEqual(accepted.children)
  })
})

describe('BR6 accepted public exclusions cannot be resurrected', () => {
  it('import stores withheld cards as inert stubs; no write path (editor or admin) can reintroduce them; snapshot and search never carry them', async () => {
    const p = await payload()
    const { applyPublicExclusions, withheldNodesIn, PUBLIC_EXCLUSIONS } = await import('../public-exclusions')
    const { ledger } = await importAuthority(p, process.cwd(), { only: (id) => id === 'SALMON-pages-7' || id === 'SALMON-pages-8' })
    for (const routeId of ['SALMON-pages-7', 'SALMON-pages-8']) {
      const line = ledger.find((l) => l.recordRouteId === routeId)!
      expect(line.note).toMatch(/^PUBLIC_EXCLUSIONS_APPLIED:/)
      const rec = await byRoute(routeId)
      expect(withheldNodesIn(routeId, rec.document)).toEqual([])
      // Re-import is UNCHANGED: a stale fixture cannot bring the cards back.
    }
    const again = await importAuthority(p, process.cwd(), { only: (id) => id === 'SALMON-pages-7' || id === 'SALMON-pages-8' })
    expect(again.ledger.map((l) => l.status)).toEqual(['UNCHANGED', 'UNCHANGED'])
    // The provenance tree is not writable through any editor path (field access): a payload carrying withheld
    // cards changes nothing, for an editor and an admin alike.
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), 'content/salmon/documents/SALMON-pages-7.json'), 'utf8'))
    const rec = await byRoute('SALMON-pages-7')
    for (const who of [editor, admin]) {
      const res = await rest.patch(`public-routes/${String(rec.id)}?draft=true`, who.token, { document: raw })
      expect([200, 400]).toContain(res.status)
      const d = (await (await payload()).find({ collection: 'public-routes' as never, where: { routeId: { equals: 'SALMON-pages-7' } } as never, draft: true, limit: 1, ...sys })).docs[0] as unknown as Doc
      expect(withheldNodesIn('SALMON-pages-7', d.document)).toEqual([])
    }
    // The Local API with override (the importer's path) is refused by the collection guard too.
    await expect(p.update({ collection: 'public-routes' as never, id: String(rec.id), data: { document: raw } as never, overrideAccess: true, draft: true })).rejects.toThrow(/withheld|frozen/)
    void applyPublicExclusions
    // Snapshot + search.
    await runPublishingSync(p, null)
    const dir = currentGenerationDir()!
    for (const e of PUBLIC_EXCLUSIONS) {
      const doc = JSON.parse(readFileSync(path.join(dir, 'documents', `${e.routeId}.json`), 'utf8'))
      expect(withheldNodesIn(e.routeId, doc)).toEqual([])
    }
    const sol = JSON.parse(readFileSync(path.join(dir, 'documents', 'SALMON-pages-7.json'), 'utf8')) as Doc
    expect(String(sol.text)).not.toContain('Custom cooling solutions designed to keep critical servers running smoothly without overheating.')
    const rec8 = JSON.parse(readFileSync(path.join(dir, 'documents', 'SALMON-pages-8.json'), 'utf8')) as Doc
    expect(JSON.stringify(rec8)).toContain('64afe52')
  })
})
