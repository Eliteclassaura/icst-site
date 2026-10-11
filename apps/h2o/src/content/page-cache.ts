import type { RouteRecord } from './compose'

/**
 * SPEED-2: a per-instance cache of composed public pages.
 *
 * Reading a page from the database (its record and its slots) and composing it was the dominant cost of a request. A composed page is a pure
 * function of the stored record, so it is reused while the record is unchanged: the key is the path, the record's `updatedAt` (a cheap
 * one-field read each request tells whether it changed: a staff edit or publish is visible on the next request) and the release id. Bounded in
 * entries, bytes and age; per process, never shared between instances. Only public (non-draft, no signed-in preview) reads are ever stored.
 * Kill switch: H2O_PAGE_CACHE=off (read at request time, no rebuild).
 */
/** SPEED-2.1 (Security Auditor, 2026-10-09): a cached page is never older than this, whatever the version check says. */
export const PAGE_CACHE_TTL_MS = 60 * 1000

/**
 * SPEED-2.1: the cache key. The page is keyed by the host it was asked on and the language the proxy resolved for the request as well as
 * by its path, so one host's or language's page is never served for another's. Host and language are normalised to a plain token (anything
 * else becomes `?`), so a hostile header can name only itself.
 */
export const pageCacheKey = (host: string | null | undefined, lang: string | null | undefined, path: string): string => {
  const token = (v: string | null | undefined, max: number, fallback: string) => {
    const t = (v ?? '').split(',')[0]!.trim().toLowerCase()
    return t && t.length <= max && /^[a-z0-9.:-]+$/.test(t) ? t : t ? '?' : fallback
  }
  return `${token(host, 100, '-')}|${token(lang, 12, 'en')}|${path}`
}

export const pageCacheEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.H2O_PAGE_CACHE !== 'off'

export type CachedPage = {
  /** The record without the fields only composition reads (document, slots, restored sections, sections). */
  record: RouteRecord
  doc: Record<string, unknown>
}
type Entry = CachedPage & { updatedAt: string; releaseId: string; at: number; bytes: number }

export class PageCache {
  private readonly map = new Map<string, Entry>()
  private total = 0
  constructor(
    readonly maxEntries = 64,
    readonly maxBytes = 96 * 1024 * 1024,
    readonly maxEntryBytes = 24 * 1024 * 1024,
    readonly ttlMs = PAGE_CACHE_TTL_MS,
  ) {}
  get size(): number {
    return this.map.size
  }
  get bytes(): number {
    return this.total
  }
  /** The entry for this path when it was stored for exactly this record version and release and is not past its age; it becomes the most recent. */
  get(path: string, updatedAt: string, releaseId: string, now = Date.now()): CachedPage | undefined {
    const e = this.map.get(path)
    if (!e) return undefined
    if (e.updatedAt !== updatedAt || e.releaseId !== releaseId || now - e.at > this.ttlMs) {
      this.delete(path)
      return undefined
    }
    this.map.delete(path)
    this.map.set(path, e)
    return e
  }
  set(path: string, updatedAt: string, releaseId: string, page: CachedPage, bytes: number, now = Date.now()): boolean {
    this.delete(path)
    if (!updatedAt || bytes > this.maxEntryBytes) return false
    this.map.set(path, { ...page, updatedAt, releaseId, at: now, bytes })
    this.total += bytes
    while (this.map.size > this.maxEntries || this.total > this.maxBytes) {
      const oldest = this.map.keys().next().value as string | undefined
      if (oldest === undefined || oldest === path) break
      this.delete(oldest)
    }
    return true
  }
  delete(path: string): void {
    const e = this.map.get(path)
    if (!e) return
    this.total -= e.bytes
    this.map.delete(path)
  }
  clear(): void {
    this.map.clear()
    this.total = 0
  }
}

/** The process-wide instance. */
export const pageCache = new PageCache()
