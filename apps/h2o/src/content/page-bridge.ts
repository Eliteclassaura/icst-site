import config from '@payload-config'
import { draftMode, headers } from 'next/headers'
import { getPayload } from 'payload'
import { isEditorialReader } from './access'
import { composePublicDocument, type RouteRecord } from './compose'
import { PUBLIC_ORIGIN, publicRobots } from './config'
import { markPublishedEditorial, requestDocuments, requestServices, setRequestRevocations } from './runtime-read'
import { computeRevocations } from './revocation'
import { cache } from 'react'
import { timed } from './server-timing'
import { pageCache, pageCacheEnabled, pageCacheKey } from './page-cache'
import { currentRelease } from './release'

/**
 * Page-level Payload reads for the public runtime (payload content mode only).
 *
 * - Public: explicitly anonymous (`overrideAccess: false`, no user), published only, bounded `select`,
 *   `depth: 0`. The collection access adds `_status = published`, `state = PUBLIC`, `export = true`, so a
 *   held, private, withdrawn or draft record resolves to nothing (404) — there is no privileged default.
 * - Preview: only inside Next draft mode **and** only for a signed-in editorial reader, re-checked on every
 *   request (the draft cookie alone grants nothing). The editor's latest draft is read with their own access.
 *
 * The resolved document is injected into the request store so the accepted templates render this record;
 * every cross-reference still comes from the published snapshot.
 */
const SELECT = {
  routeId: true, path: true, family: true, routeClass: true, title: true, seo: true, disposition: true,
  document: true, source: true, _status: true, slots: true, lead: true, sections: true, restoredSections: true, updatedAt: true,
} as const
/** The one-field read that tells whether a cached page is still current (no document, no slots). */
const VERSION_SELECT = { updatedAt: true, _status: true, disposition: true } as const

export type Resolved = {
  record: RouteRecord
  /** The path the accepted dispatch should render (the source path for salmon/live records). */
  dispatchPath: string
  preview: boolean
  /** The composed document (editorial pages render it directly). */
  doc?: Record<string, unknown>
}

const pathKey = (p: string) => {
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}

async function previewUser(): Promise<unknown | null> {
  const dm = await draftMode()
  if (!dm.isEnabled) return null
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !isEditorialReader({ user } as never)) return null
  return user
}

/**
 * SPEED-1: read once per request. `generateMetadata` and the page both resolve the same path; without a request-level cache the page record
 * (and its slots) was read from the database and composed twice. React `cache` scopes the result to one server render (outside a render it is
 * a plain call), so nothing is shared between requests or visitors. The durations of the parts feed the staging-only server-timing meta tag.
 */
export const resolvePublicPath = cache(resolvePublicPathUncached)

const stampOf = (r: unknown): string => String((r as { updatedAt?: string | null } | undefined)?.updatedAt ?? '')
const isPublic = (r: RouteRecord): boolean => r._status === 'published' && r.disposition?.state === 'PUBLIC' && Boolean(r.disposition?.export)

/**
 * The request-scoped part of a resolution: what the rest of the render reads from the request stores. Runs on every request, hit or miss,
 * so a cached page behaves exactly like a freshly composed one.
 */
function finish(record: RouteRecord, doc: Record<string, unknown>, user: unknown | null): Resolved {
  if (record.family === 'editorial') {
    // Generic RFQ eligibility for a published editor-created page (R1B.1); never for a draft in preview.
    if (isPublic(record) && !user) markPublishedEditorial(record.path)
    return { record, dispatchPath: record.path, preview: Boolean(user), doc }
  }
  if (record.family === 'english-service') {
    requestServices().set(record.routeId, doc)
    return { record, dispatchPath: record.path, preview: Boolean(user) }
  }
  requestDocuments().set(record.routeId, doc)
  return { record, dispatchPath: String((doc as { targetPath?: string }).targetPath ?? record.path), preview: Boolean(user) }
}

/**
 * SPEED-2: a public (non-preview) request whose page is unchanged since it was composed reuses the composed document. One cheap read
 * (updatedAt, status) per request decides; a changed or unpublished record is a miss and takes the normal read. Any error is a miss.
 */
async function cachedPage(payload: Awaited<ReturnType<typeof getPayload>>, key: string, cacheKey: string): Promise<Resolved | undefined> {
  try {
    const res = await timed('version', () => payload.find({
      collection: 'public-routes' as never,
      where: { pathKey: { equals: key } } as never,
      depth: 0,
      limit: 1,
      select: VERSION_SELECT as never,
      draft: false,
      overrideAccess: false,
    }))
    const head = res.docs[0] as unknown as RouteRecord | undefined
    if (!head || !isPublic(head)) return undefined
    const stamp = stampOf(head)
    const entry = stamp ? pageCache.get(cacheKey, stamp, currentRelease()?.id ?? 'none') : undefined
    return entry ? finish(structuredClone(entry.record), structuredClone(entry.doc), null) : undefined
  } catch {
    return undefined
  }
}

async function resolvePublicPathUncached(requestPath: string): Promise<Resolved | null> {
  const payload = await timed('payload', () => getPayload({ config }))
  // R1B: withdrawals the active release does not reflect yet are subtracted from every derived list this
  // request renders (listings, related links, product cards, RFQ eligibility).
  setRequestRevocations(await timed('revocations', () => computeRevocations(payload)))
  const key = pathKey(requestPath)
  const user = await previewUser()
  // SPEED-2.1: never read from or filled by a signed-in request (a session cookie, preview or not), keyed by host and language
  const reqHeaders = await headers()
  const signedIn = /(?:^|;\s*)payload-token=/.test(reqHeaders.get('cookie') ?? '')
  const cacheKey = pageCacheKey(reqHeaders.get('x-forwarded-host') ?? reqHeaders.get('host'), reqHeaders.get('x-h2o-lang'), key)
  const useCache = !user && !signedIn && pageCacheEnabled()
  if (useCache) {
    const hit = await cachedPage(payload, key, cacheKey)
    if (hit) return hit
  }
  const res = await timed('db', () => payload.find({
    collection: 'public-routes' as never,
    where: { pathKey: { equals: key } } as never,
    depth: 0,
    limit: 1,
    select: SELECT as never,
    ...(user ? { draft: true, user: user as never, overrideAccess: false } : { draft: false, overrideAccess: false }),
  }))
  const record = res.docs[0] as unknown as RouteRecord | undefined
  if (!record) return null
  if (!user && !isPublic(record)) return null
  if (record.family === 'search') return null
  if (record.family === 'alias') return { record, dispatchPath: record.path, preview: Boolean(user) }
  const doc = await timed('compose', () => composePublicDocument(record))
  if (useCache) {
    try {
      const { document: _d, slots: _s, restoredSections: _r, sections: _x, ...light } = record as RouteRecord & Record<string, unknown>
      void _d; void _s; void _r; void _x
      const bytes = 3 * JSON.stringify(doc).length
      pageCache.set(cacheKey, stampOf(record), currentRelease()?.id ?? 'none', { record: light as unknown as RouteRecord, doc: structuredClone(doc) }, bytes)
    } catch {
      /* fail open: the page is served from this read */
    }
  }
  return finish(record, doc, user)
}

/** Robots for a resolved record under the active indexing policy (private unless explicitly production). */
export function robotsFor(record: RouteRecord, preview: boolean): { index: boolean; follow: boolean } {
  return publicRobots(record, preview)
}

export const canonicalFor = (record: RouteRecord): string => record.seo?.canonical || PUBLIC_ORIGIN + record.path
