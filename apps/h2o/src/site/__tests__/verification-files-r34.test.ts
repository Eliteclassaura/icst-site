/**
 * R3.4 (Control Tower 2026-10-05, owner request): site-verification files served at the site root from H2O_VERIFICATION_FILES,
 * read at runtime (no rebuild per token), so Semrush can verify ownership (and Google/Bing/Yandex at launch) while staging stays
 * closed to indexing. Map parsing and validation, exact root matching, precedence (robots.txt, sitemaps, routes, redirects,
 * public files win) and the response headers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseVerificationFiles, verificationFileFor } from '../../content/verification-files'

const O = 'https://h2ocooling.com'
const env = { ...process.env }

describe('H2O_VERIFICATION_FILES parsing', () => {
  it('keeps only valid root .html/.txt names with text bodies up to 1 KB; invalid entries are logged without their values', () => {
    const warnings: string[] = []
    const raw = JSON.stringify({
      'semrush-abc123.html': 'semrush-site-verification: abc123',
      'google0f1e2d.html': 'google-site-verification: google0f1e2d.html',
      'BingSiteAuth.txt': 'token-secret-value',
      '../escape.html': 'nope-secret',
      'dir/file.html': 'nope-secret',
      '.hidden.txt': 'nope-secret',
      'script.php': 'nope-secret',
      'big.txt': 'x'.repeat(1025),
      'number.txt': 42,
    })
    const map = parseVerificationFiles(raw, (m) => warnings.push(m))
    expect([...map.keys()]).toEqual(['semrush-abc123.html', 'google0f1e2d.html', 'BingSiteAuth.txt'])
    expect(map.get('semrush-abc123.html')).toEqual({ body: 'semrush-site-verification: abc123', contentType: 'text/html; charset=utf-8' })
    expect(map.get('BingSiteAuth.txt')?.contentType).toBe('text/plain; charset=utf-8')
    expect(warnings).toHaveLength(6)
    for (const w of warnings) {
      expect(w).not.toMatch(/secret|escape|hidden|script|big|number|xxxx/)
      expect(w).toMatch(/^\[h2o\] H2O_VERIFICATION_FILES entry \d+ ignored: /)
    }
    const bad: string[] = []
    expect(parseVerificationFiles('{not json', (m) => bad.push(m)).size).toBe(0)
    expect(parseVerificationFiles('["a.html"]', (m) => bad.push(m)).size).toBe(0)
    expect(bad).toHaveLength(2)
    expect(parseVerificationFiles(undefined).size).toBe(0)
  })
  it('matches only the exact root path, from the environment at request time', () => {
    const e = { ...process.env, H2O_VERIFICATION_FILES: JSON.stringify({ 'semrush-abc123.html': 'semrush-site-verification: abc123' }) } as NodeJS.ProcessEnv
    expect(verificationFileFor('/semrush-abc123.html', e)?.body).toBe('semrush-site-verification: abc123')
    for (const p of ['/x/semrush-abc123.html', '/semrush-abc123.html/', '/SEMRUSH-abc123.html', '/semrush-abc123.htm', '/'])
      expect(verificationFileFor(p, e), p).toBeNull()
    // a new token takes effect without a rebuild
    const next = { ...e, H2O_VERIFICATION_FILES: JSON.stringify({ 'semrush-new999.html': 'semrush-site-verification: new999' }) } as NodeJS.ProcessEnv
    expect(verificationFileFor('/semrush-abc123.html', next)).toBeNull()
    expect(verificationFileFor('/semrush-new999.html', next)?.body).toBe('semrush-site-verification: new999')
  })
})

describe('served by the proxy (payload runtime)', () => {
  beforeEach(() => {
    vi.resetModules()
    const root = mkdtempSync(path.join(tmpdir(), 'h2o-verify-'))
    mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
    const routes = [{ path: '/', routeId: 'T-home', state: 'PUBLIC', export: true, indexable: true, sitemap: true, canonical: `${O}/`, routeClass: 'pages' }]
    writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes, redirects: [{ source: '/old-verify.html', destination: '/', status: 301 }] }))
    mkdirSync(path.join(root, 'releases'), { recursive: true })
    writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
    symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
    renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
    Object.assign(process.env, {
      H2O_CONTENT_SOURCE: 'payload',
      CONTENT_SNAPSHOT_DIR: root,
      H2O_VERIFICATION_FILES: JSON.stringify({ 'semrush-abc123.html': 'semrush-site-verification: abc123', 'robots.txt': 'User-agent: *\nAllow: /', 'old-verify.html': 'shadow?' }),
    })
    delete process.env.H2O_INDEXING_POLICY
  })
  afterEach(() => { process.env = { ...env } })
  it('answers 200 with the body, no-store and noindex, nofollow; robots.txt, a redirect and other paths are unchanged', async () => {
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    const res = proxy(new NextRequest(`${O}/semrush-abc123.html`))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('semrush-site-verification: abc123')
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    // robots.txt keeps its runtime answer (staging: Disallow everything), even when the map names it
    expect(await proxy(new NextRequest(`${O}/robots.txt`)).text()).toBe('User-agent: *\nDisallow: /\n')
    // a published redirect keeps answering its 301
    expect(proxy(new NextRequest(`${O}/old-verify.html`)).status).toBe(301)
    // a name that is not in the map behaves as before
    expect(proxy(new NextRequest(`${O}/other-abc.html`)).headers.get('cache-control')).not.toBe('no-store')
  })
  it('with the variable unset nothing is served from the map', async () => {
    delete process.env.H2O_VERIFICATION_FILES
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    expect(proxy(new NextRequest(`${O}/semrush-abc123.html`)).headers.get('cache-control')).not.toBe('no-store')
  })
})
