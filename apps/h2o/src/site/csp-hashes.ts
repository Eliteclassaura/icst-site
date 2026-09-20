/**
 * H2O Phase 2D — script hashes for a statically prerendered estate.
 *
 * Private Preview R1 proved, in a real browser, that the R2.3 policy refused every one of Next's
 * own scripts. The cause was structural: `script-src 'self' 'nonce-…' 'strict-dynamic'` mints a
 * fresh nonce per request, but all 29 cohort routes are prerendered at build time, so no
 * per-request nonce can ever appear in them — and `'strict-dynamic'` makes a CSP3 browser ignore
 * `'self'`, so the same-origin chunk files were refused too.
 *
 * The static-compatible form of the same least-privilege idea is a **hash**. A prerendered page's
 * inline scripts are fixed at build time, so their digests are fixed too, and a hash authorises one
 * exact script body — a stricter statement than a nonce, which authorises whatever carries it. The
 * policy becomes `script-src 'self' 'sha256-…' 'sha256-…'`: `'self'` for the same-origin chunks,
 * one hash per inline script the page actually contains. No nonce, no `'strict-dynamic'`, no
 * `'unsafe-inline'`, no external origin.
 *
 * **PV-07 — what the cache may hold.** The first implementation memoised by request pathname, so
 * every distinct URL a client invented became a permanent map entry and a filesystem miss. Two
 * structural changes fix that class of problem rather than patching a symptom:
 *
 *   1. **The key space is the build output, not the request.** The prerendered HTML files are
 *      enumerated once, and a request is answered only if it resolves onto a file in that set.
 *      An unknown path never becomes a key, never reaches the filesystem, and never grows the
 *      cache; it is answered from a single shared not-found entry. The cache is therefore bounded
 *      by the build, at `prerendered files + 1`, whatever arrives.
 *   2. **Missing and empty are different answers.** A file that is absent is `MISSING`; a file that
 *      exists but contains no executable inline script is `PRESENT` with zero hashes. Conflating
 *      them is what would let a real page silently inherit the 404 page's hashes — authorising two
 *      scripts that page does not contain. An existing zero-script page gets `script-src 'self'`
 *      alone, which is correct and strictly tighter.
 *
 * Path containment is preserved: a resolved path must lie inside the prerendered directory, so no
 * traversal reaches a file outside it, and membership of the enumerated set is required on top.
 *
 * Reading the served artifact rather than a generated side-file is deliberate: a hash table
 * produced by a separate build step can drift from the HTML, and a drifted table fails in a way
 * that looks exactly like the bug this replaced. Rendering mode is untouched — all 29 routes remain
 * statically prerendered.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The prerendered root, resolved on first use rather than at import.
 *
 * Resolving lazily keeps the module honest under the standalone server, whose generated entry
 * point calls `process.chdir()` before anything else runs, and lets a test point the helper at a
 * scratch tree without import-time trickery.
 */
let prerenderedRoot: string | null = null

const root = (): string => {
  if (prerenderedRoot === null) prerenderedRoot = path.join(process.cwd(), '.next', 'server', 'app')
  return prerenderedRoot
}

/** The file a not-found request is served from. One entry, shared by every unknown path. */
const NOT_FOUND_FILE = '_not-found.html'

/** `<script>` elements with no `src`, captured with their attributes so the type can be read. */
const INLINE_SCRIPT = /<script((?:(?!>)[\s\S])*)>([\s\S]*?)<\/script>/g

/**
 * Does this `<script>` element actually execute?
 *
 * A data block — `application/ld+json`, an import map, a template — is not executed, so it needs no
 * allowance and must not receive one. Only executable scripts are hashed.
 */
const isExecutable = (attributes: string): boolean => {
  if (/\bsrc\s*=/.test(attributes)) return false
  const type = /\btype\s*=\s*["']([^"']*)["']/.exec(attributes)?.[1]?.trim().toLowerCase()
  if (type === undefined || type === '') return true
  return type === 'module' || /^(text|application)\/(java|ecma)script$/.test(type)
}

const digest = (source: string): string =>
  `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`

export type HashLookup = { hashes: string[]; state: 'PRESENT' } | { hashes: never[]; state: 'MISSING' }

/** Read one prerendered file. `MISSING` and "present but empty" are different answers. */
export const hashesIn = (file: string): HashLookup => {
  let html: string
  try {
    html = readFileSync(file, 'utf8')
  } catch {
    return { hashes: [], state: 'MISSING' }
  }
  const hashes: string[] = []
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const [, attributes = '', body = ''] = match
    if (isExecutable(attributes) && body !== '') hashes.push(digest(body))
  }
  return { hashes: [...new Set(hashes)], state: 'PRESENT' }
}

/**
 * Every prerendered HTML file the build produced, relative to the prerendered root.
 *
 * Enumerated once. This is the whole key space: a request that does not resolve onto a member of
 * this set is never looked up on disk and never cached under its own name.
 */
let knownFiles: Set<string> | null = null

const known = (): Set<string> => {
  if (knownFiles !== null) return knownFiles
  const found = new Set<string>()
  const walk = (dir: string, prefix: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const next = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(path.join(dir, entry.name), next)
      else if (entry.name.endsWith('.html')) found.add(next)
    }
  }
  walk(root(), '')
  knownFiles = found
  return found
}

/** Cache keyed by prerendered file, never by request path. Bounded by `known().size + 1`. */
const byFile = new Map<string, string[]>()

const hashesForFile = (relative: string): string[] => {
  const cached = byFile.get(relative)
  if (cached !== undefined) return cached
  const base = root()
  const resolved = path.resolve(base, relative)
  // Containment: a resolved path must stay inside the prerendered directory.
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    byFile.set(relative, [])
    return []
  }
  const result = hashesIn(resolved)
  const hashes = result.state === 'PRESENT' ? result.hashes : []
  byFile.set(relative, hashes)
  return hashes
}

/** The relative prerendered file a request path maps to, or null when it maps to none. */
export const prerenderedFileFor = (pathname: string): string | null => {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '')
  if (trimmed.includes('..') || trimmed.includes('\0')) return null
  const candidate = `${trimmed === '' ? 'index' : trimmed}.html`
  return known().has(candidate) ? candidate : null
}

/**
 * The script-source hashes for a request path.
 *
 * A path that resolves to a prerendered file gets that file's hashes — zero of them if the page
 * genuinely contains no executable inline script, which yields `script-src 'self'` alone. Every
 * other path, however many distinct ones arrive, is answered from the single shared not-found
 * entry and adds nothing to the cache.
 */
export const scriptHashesFor = (pathname: string): string[] => {
  const file = prerenderedFileFor(pathname)
  return hashesForFile(file ?? NOT_FOUND_FILE)
}

/** Cache size, for the discrimination harness and the evidence ledger. */
export const cacheSize = (): number => byFile.size

/** Number of prerendered files the build produced. The cache can never exceed this plus one. */
export const knownFileCount = (): number => known().size

/** Test seam: clears the memoised state so a probe starts from a known point. */
export const resetHashCaches = (): void => {
  byFile.clear()
  knownFiles = null
  prerenderedRoot = null
}

/** The prerendered directory currently in use. Reported in the evidence ledger. */
export const prerenderedRootPath = (): string => root()
