import { readFileSync, readlinkSync } from 'node:fs'
import path from 'node:path'
import { cache } from 'react'

/**
 * Filesystem-only read side of the content bridge (no Payload import, safe for the static release build).
 *
 * `salmon.ts`, `EnglishServices.tsx` and `release-document.ts` resolve their data root through here:
 * the repository authorities in `repository` mode, the promoted published snapshot in `payload` mode.
 * Snapshot reads are cached per generation id, so a promotion is picked up on the next request without a
 * restart, and a request never mixes two generations for the same file.
 */
export const isPayloadContent = (): boolean => process.env.H2O_CONTENT_SOURCE === 'payload'

function snapshotRootDir(): string {
  const v = process.env.CONTENT_SNAPSHOT_DIR
  if (!v || !path.isAbsolute(v)) throw new Error('[h2o] CONTENT_SNAPSHOT_DIR (absolute) is required in payload content mode.')
  return v
}

/**
 * The content generation of the promoted **release** (R1B): `<root>/release -> releases/<id>.json`, whose
 * `content` names the generation. Throws (fail closed) when there is no readable release. The per-kind
 * `current` links are operator conveniences and are never read here, so a request can only see a
 * generation that was promoted together with its matching search generation.
 */
const requestGeneration = cache((): { dir: string | null; search: string | null } => ({ dir: null, search: null }))
export function snapshotGeneration(): string {
  // One request, one generation: the first read of a server render pins the release it sees.
  const pinned = requestGeneration()
  if (pinned.dir) return pinned.dir
  const r = resolveGeneration()
  pinned.dir = r.dir
  pinned.search = r.search
  return pinned.dir
}
/** The search generation paired with this request's content generation (same release). */
export function requestSearchGeneration(): string | null {
  snapshotGeneration()
  return requestGeneration().search
}

function resolveGeneration(): { dir: string; search: string | null } {
  const root = snapshotRootDir()
  let target: string
  try {
    target = readlinkSync(path.join(root, 'release'))
  } catch {
    throw new Error('[h2o] No published release has been promoted yet.')
  }
  let content: string
  let search: string | null
  try {
    const m = JSON.parse(readFileSync(path.join(root, target), 'utf8')) as { content: string; search?: string }
    content = String(m.content)
    search = m.search && /^[A-Za-z0-9._-]+$/.test(String(m.search)) ? String(m.search) : null
  } catch {
    throw new Error('[h2o] The promoted release manifest is unreadable.')
  }
  if (!/^[A-Za-z0-9-]+$/.test(content)) throw new Error('[h2o] The promoted release manifest is invalid.')
  return { dir: path.join(root, 'generations', content), search }
}

/**
 * Request-scoped withdrawal revocations (./revocation): routes the active release still lists but the
 * database no longer publishes. Set once per request by the page bridge / search page; applied to every
 * derived route list read below.
 */
export type RequestRevocations = { routeIds: Set<string>; paths: Set<string> }
export const requestRevocations = cache((): RequestRevocations => ({ routeIds: new Set(), paths: new Set() }))
export function setRequestRevocations(r: RequestRevocations): void {
  const store = requestRevocations()
  for (const id of r.routeIds) store.routeIds.add(id)
  for (const p of r.paths) store.paths.add(p)
}

const OVERLAID = new Set(['ledger.json', 'routes.salmon.json', 'routes.live.json', 'routes.editorial.json', 'english-services.json'])
const byGeneration = new Map<string, Map<string, unknown>>()
const overlaid = new Map<string, unknown>()

function applyRevocations(name: string, value: unknown, r: RequestRevocations): unknown {
  const hit = (row: Record<string, unknown>) =>
    r.routeIds.has(String(row.recordRouteId ?? '')) || r.routeIds.has(String(row.routeId ?? row.id ?? '')) || r.paths.has(String(row.path ?? row.targetPath ?? ''))
  if (name === 'ledger.json') {
    const l = value as { routes: Array<Record<string, unknown>> }
    return { ...l, routes: l.routes.map((row) => (hit(row) ? { ...row, state: 'WITHDRAWN', export: false, indexable: false, sitemap: false, searchable: false } : row)) }
  }
  return (value as Array<Record<string, unknown>>).filter((row) => !hit(row))
}

/** JSON file from the current generation, parsed once per generation; derived lists honour revocations. */
export function snapshotJson<T>(name: string): T {
  const gen = snapshotGeneration()
  let files = byGeneration.get(gen)
  if (!files) {
    byGeneration.clear()
    overlaid.clear()
    files = new Map()
    byGeneration.set(gen, files)
  }
  if (!files.has(name)) files.set(name, JSON.parse(readFileSync(path.join(gen, name), 'utf8')))
  const raw = files.get(name) as T
  if (!OVERLAID.has(name)) return raw
  const r = requestRevocations()
  if (!r.routeIds.size && !r.paths.size) return raw
  const key = `${gen}|${name}|${[...r.routeIds].sort().join(',')}|${[...r.paths].sort().join(',')}`
  if (!overlaid.has(key)) {
    if (overlaid.size > 64) overlaid.clear()
    overlaid.set(key, applyRevocations(name, raw, r))
  }
  return overlaid.get(key) as T
}

export const snapshotFile = (relative: string): Buffer => readFileSync(path.join(snapshotGeneration(), relative))

/**
 * Request-scoped document overrides: the page being rendered is read directly from Payload (published, or
 * the editor's draft in preview) and injected here, so the accepted templates render exactly that record.
 * `cache` scopes the map to one server render; outside a render it is a fresh map per call.
 */
/**
 * R1B.1 (Control Tower-approved generic RFQ for editor-created pages): the path of a published editor-created
 * page (family `editorial`) rendered in this request, read from Payload's published state (never a preview
 * draft). Between publish and the next release the release ledger does not list it yet; the public mount gate
 * treats this one path as PUBLIC/exported so the generic placements (header, footer, in-body quote button;
 * `page_path` + `cta_placement` only, never product context) mount at once, exactly as after the release.
 */
const requestEditorial = cache((): Set<string> => new Set())
export function markPublishedEditorial(pathname: string): void {
  requestEditorial().add(pathname)
}
export function requestEditorialRoutes(): Array<{ path: string; state: 'PUBLIC'; export: true; redirect: null; routeClass: 'editorial' }> {
  return [...requestEditorial()].map((p) => ({ path: p, state: 'PUBLIC', export: true, redirect: null, routeClass: 'editorial' }))
}

export const requestDocuments = cache((): Map<string, unknown> => new Map())
export const requestServices = cache((): Map<string, unknown> => new Map())

/**
 * The release route ledger: the accepted `content/release/route-ledger.json` in repository mode, the
 * published ledger of the current snapshot generation in payload mode (same shape for the fields readers use:
 * path, routeId, routeClass, state, export, indexable, sitemap, searchable, canonical, redirect).
 */
export function releaseLedger(): unknown {
  if (isPayloadContent()) return snapshotJson('ledger.json')
  return JSON.parse(readFileSync(path.join(process.cwd(), 'content/release/route-ledger.json'), 'utf8'))
}
