import config from '@payload-config'
import { draftMode, headers } from 'next/headers'
import { getPayload } from 'payload'
import { isEditorialReader } from './access'
import { composePublicDocument, type RouteRecord } from './compose'
import { indexingPolicy, NOINDEX_FOLLOW_PATHS, PUBLIC_ORIGIN } from './config'
import { markPublishedEditorial, requestDocuments, requestServices, setRequestRevocations } from './runtime-read'
import { computeRevocations } from './revocation'

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
  document: true, source: true, _status: true, slots: true, lead: true, sections: true,
} as const

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

export async function resolvePublicPath(requestPath: string): Promise<Resolved | null> {
  const payload = await getPayload({ config })
  // R1B: withdrawals the active release does not reflect yet are subtracted from every derived list this
  // request renders (listings, related links, product cards, RFQ eligibility).
  setRequestRevocations(await computeRevocations(payload))
  const key = pathKey(requestPath)
  const user = await previewUser()
  const res = await payload.find({
    collection: 'public-routes' as never,
    where: { pathKey: { equals: key } } as never,
    depth: 0,
    limit: 1,
    select: SELECT as never,
    ...(user ? { draft: true, user: user as never, overrideAccess: false } : { draft: false, overrideAccess: false }),
  })
  const record = res.docs[0] as unknown as RouteRecord | undefined
  if (!record) return null
  if (!user && !(record._status === 'published' && record.disposition?.state === 'PUBLIC' && record.disposition?.export)) return null
  if (record.family === 'search') return null
  if (record.family === 'alias') return { record, dispatchPath: record.path, preview: Boolean(user) }
  const doc = composePublicDocument(record)
  if (record.family === 'editorial') {
    // Generic RFQ eligibility for a published editor-created page (R1B.1); never for a draft in preview.
    if (record._status === 'published' && record.disposition?.state === 'PUBLIC' && record.disposition?.export && !user) markPublishedEditorial(record.path)
    return { record, dispatchPath: record.path, preview: Boolean(user), doc }
  }
  if (record.family === 'english-service') {
    requestServices().set(record.routeId, doc)
    return { record, dispatchPath: record.path, preview: Boolean(user) }
  }
  requestDocuments().set(record.routeId, doc)
  return { record, dispatchPath: String((doc as { targetPath?: string }).targetPath ?? record.path), preview: Boolean(user) }
}

/** Robots for a resolved record under the active indexing policy (private unless explicitly production). */
export function robotsFor(record: RouteRecord, preview: boolean): { index: boolean; follow: boolean } {
  if (preview || indexingPolicy() !== 'production') return { index: false, follow: false }
  const ok = Boolean(record.disposition?.indexable)
  if (!ok && record.disposition?.state === 'PUBLIC' && NOINDEX_FOLLOW_PATHS.has(record.path)) return { index: false, follow: true }
  return { index: ok, follow: ok }
}

export const canonicalFor = (record: RouteRecord): string => record.seo?.canonical || PUBLIC_ORIGIN + record.path
