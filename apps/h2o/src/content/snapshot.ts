import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { PUBLISHED_PUBLIC } from './access'
import { PUBLIC_ORIGIN, snapshotRoot } from './config'
import { composePublicDocument, type RouteRecord } from './compose'
import { buildBarriers, contentDirOf, currentRelease, PROJECTION_VERSION } from './release'
import { publishedSiteChrome } from './site-chrome'

/**
 * Published-content snapshot — the public runtime's synchronous read model (R1B: candidate generations).
 *
 * Payload is the authority. The accepted Main Factory templates read cross-references synchronously
 * (route lists, related products, library indexes), so the publishing runner materialises Payload's
 * *published* state into an immutable generation directory:
 *
 *   <CONTENT_SNAPSHOT_DIR>/generations/<id>/{manifest.json, ledger.json, routes.salmon.json, routes.live.json,
 *                                            english-services.json, site-chrome.json, documents/<routeId>.json}
 *
 * R1B changes (Control Tower F4/F5):
 * - This module only builds an **unpromoted candidate**. Promotion happens in ./release, as one pointer swap
 *   covering the content generation and its matching search generation, after both validate.
 * - Every read (light index, full documents, frozen reference rows, redirects, site chrome) runs inside the
 *   caller's single REPEATABLE READ transaction (`req.transactionID`), so they all see one database state.
 *   A record published in the light read is therefore published in the full read.
 * - A changed document that is not returned by the full read aborts the build (`SNAPSHOT_INCONSISTENT`). An
 *   older generation's file is never substituted. Unchanged documents are reused only when the previous
 *   release was built with the same projection version and the record's content hash is identical.
 * - Non-public records (REVIEW_HOLD / PRIVATE_ARCHIVE / REDIRECT) contribute their frozen reference data for
 *   server-side cross-references. They are never indexed, listed as PUBLIC or exported.
 */

export type SnapshotManifest = {
  id: string
  builtAt: string
  startedAt: string
  routes: number
  published: number
  frozen: number
  documents: number
  redirects: number
  previous: string | null
  projectionVersion: string
  pgSnapshot: string
}

type Doc = Record<string, unknown>
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')

/** The content generation of the promoted release (null when there is no valid release). */
export const currentGenerationDir = (root = snapshotRoot()): string | null => {
  const m = currentRelease(root)
  return m ? contentDirOf(m, root) : null
}

export function readManifest(dir: string | null): SnapshotManifest | null {
  if (!dir) return null
  try {
    return JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as SnapshotManifest
  } catch {
    return null
  }
}

/** The caller's open transaction, passed to every Local API read of one build. */
export type TxReq = { transactionID: string | number }

const LIGHT = {
  routeId: true, path: true, family: true, routeClass: true, title: true, contentSha256: true,
  disposition: true, seo: true, source: true, _status: true, updatedAt: true,
} as const

async function allRecords(payload: Payload, tx: TxReq, where: Doc | undefined, anonymous: boolean, select: Doc): Promise<RouteRecord[]> {
  const out: RouteRecord[] = []
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: 'public-routes' as never,
      where: where as never,
      depth: 0,
      limit: 100,
      page,
      sort: 'source.order',
      select: select as never,
      draft: false,
      req: tx as never,
      ...(anonymous ? { overrideAccess: false } : { overrideAccess: true }),
    })
    out.push(...(res.docs as unknown as RouteRecord[]))
    if (!res.hasNextPage) break
  }
  return out
}

async function fetchDocuments(payload: Payload, tx: TxReq, ids: string[], anonymous: boolean): Promise<Map<string, RouteRecord>> {
  const map = new Map<string, RouteRecord>()
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25)
    const where = anonymous ? { and: [PUBLISHED_PUBLIC, { routeId: { in: chunk } }] } : { routeId: { in: chunk } }
    const res = await payload.find({
      collection: 'public-routes' as never,
      where: where as never,
      depth: 0,
      limit: chunk.length,
      pagination: false,
      draft: false,
      req: tx as never,
      ...(anonymous ? { overrideAccess: false } : { overrideAccess: true }),
    })
    for (const d of res.docs as unknown as RouteRecord[]) map.set(String(d.routeId), d)
  }
  return map
}

const writeJson = (file: string, value: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value))
  renameSync(tmp, file)
}

export type BuildResult = { manifest: SnapshotManifest; dir: string; changedDocuments: number }

/**
 * Build an unpromoted content generation from the database state visible to `tx` (a REPEATABLE READ
 * transaction opened by the caller; `pgSnapshot` is that transaction's `pg_current_snapshot()`).
 * `previousDir` is the active release's content generation (reuse source for unchanged documents).
 */
export async function buildContentCandidate(payload: Payload, tx: TxReq, pgSnapshot: string, previousDir: string | null, root = snapshotRoot()): Promise<BuildResult> {
  const startedAt = new Date().toISOString()
  mkdirSync(path.join(root, 'generations'), { recursive: true })
  const previous = readManifest(previousDir)
  const reusable = previous?.projectionVersion === PROJECTION_VERSION

  // 1. Light index: what is published-public (anonymous read) and what is frozen non-public, one snapshot.
  const published = await allRecords(payload, tx, PUBLISHED_PUBLIC as Doc, true, LIGHT)
  const frozen = await allRecords(payload, tx, { 'disposition.state': { not_equals: 'PUBLIC' } }, false, LIGHT)
  const publishedIds = new Set(published.map((r) => String(r.routeId)))
  await buildBarriers.afterIndex?.()

  // 2. Which documents must be (re)written: all, unless the previous generation has the same projection and hash.
  const prevIndex = new Map<string, string>()
  if (previousDir && reusable)
    try {
      for (const r of JSON.parse(readFileSync(path.join(previousDir, 'ledger.json'), 'utf8')).routes as Doc[])
        if (r.contentSha256) prevIndex.set(String(r.recordRouteId ?? r.routeId), String(r.contentSha256))
    } catch {
      /* no usable previous ledger: rebuild everything */
    }
  const withDocs = [...published, ...frozen].filter((r) => r.family === 'salmon' || r.family === 'live' || r.family === 'english-service' || r.family === 'editorial')
  const unchanged = (r: RouteRecord) =>
    reusable && prevIndex.get(String(r.routeId)) === r.contentSha256 && existsSync(path.join(previousDir ?? '/nonexistent', 'documents', `${r.routeId}.json`))
  const changed = withDocs.filter((r) => !unchanged(r))
  const fetchedPublic = await fetchDocuments(payload, tx, changed.filter((r) => publishedIds.has(String(r.routeId))).map((r) => String(r.routeId)), true)
  const fetchedFrozen = await fetchDocuments(payload, tx, changed.filter((r) => !publishedIds.has(String(r.routeId))).map((r) => String(r.routeId)), false)

  // 3. Write the candidate generation (unreferenced until ./release promotes it).
  const id = `${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const dir = path.join(root, 'generations', id)
  const docsDir = path.join(dir, 'documents')
  mkdirSync(docsDir, { recursive: true })
  const salmonRoutes: Doc[] = []
  const liveRoutes: Doc[] = []
  const editorialRoutes: Doc[] = []
  const services: Doc[] = []
  const ledgerRoutes: Doc[] = []
  let documents = 0
  for (const light of [...published, ...frozen].sort((a, b) => Number(a.source?.order ?? 0) - Number(b.source?.order ?? 0))) {
    const rid = String(light.routeId)
    const isPublic = publishedIds.has(rid)
    const disp = (light.disposition ?? {}) as Doc
    const aliasOf = ((light.source as Doc | undefined)?.aliasOf as string | undefined) ?? null
    ledgerRoutes.push({
      // The ledger keeps the accepted authority's route identity: an alias row carries its source's
      // routeId (as release/authority.mjs does); the Payload record's own id is `recordRouteId`.
      path: light.path, routeId: aliasOf ?? rid, recordRouteId: rid, routeClass: light.routeClass, family: light.family,
      state: isPublic ? 'PUBLIC' : String(disp.state), export: isPublic, indexable: isPublic && Boolean(disp.indexable),
      sitemap: isPublic && Boolean(disp.sitemap), searchable: isPublic && Boolean(disp.searchable),
      canonical: (light.seo as Doc | undefined)?.canonical ?? null, redirect: disp.redirect ?? null,
      aliasOf, contentSha256: light.contentSha256 ?? null,
    })
    if (!['salmon', 'live', 'english-service', 'editorial'].includes(String(light.family))) continue
    const file = path.join(docsDir, `${rid}.json`)
    if (unchanged(light)) {
      linkSync(path.join(previousDir!, 'documents', `${rid}.json`), file)
    } else {
      const full = (isPublic ? fetchedPublic : fetchedFrozen).get(rid)
      // The light and full reads share one snapshot; a miss means the build is not coherent. Never
      // substitute an older generation's document (Control Tower F5).
      if (!full || full.contentSha256 !== light.contentSha256) throw new Error(`SNAPSHOT_INCONSISTENT:${rid}`)
      writeFileSync(file, JSON.stringify(composePublicDocument(full)))
    }
    documents++
    const bytes = readFileSync(file)
    if (light.family === 'english-service') services.push(JSON.parse(bytes.toString()))
    else {
      const composed = JSON.parse(bytes.toString()) as Doc
      const row = { routeId: rid, sourceUrl: composed.sourceUrl, targetPath: composed.targetPath, file: `documents/${rid}.json`, sha256: sha(bytes) }
      ;(light.family === 'live' ? liveRoutes : light.family === 'editorial' ? editorialRoutes : salmonRoutes).push(row)
    }
  }
  const redirects = (
    await payload.find({ collection: 'public-redirects' as never, where: { active: { equals: true } } as never, pagination: false, depth: 0, overrideAccess: true, req: tx as never })
  ).docs.map((r) => {
    const d = r as unknown as Doc
    return { source: String(d.source), destination: String(d.destination), status: Number(d.status) }
  })
  const chrome = await publishedSiteChrome(payload, tx)
  writeJson(path.join(dir, 'routes.salmon.json'), salmonRoutes)
  writeJson(path.join(dir, 'routes.live.json'), liveRoutes)
  writeJson(path.join(dir, 'routes.editorial.json'), editorialRoutes)
  writeJson(path.join(dir, 'english-services.json'), services)
  writeJson(path.join(dir, 'site-chrome.json'), chrome)
  writeJson(path.join(dir, 'ledger.json'), { origin: PUBLIC_ORIGIN, routes: ledgerRoutes, redirects })
  const manifest: SnapshotManifest = {
    id, builtAt: new Date().toISOString(), startedAt, routes: ledgerRoutes.length, published: published.length,
    frozen: frozen.length, documents, redirects: redirects.length, previous: previous?.id ?? null,
    projectionVersion: PROJECTION_VERSION, pgSnapshot,
  }
  writeJson(path.join(dir, 'manifest.json'), manifest)
  return { manifest, dir, changedDocuments: changed.length }
}

