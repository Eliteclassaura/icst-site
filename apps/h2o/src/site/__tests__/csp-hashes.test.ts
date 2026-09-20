/**
 * H2O Phase 2D — PV-07: what the CSP hash helper may hold, and what it may answer.
 *
 * These tests are about the helper's availability and correctness properties, not about the CSP
 * semantics, which R1.1 already proved in a real browser and which are unchanged.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as cspHashes from '../csp-hashes'

/**
 * The helper resolves its prerendered root lazily and `resetHashCaches()` clears it, so each
 * scenario builds a small tree in a temporary directory, changes into it and resets the module.
 * No import trickery, and the module under test is the one the application uses.
 */
const withPrerendered = (
  files: Record<string, string>,
): {
  cleanup: () => void
  mod: typeof cspHashes
} => {
  const root = mkdtempSync(path.join(tmpdir(), 'h2o-csp-'))
  const appDir = path.join(root, '.next', 'server', 'app')
  mkdirSync(appDir, { recursive: true })
  for (const [name, html] of Object.entries(files)) {
    const target = path.join(appDir, name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, html, 'utf8')
  }
  const previous = process.cwd()
  process.chdir(root)
  cspHashes.resetHashCaches()
  return {
    cleanup: () => {
      process.chdir(previous)
      cspHashes.resetHashCaches()
      rmSync(root, { force: true, recursive: true })
    },
    mod: cspHashes,
  }
}

const page = (body: string): string =>
  `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`

const SCRIPT_A = '<script>self.__next_f.push([1,"a"])</script>'
const SCRIPT_B = '<script>self.__next_f.push([1,"b"])</script>'
const LD_JSON = '<script type="application/ld+json">{"@type":"WebPage"}</script>'

let cleanup: (() => void) | null = null
afterEach(() => {
  cleanup?.()
  cleanup = null
})

describe('the cache key space is the build output, not the request', () => {
  it('does not retain an entry for a path that matches no prerendered file', () => {
    const { cleanup: done, mod } = withPrerendered({
      'index.html': page(SCRIPT_A),
      '_not-found.html': page(SCRIPT_B),
    })
    cleanup = done
    expect(mod.knownFileCount()).toBe(2)

    mod.scriptHashesFor('/')
    const afterKnown = mod.cacheSize()
    for (let i = 0; i < 2000; i += 1) mod.scriptHashesFor(`/does-not-exist-${i}/`)

    // Two thousand distinct unknown paths, and the cache has not grown past the one shared
    // not-found entry that the first of them created.
    expect(mod.cacheSize()).toBe(afterKnown + 1)
    expect(mod.cacheSize()).toBeLessThanOrEqual(mod.knownFileCount() + 1)
  })

  it('stays bounded by the build even when every request is hostile', () => {
    const { cleanup: done, mod } = withPrerendered({
      'index.html': page(SCRIPT_A),
      '_not-found.html': page(SCRIPT_B),
      'contact-us.html': page(SCRIPT_A),
    })
    cleanup = done
    for (let i = 0; i < 5000; i += 1) {
      mod.scriptHashesFor(`/${'a'.repeat(i % 50)}-${i}/`)
      mod.scriptHashesFor(`/../../etc/passwd-${i}`)
      mod.scriptHashesFor(`/%2e%2e/escape-${i}`)
    }
    expect(mod.cacheSize()).toBeLessThanOrEqual(mod.knownFileCount() + 1)
    expect(mod.cacheSize()).toBeLessThanOrEqual(4)
  })

  it('answers every unknown path from the single shared not-found result', () => {
    const { cleanup: done, mod } = withPrerendered({
      'index.html': page(SCRIPT_A),
      '_not-found.html': page(SCRIPT_B),
    })
    cleanup = done
    const notFound = mod.scriptHashesFor('/_not-found/')
    expect(mod.scriptHashesFor('/nope/')).toEqual(mod.scriptHashesFor('/also-nope/'))
    expect(mod.scriptHashesFor('/nope/')).toEqual(
      notFound.length > 0 ? notFound : mod.scriptHashesFor('/nope/'),
    )
    expect(mod.scriptHashesFor('/nope/').length).toBe(1)
  })
})

describe('missing and empty are different answers', () => {
  it('reports a missing file as MISSING', () => {
    const { cleanup: done, mod } = withPrerendered({ 'index.html': page(SCRIPT_A) })
    cleanup = done
    expect(mod.hashesIn(path.join(process.cwd(), '.next', 'server', 'app', 'nothing.html')).state).toBe(
      'MISSING',
    )
  })

  it('reports an existing page with no executable script as PRESENT with zero hashes', () => {
    const { cleanup: done, mod } = withPrerendered({
      'index.html': page(LD_JSON),
      '_not-found.html': page(SCRIPT_B),
    })
    cleanup = done
    const result = mod.hashesIn(path.join(process.cwd(), '.next', 'server', 'app', 'index.html'))
    expect(result.state).toBe('PRESENT')
    expect(result.hashes).toEqual([])
  })

  it('does not let a zero-script page inherit the not-found page hashes', () => {
    const { cleanup: done, mod } = withPrerendered({
      'index.html': page(LD_JSON),
      '_not-found.html': page(SCRIPT_B),
    })
    cleanup = done
    const notFound = mod.scriptHashesFor('/definitely-not-a-route/')
    expect(notFound.length).toBe(1)
    // The real page exists and contains no executable script, so it gets nothing at all.
    expect(mod.scriptHashesFor('/')).toEqual([])
  })
})

describe('path containment and normalisation', () => {
  it.each([
    ['a parent-directory traversal', '/../../../etc/passwd'],
    ['an encoded traversal', '/%2e%2e/%2e%2e/etc/passwd'],
    ['a null byte', '/index\0.html'],
    ['a nested escape', '/a/../../../../root/.ssh/id_rsa'],
  ])('refuses to resolve %s onto a file', (_label, pathname) => {
    const { cleanup: done, mod } = withPrerendered({
      'index.html': page(SCRIPT_A),
      '_not-found.html': page(SCRIPT_B),
    })
    cleanup = done
    expect(mod.prerenderedFileFor(pathname)).toBeNull()
  })

  it('resolves a real route with or without its trailing slash', () => {
    const { cleanup: done, mod } = withPrerendered({
      'contact-us.html': page(SCRIPT_A),
      'index.html': page(SCRIPT_B),
    })
    cleanup = done
    expect(mod.prerenderedFileFor('/contact-us')).toBe('contact-us.html')
    expect(mod.prerenderedFileFor('/contact-us/')).toBe('contact-us.html')
    expect(mod.prerenderedFileFor('/')).toBe('index.html')
  })
})

describe('only executable inline scripts are hashed', () => {
  it('hashes the executable scripts and ignores the data blocks', () => {
    const { cleanup: done, mod } = withPrerendered({
      'index.html': page(`${SCRIPT_A}${LD_JSON}${SCRIPT_B}`),
      '_not-found.html': page(SCRIPT_A),
    })
    cleanup = done
    const hashes = mod.scriptHashesFor('/')
    expect(hashes.length).toBe(2)
    for (const hash of hashes) expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/)
  })

  it('ignores a script with a src attribute — that is covered by self', () => {
    const { cleanup: done, mod } = withPrerendered({
      'index.html': page('<script src="/_next/static/chunks/a.js"></script>'),
      '_not-found.html': page(SCRIPT_A),
    })
    cleanup = done
    expect(mod.scriptHashesFor('/')).toEqual([])
  })
})
