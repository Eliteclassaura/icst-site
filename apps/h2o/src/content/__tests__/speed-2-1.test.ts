/**
 * SPEED-2.1 (Security Auditor ruling on SPEED-2, CT 2026-10-09): the composed-page cache is keyed by host and language, holds a page for at
 * most 60 s, is never read or filled by a signed-in request, stays bounded, and keeps nothing that is not public page content.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PAGE_CACHE_TTL_MS, PageCache, pageCacheKey } from '../page-cache'
import type { RouteRecord } from '../compose'

const page = { record: { path: '/a/' } as unknown as RouteRecord, doc: { x: 1 } }

describe('age: a cached page is never older than 60 s', () => {
  it('the hard age is at most 60 s by default and expires exactly there, whatever the record version says', () => {
    expect(PAGE_CACHE_TTL_MS).toBeLessThanOrEqual(60_000)
    const cache = new PageCache()
    expect(cache.ttlMs).toBe(PAGE_CACHE_TTL_MS)
    cache.set('k', 'u1', 'r1', page, 100, 1_000)
    expect(cache.get('k', 'u1', 'r1', 1_000 + 59_999)).toBeDefined()
    expect(cache.get('k', 'u1', 'r1', 1_000 + 60_001)).toBeUndefined()
    expect(cache.size).toBe(0) // an expired entry is dropped, not kept
  })
  it('a changed record version or release is a miss even inside the age (the per-request version check stays)', () => {
    const cache = new PageCache()
    cache.set('k', 'u1', 'r1', page, 100, 0)
    expect(cache.get('k', 'u2', 'r1', 1)).toBeUndefined()
    cache.set('k', 'u1', 'r1', page, 100, 0)
    expect(cache.get('k', 'u1', 'r2', 1)).toBeUndefined()
  })
})

describe('bounds: 64 pages, 96 MB, 24 MB a page', () => {
  it('the defaults, and the oldest page goes first when a bound is passed', () => {
    const cache = new PageCache()
    expect([cache.maxEntries, cache.maxBytes, cache.maxEntryBytes]).toEqual([64, 96 * 1024 * 1024, 24 * 1024 * 1024])
    for (let i = 0; i < 70; i++) cache.set(`k${i}`, 'u', 'r', page, 10, i)
    expect(cache.size).toBe(64)
    expect(cache.get('k0', 'u', 'r', 100)).toBeUndefined()
    expect(cache.get('k69', 'u', 'r', 100)).toBeDefined()
    const big = new PageCache(64, 100, 60)
    big.set('a', 'u', 'r', page, 50, 0)
    big.set('b', 'u', 'r', page, 50, 1)
    big.set('c', 'u', 'r', page, 50, 2)
    expect(big.bytes).toBeLessThanOrEqual(100)
    expect(big.set('huge', 'u', 'r', page, 61, 3)).toBe(false) // over the per-page bound: not stored
    expect(new PageCache().set('k', '', 'r', page, 10)).toBe(false) // no version, no entry
  })
})

describe('key: host and language are part of it', () => {
  it('another host or another language never shares an entry; the first forwarded value counts; hostile values name only themselves', () => {
    const base = pageCacheKey('h2ocooling.com', 'en', '/fans/')
    expect(base).toBe('h2ocooling.com|en|/fans/')
    expect(pageCacheKey('staging.h2ocooling.org', 'en', '/fans/')).not.toBe(base)
    expect(pageCacheKey('h2ocooling.com', 'th', '/fans/')).not.toBe(base)
    expect(pageCacheKey('H2OCooling.com, 10.0.0.2', 'EN', '/fans/')).toBe(base)
    expect(pageCacheKey(null, null, '/fans/')).toBe('-|en|/fans/')
    expect(pageCacheKey('evil host\n', 'en', '/fans/')).toBe('?|en|/fans/')
    expect(pageCacheKey('h2ocooling.com', 'x'.repeat(40), '/fans/')).toBe('h2ocooling.com|?|/fans/')
    // the same path on two hosts is two entries
    const cache = new PageCache()
    cache.set(pageCacheKey('a.example', 'en', '/p/'), 'u', 'r', page, 10, 0)
    expect(cache.get(pageCacheKey('b.example', 'en', '/p/'), 'u', 'r', 1)).toBeUndefined()
    expect(cache.get(pageCacheKey('a.example', 'en', '/p/'), 'u', 'r', 1)).toBeDefined()
  })
})

describe('what is filled and when (the bridge)', () => {
  const bridge = readFileSync(path.join(process.cwd(), 'src/content/page-bridge.ts'), 'utf8')
  it('the cache is used only for an anonymous request: no preview user and no session cookie', () => {
    expect(bridge).toMatch(/const signedIn = \/\(\?:\^\|;\\s\*\)payload-token=\/\.test\(reqHeaders\.get\('cookie'\) \?\? ''\)/)
    expect(bridge).toMatch(/const useCache = !user && !signedIn && pageCacheEnabled\(\)/)
    expect(bridge).toMatch(/if \(useCache\) \{\s*const hit = await cachedPage\(payload, key, cacheKey\)/)
  })
  it('both the read and the write use the host/language key, and the one write sits after the record is found, public and composed', () => {
    expect(bridge).toMatch(/pageCache\.get\(cacheKey, stamp,/)
    expect(bridge.match(/pageCache\.set\(/g)).toHaveLength(1)
    expect(bridge).toMatch(/pageCache\.set\(cacheKey, stampOf\(record\)/)
    const at = (needle: string) => bridge.indexOf(needle)
    // not found, not public, search and alias answers all return before anything is composed or stored
    expect(at('if (!record) return null')).toBeGreaterThan(0)
    expect(at('if (!record) return null')).toBeLessThan(at('pageCache.set('))
    expect(at("if (!user && !isPublic(record)) return null")).toBeLessThan(at('pageCache.set('))
    expect(at("record.family === 'search'")).toBeLessThan(at('pageCache.set('))
    expect(at("record.family === 'alias'")).toBeLessThan(at('pageCache.set('))
    expect(at('composePublicDocument(record)')).toBeLessThan(at('pageCache.set('))
  })
  it('what is kept is the page record without its source fields and the composed document: public page content, no visitor data', () => {
    expect(bridge).toMatch(/const \{ document: _d, slots: _s, restoredSections: _r, sections: _x, \.\.\.light \} = record/)
    expect(bridge).not.toMatch(/pageCache\.set\([^)]*(?:user|cookie|headers)/)
  })
})
