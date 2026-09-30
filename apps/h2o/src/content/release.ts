import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { searchIndexRoot, snapshotRoot } from './config'

/**
 * Coherent public release (R1B).
 *
 * A **release** pairs one content generation with the one search generation built from it. It is described
 * by an immutable manifest `<CONTENT_SNAPSHOT_DIR>/releases/<id>.json`, and the single public pointer
 * `<CONTENT_SNAPSHOT_DIR>/release` links to it. Promotion is one `rename(2)` of that pointer, done only
 * after both candidate generations are complete and validated. Before that the candidates are unreferenced
 * directories: a crash, an exception or a failed status write leaves the previous release serving.
 *
 * Coverage uses PostgreSQL transaction visibility, not wall-clock times. The content generation is read in
 * one REPEATABLE READ transaction, whose `pg_current_snapshot()` is recorded as `pgSnapshot`. Every
 * public-affecting change inserts a row in `h2o_publication_events` inside its own transaction, carrying
 * `pg_current_xact_id()`. A change is reflected by a release **iff**
 * `pg_visible_in_snapshot(event.xid, release.pgSnapshot)`, because the release was then read from a database
 * state that included that commit.
 *
 * Readers resolve through the pointer only. Nothing public reads the older per-kind `current` links;
 * `promoteRelease` still points them at the pair, for operator tools.
 */
export const RELEASE_FORMAT = 1
/** Bump when the public projection (composition, exclusions, derived text) changes: forces full rebuilds. */
export const PROJECTION_VERSION = 'R1B-2026-09-30.1'
const KEEP_RELEASES = 3

export type ReleaseManifest = {
  format: typeof RELEASE_FORMAT
  id: string
  content: string
  search: string
  pgSnapshot: string
  /** Highest event sequence visible in the snapshot (informative; coverage is by xid visibility). */
  maxEventSeq: number
  projectionVersion: string
  builtAt: string
  previous: string | null
  contentLedgerSha256: string
  searchEntrySha256: string
  documents: number
  searchRecords: number
}

export const releasesDir = (root = snapshotRoot()) => path.join(root, 'releases')
const pointer = (root: string) => path.join(root, 'release')
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')

/** Test-only fault injection at promotion boundaries (inert unless a test arms it). */
export type FaultPoint = 'after-content-candidate' | 'search-build' | 'after-search-candidate' | 'before-release-pointer' | 'after-release-pointer' | 'status-write'
const armed = new Set<FaultPoint>()
export const armFault = (p: FaultPoint) => armed.add(p)
export const disarmFaults = () => armed.clear()
/**
 * Test seam: an awaited barrier between the light index read and the full document reads of a content
 * candidate, so the DB suite can commit a withdrawal *between* the two reads (probe F5). Null in production.
 */
export const buildBarriers: { afterIndex: null | (() => Promise<void>) } = { afterIndex: null }
export function fault(p: FaultPoint): void {
  if (armed.has(p)) {
    armed.delete(p)
    throw new Error(`INJECTED_FAULT:${p}`)
  }
}

export function readReleaseManifest(id: string, root = snapshotRoot()): ReleaseManifest | null {
  try {
    const m = JSON.parse(readFileSync(path.join(releasesDir(root), `${id}.json`), 'utf8')) as ReleaseManifest
    return m.format === RELEASE_FORMAT && m.id === id ? m : null
  } catch {
    return null
  }
}

/** The promoted release manifest, or null (no release, dangling pointer, unreadable manifest). */
export function currentRelease(root = snapshotRoot()): ReleaseManifest | null {
  let target: string
  try {
    target = readlinkSync(pointer(root))
  } catch {
    return null
  }
  const id = path.basename(target, '.json')
  return readReleaseManifest(id, root)
}

export const contentDirOf = (m: ReleaseManifest, root = snapshotRoot()) => path.join(root, 'generations', m.content)
export const searchDirOf = (m: ReleaseManifest, sroot = searchIndexRoot()) => path.join(sroot, 'generations', m.search)

export type ReleaseCheck = { ok: true; release: ReleaseManifest } | { ok: false; reason: string }

const CONTENT_FILES = ['manifest.json', 'ledger.json', 'routes.salmon.json', 'routes.live.json', 'english-services.json', 'site-chrome.json']
const SEARCH_FILES = ['search-manifest.json', 'pagefind/pagefind.js', 'pagefind/pagefind-entry.json']

/**
 * Full structural validation of a release: both generations exist, the manifests agree with each other and
 * with the release, every document the route lists reference exists, and the ledger / Pagefind entry bytes
 * match the hashes recorded at promotion. Returns a coarse reason only (no paths, no values).
 */
export function validateRelease(m: ReleaseManifest | null, root = snapshotRoot(), sroot = searchIndexRoot()): ReleaseCheck {
  if (!m) return { ok: false, reason: 'NO_RELEASE' }
  const cdir = contentDirOf(m, root)
  const sdir = searchDirOf(m, sroot)
  for (const f of CONTENT_FILES) if (!existsSync(path.join(cdir, f))) return { ok: false, reason: 'CONTENT_ARTIFACT_MISSING' }
  for (const f of SEARCH_FILES) if (!existsSync(path.join(sdir, f))) return { ok: false, reason: 'SEARCH_ARTIFACT_MISSING' }
  try {
    const cm = JSON.parse(readFileSync(path.join(cdir, 'manifest.json'), 'utf8')) as { id: string; documents: number; projectionVersion?: string }
    if (cm.id !== m.content) return { ok: false, reason: 'CONTENT_MANIFEST_MISMATCH' }
    const sm = JSON.parse(readFileSync(path.join(sdir, 'search-manifest.json'), 'utf8')) as { id: string; snapshot: string; records: number }
    if (sm.id !== m.search || sm.snapshot !== m.content || sm.records !== m.searchRecords) return { ok: false, reason: 'SEARCH_MANIFEST_MISMATCH' }
    if (sha(readFileSync(path.join(cdir, 'ledger.json'))) !== m.contentLedgerSha256) return { ok: false, reason: 'CONTENT_LEDGER_CORRUPT' }
    if (sha(readFileSync(path.join(sdir, 'pagefind/pagefind-entry.json'))) !== m.searchEntrySha256) return { ok: false, reason: 'SEARCH_ENTRY_CORRUPT' }
    let docs = 0
    for (const f of ['routes.salmon.json', 'routes.live.json', 'routes.editorial.json']) {
      for (const row of JSON.parse(readFileSync(path.join(cdir, f), 'utf8')) as Array<{ file: string }>) {
        if (!existsSync(path.join(cdir, row.file))) return { ok: false, reason: 'CONTENT_DOCUMENT_MISSING' }
        docs++
      }
    }
    docs += (JSON.parse(readFileSync(path.join(cdir, 'english-services.json'), 'utf8')) as unknown[]).length
    if (docs !== m.documents || cm.documents !== m.documents) return { ok: false, reason: 'CONTENT_DOCUMENT_COUNT_MISMATCH' }
  } catch {
    return { ok: false, reason: 'RELEASE_UNREADABLE' }
  }
  return { ok: true, release: m }
}

const validated = new Map<string, number>()
/**
 * Readiness form: full validation once per (release id, pointer mtime), then a cheap existence re-check on
 * every call so a deleted or replaced artifact is noticed immediately.
 */
export function releaseReadiness(root = snapshotRoot(), sroot = searchIndexRoot()): ReleaseCheck {
  const m = currentRelease(root)
  if (!m) return { ok: false, reason: existsSync(pointer(root)) || isDangling(root) ? 'RELEASE_POINTER_INVALID' : 'NO_RELEASE' }
  let stamp: number
  try {
    stamp = statSync(path.join(releasesDir(root), `${m.id}.json`)).mtimeMs
  } catch {
    return { ok: false, reason: 'RELEASE_POINTER_INVALID' }
  }
  if (validated.get(m.id) !== stamp) {
    const full = validateRelease(m, root, sroot)
    if (!full.ok) return full
    validated.clear()
    validated.set(m.id, stamp)
  }
  for (const f of CONTENT_FILES) if (!existsSync(path.join(contentDirOf(m, root), f))) return { ok: false, reason: 'CONTENT_ARTIFACT_MISSING' }
  for (const f of SEARCH_FILES) if (!existsSync(path.join(searchDirOf(m, sroot), f))) return { ok: false, reason: 'SEARCH_ARTIFACT_MISSING' }
  return { ok: true, release: m }
}

function isDangling(root: string): boolean {
  try {
    readlinkSync(pointer(root))
    return true
  } catch {
    return false
  }
}

/** Write the release manifest and promote it with one atomic pointer rename. */
export function promoteRelease(input: Omit<ReleaseManifest, 'format' | 'id' | 'builtAt' | 'previous' | 'contentLedgerSha256' | 'searchEntrySha256'>, root = snapshotRoot(), sroot = searchIndexRoot()): ReleaseManifest {
  const previous = currentRelease(root)
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const cdir = path.join(root, 'generations', input.content)
  const sdir = path.join(sroot, 'generations', input.search)
  const m: ReleaseManifest = {
    format: RELEASE_FORMAT, id, ...input, builtAt: new Date().toISOString(), previous: previous?.id ?? null,
    contentLedgerSha256: sha(readFileSync(path.join(cdir, 'ledger.json'))),
    searchEntrySha256: sha(readFileSync(path.join(sdir, 'pagefind/pagefind-entry.json'))),
  }
  const check = validateRelease(m, root, sroot)
  if (!check.ok) throw new Error(`Release candidate invalid: ${check.reason}`)
  mkdirSync(releasesDir(root), { recursive: true })
  const file = path.join(releasesDir(root), `${id}.json`)
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(m, null, 2))
  renameSync(tmp, file)
  fault('before-release-pointer')
  swapLink(pointer(root), path.join('releases', `${id}.json`))
  fault('after-release-pointer')
  // Operator-facing convenience links (never read by the public runtime).
  swapLink(path.join(root, 'current'), path.join('generations', m.content))
  swapLink(path.join(sroot, 'current'), path.join('generations', m.search))
  return m
}

/** Point the release at an existing, validated earlier release (derived-pair rollback; DB untouched). */
export function repointRelease(id: string, root = snapshotRoot(), sroot = searchIndexRoot()): ReleaseManifest {
  const m = readReleaseManifest(id, root)
  const check = validateRelease(m, root, sroot)
  if (!check.ok) throw new Error(`Rollback target invalid: ${check.reason}`)
  swapLink(pointer(root), path.join('releases', `${id}.json`))
  swapLink(path.join(root, 'current'), path.join('generations', m!.content))
  swapLink(path.join(sroot, 'current'), path.join('generations', m!.search))
  return m!
}

function swapLink(link: string, target: string): void {
  const tmp = `${link}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 4)}`
  symlinkSync(target, tmp)
  renameSync(tmp, link)
}

/** Retained releases, newest first (by manifest builtAt). */
export function listReleases(root = snapshotRoot()): ReleaseManifest[] {
  let names: string[]
  try {
    names = readdirSync(releasesDir(root)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  return names
    .map((n) => readReleaseManifest(n.replace(/\.json$/, ''), root))
    .filter((m): m is ReleaseManifest => Boolean(m))
    .sort((a, b) => (a.builtAt < b.builtAt ? 1 : -1))
}

/**
 * Keep the newest KEEP_RELEASES releases (always including the active one) and delete every generation not
 * referenced by a kept release. Runs only after a successful promotion, so an active or rollback-target
 * generation is never removed. Unreferenced candidates from failed builds are removed too.
 */
export function pruneReleases(root = snapshotRoot(), sroot = searchIndexRoot()): void {
  const active = currentRelease(root)
  const all = listReleases(root)
  const keep = new Map<string, ReleaseManifest>()
  if (active) keep.set(active.id, active)
  for (const m of all) if (keep.size < KEEP_RELEASES) keep.set(m.id, m)
  for (const m of all) if (!keep.has(m.id)) rmSync(path.join(releasesDir(root), `${m.id}.json`), { force: true })
  const contents = new Set([...keep.values()].map((m) => m.content))
  const searches = new Set([...keep.values()].map((m) => m.search))
  const sweep = (dir: string, keepSet: Set<string>) => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const n of names) if (!keepSet.has(n)) rmSync(path.join(dir, n), { recursive: true, force: true })
  }
  sweep(path.join(root, 'generations'), contents)
  sweep(path.join(sroot, 'generations'), searches)
}

/** A retained search generation directory by id (for generation-pinned asset reads), or null. */
export function retainedSearchDir(searchId: string, sroot = searchIndexRoot()): string | null {
  if (!/^[A-Za-z0-9-]+$/.test(searchId)) return null
  const dir = path.join(sroot, 'generations', searchId)
  return existsSync(path.join(dir, 'search-manifest.json')) ? dir : null
}
