/**
 * PRIVATE-STAGING-BLOCK-1 (CT 2026-10-11): the R3 AI concept plates under /media/private-staging/ answer 404 under the production indexing
 * policy and are served as before on the private/staging policy. The files stay on disk (the media identity counts and hashes them).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const O = 'https://h2ocooling.com'
const env0 = { ...process.env }
const APP = process.cwd()
const PLATE = '/media/private-staging/ai-r3-001-hero-structural-abstraction.png'

beforeEach(() => {
  vi.resetModules()
  const root = mkdtempSync(path.join(tmpdir(), 'h2o-psb-'))
  mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
  writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes: [], redirects: [] }))
  mkdirSync(path.join(root, 'releases'), { recursive: true })
  writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
  symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
  renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
  Object.assign(process.env, { H2O_CONTENT_SOURCE: 'payload', CONTENT_SNAPSHOT_DIR: root })
  delete process.env.H2O_INDEXING_POLICY
})
afterEach(() => { process.env = { ...env0 }; vi.resetModules() })

const status = async (p: string) => {
  const { proxy } = await import('../../proxy')
  const { NextRequest } = await import('next/server')
  const res = proxy(new NextRequest(`${O}${p}`))
  return { status: res.status, res }
}
const SPELLINGS = [
  PLATE,
  '/media/private-staging/',
  '/media/private-staging',
  '/media/private-staging/anything/else.png',
  '/media/Private-Staging/ai-r3-001-hero-structural-abstraction.png',
  '/media/%70rivate-staging/ai-r3-001-hero-structural-abstraction.png',
  '/media/private%2Dstaging/ai-r3-001-hero-structural-abstraction.png',
  '/media/%2570rivate-staging/ai-r3-001-hero-structural-abstraction.png',
  '/media//private-staging/ai-r3-001-hero-structural-abstraction.png',
  '/media/x/../private-staging/ai-r3-001-hero-structural-abstraction.png',
]

describe('PRIVATE-STAGING-BLOCK-1: the proxy', () => {
  it('production policy: every spelling of the directory is a 404 with no caching and nosniff; its neighbours are untouched', async () => {
    process.env.H2O_INDEXING_POLICY = 'production'
    for (const p of SPELLINGS) {
      const { status: s, res } = await status(p)
      expect(s, p).toBe(404)
      expect(res.headers.get('cache-control'), p).toBe('no-store')
      expect(res.headers.get('x-content-type-options'), p).toBe('nosniff')
    }
    for (const p of ['/media/private-stagingx/a.png', '/media/not-private-staging/a.png', '/media/og/a.png', '/media/design-r3/a.png', '/media/private-staging-notes.pdf']) {
      expect((await status(p)).status, p).not.toBe(404)
    }
  })
  it('the private/staging policies (unset, private, a typo) keep serving the plates for the private review', async () => {
    for (const policy of [undefined, 'private', 'staging', 'Production']) {
      vi.resetModules()
      if (policy === undefined) delete process.env.H2O_INDEXING_POLICY
      else process.env.H2O_INDEXING_POLICY = policy
      for (const p of [PLATE, '/media/%70rivate-staging/x.png']) expect((await status(p)).status, `${String(policy)} ${p}`).not.toBe(404)
    }
  })
  it('isPrivateStagingMedia: malformed escapes and unrelated paths are not matched', async () => {
    const { isPrivateStagingMedia } = await import('../../proxy')
    expect(isPrivateStagingMedia('/media/%E0%A4%A/private-staging/x')).toBe(false)
    expect(isPrivateStagingMedia('/privacy-policy/')).toBe(false)
    expect(isPrivateStagingMedia('/media/')).toBe(false)
    expect(isPrivateStagingMedia('/media\\private-staging\\x.png')).toBe(true)
  })
})

describe('PRIVATE-STAGING-BLOCK-1: nothing in the production render references the directory', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? (n === '__tests__' || n === 'node_modules' ? [] : walk(p)) : [p]
  })
  it('only the proxy (the block itself) and the isolated, unused staging component name the path; no content, slug manifest or stylesheet does', () => {
    const named = [...walk(path.join(APP, 'src')), ...walk(path.join(APP, 'content'))]
      .filter((f) => /\.(?:ts|tsx|json|css|tsv|md)$/.test(f))
      .filter((f) => readFileSync(f, 'utf8').includes('/media/private-staging'))
      .map((f) => path.relative(APP, f).split(path.sep).join('/'))
    expect(named.sort()).toEqual(['src/proxy.ts', 'src/site/private-staging-ai.tsx'])
    // and nothing imports that component
    const importers = walk(path.join(APP, 'src')).filter((f) => /\.(?:ts|tsx)$/.test(f) && /(?:from|import)\s*\(?\s*['"][^'"]*private-staging-ai['"]/.test(readFileSync(f, 'utf8')) && !f.endsWith('private-staging-ai.tsx'))
    expect(importers.map((f) => path.relative(APP, f))).toEqual([])
    // the descriptive-image manifest holds none of the plates
    const slugs = JSON.parse(readFileSync(path.join(APP, 'content/release/image-slugs.json'), 'utf8')) as { entries: Record<string, string> }
    expect(Object.keys(slugs.entries).filter((k) => k.includes('private-staging'))).toEqual([])
  })
})
