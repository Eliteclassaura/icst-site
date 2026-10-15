import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { proxy } from '../../proxy'
import type { ListedPage } from '../site/content'
import { buildIndex, ledgerIssues, loadRedirects, normalisePath, parseLedger, redirectFor, resetRedirectCache } from '../site/redirects'

const page = (p: string, noindex = false): ListedPage => ({ name: p, path: p, page: { title: p, layout: [], noindex } })
const pages = [page('/'), page('/parts/'), page('/services/'), page('/hidden/', true)]
const T = (rows: string[]) => `from\tto\tstatus\tnote\n${rows.join('\n')}\n`
const codes = (rows: string[]) => ledgerIssues(parseLedger(T(rows)).rows, pages).map((i) => i.code)

describe('ledger parsing', () => {
  it('reads tab rows, ignores comments and blank lines, normalises slashes and queries, and rejects a bad header, status or source', () => {
    const { rows, issues } = parseLedger(T(['# a comment', '', '/old/a\t/parts\t301\tmoved', '/old/b?x=1\t\t410\tgone']))
    expect(issues).toEqual([])
    expect(rows.map((r) => [r.from, r.to, r.status])).toEqual([['/old/a/', '/parts/', 301], ['/old/b/', '', 410]])
    expect(parseLedger('a\tb\tc\n').issues[0].code).toBe('BAD_HEADER')
    expect(parseLedger(T(['/x\t/parts\t302\t'])).issues[0].code).toBe('BAD_STATUS')
    expect(parseLedger(T(['x\t/parts\t301\t'])).issues[0].code).toBe('BAD_FROM')
    expect(normalisePath('a/b?q#f')).toBe('/a/b/')
  })
})

describe('ledger rules', () => {
  it('accepts a clean ledger', () => expect(codes(['/old/\t/parts/\t301\t', '/gone/\t\t410\t'])).toEqual([]))
  it('refuses a chain, a loop, a self redirect and a destination that is itself redirected', () => {
    expect(codes(['/a/\t/b/\t301\t', '/b/\t/parts/\t301\t'])).toContain('CHAIN')
    expect(codes(['/a/\t/b/\t301\t', '/b/\t/a/\t301\t'])).toContain('CHAIN')
    expect(codes(['/a/\t/a/\t301\t'])).toContain('SELF')
  })
  it('refuses home as a destination or a source, a noindex or missing destination, and a 410 with a destination', () => {
    expect(codes(['/a/\t/\t301\t'])).toContain('TO_HOME')
    expect(codes(['/\t/parts/\t301\t'])).toContain('FROM_HOME')
    expect(codes(['/a/\t/hidden/\t301\t'])).toContain('TARGET_NOINDEX')
    expect(codes(['/a/\t/nowhere/\t301\t'])).toContain('TARGET_MISSING')
    expect(codes(['/a/\t/parts/\t410\t'])).toContain('GONE_HAS_TARGET')
    expect(codes(['/a/\t\t301\t'])).toContain('NO_TARGET')
  })
  it('refuses duplicates, a source that is a live page, and platform paths', () => {
    expect(codes(['/a/\t/parts/\t301\t', '/a/\t/services/\t301\t'])).toContain('DUPLICATE_FROM')
    expect(codes(['/parts/\t/services/\t301\t'])).toContain('SHADOWS_PAGE')
    for (const p of ['/crm/x/', '/admin/', '/api/x/', '/_next/a/']) expect(codes([`${p}\t/parts/\t301\t`])).toContain('PLATFORM_PATH')
  })
  it('the index keeps only rows that break no rule, so a bad row never half-applies', () => {
    const idx = buildIndex(T(['/ok/\t/parts/\t301\t', '/chain/\t/ok/\t301\t', '/gone/\t\t410\t']), pages)
    expect([...idx.map.keys()].sort()).toEqual(['/gone/', '/ok/'].sort())
    expect(idx.issues.map((i) => i.code)).toEqual(['CHAIN', 'TARGET_MISSING'])
  })
})

describe('named exceptions (CT-1 signed, exact pairs only)', () => {
  it('the home alias and the six old sitemaps are allowed to their exact targets', () => {
    expect(codes(['/home.html\t/\t301\talias'])).toEqual([])
    expect(codes(['/post-sitemap1.xml\t/sitemap_index.xml\t301\tx', '/page-sitemap.xml\t/sitemap_index.xml\t301\tx'])).toEqual([])
    expect(normalisePath('/home.html')).toBe('/home.html')
    expect(normalisePath('/sitemap_index.xml')).toBe('/sitemap_index.xml')
  })
  it('nothing else gets the exemption: another source to home, another to the sitemap index, or the exempt source to another target', () => {
    expect(codes(['/other.html\t/\t301\tx'])).toContain('TO_HOME')
    expect(codes(['/random/\t/sitemap_index.xml\t301\tx'])).toContain('TARGET_MISSING')
    expect(codes(['/home.html\t/parts/\t301\tx'])).not.toContain('TO_HOME')
    expect(codes(['/home.html\t/hidden/\t301\tx'])).toContain('TARGET_NOINDEX')
  })
  it('the proxy-level lookup finds a file path without adding a slash', () => {
    const idx = buildIndex(T(['/home.html\t/\t301\talias']), pages)
    expect(redirectFor('/home.html', idx)).toEqual({ to: '/', status: 301 })
  })
})

describe('slash-only rows', () => {
  it('a row that only adds the trailing slash is a no-op handled by the site itself, not a loop or an error', () => {
    const p = parseLedger(T(['/x\t/x/\t301\tlive 301', '/y/\t/parts/\t301\t']))
    expect(p.slashOnly.map((r) => r.from)).toEqual(['/x/'])
    expect(p.rows.map((r) => r.from)).toEqual(['/y/'])
    const idx = buildIndex(T(['/x\t/x/\t301\t']), pages)
    expect(idx.issues).toEqual([])
    expect(idx.slashOnly).toBe(1)
    expect(idx.map.size).toBe(0)
  })
  it('a true self redirect (same string) is still a loop', () => {
    expect(codes(['/a/\t/a/\t301\t'])).toContain('SELF')
  })
})

describe('redirectFor', () => {
  const idx = buildIndex(T(['/old/page\t/parts/\t301\t', '/gone/\t\t410\t']), pages)
  it('matches with or without the trailing slash and ignores the query; unlisted and platform paths are not redirected', () => {
    expect(redirectFor('/old/page', idx)).toEqual({ to: '/parts/', status: 301 })
    expect(redirectFor('/old/page/?utm=1', idx)).toEqual({ to: '/parts/', status: 301 })
    expect(redirectFor('/gone/', idx)).toEqual({ to: '', status: 410 })
    expect(redirectFor('/parts/', idx)).toBeNull()
    expect(redirectFor('/api/old/page', idx)).toBeNull()
  })
})

describe('the proxy applies the ledger in one hop', () => {
  let dir = ''
  const prev = { ...process.env }
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ledger-'))
    const root = path.join(dir, 'icst')
    mkdirSync(path.join(root, 'content', 'pages'), { recursive: true })
    mkdirSync(path.join(root, 'redirects'), { recursive: true })
    for (const n of ['home', 'parts']) writeFileSync(path.join(root, 'content', 'pages', `${n}.json`), JSON.stringify({ title: n, layout: [] }))
    writeFileSync(path.join(root, 'redirects', 'ledger.tsv'), T(['/old/\t/parts/\t301\tmoved', '/gone/\t\t410\t', '/bad/\t/\t301\t']))
    process.env.CLIENTS_DIR = dir
    resetRedirectCache()
  })
  afterEach(() => {
    process.env = { ...prev }
    resetRedirectCache()
  })
  const get = (p: string) => proxy(new NextRequest(`https://icsthailand.co.th${p}`))
  it('301 to the final page (query dropped), 410 for a gone page, and a bad row (to home) is dropped', () => {
    const r = get('/old/?utm_source=x')
    expect(r.status).toBe(301)
    expect(new URL(r.headers.get('location')!).pathname).toBe('/parts/')
    expect(new URL(r.headers.get('location')!).search).toBe('')
    expect(get('/gone/').status).toBe(410)
    expect(get('/bad/').status).not.toBe(301)
    expect(get('/parts/').status).toBe(200)
  })
  it('never touches CRM, admin or API paths', () => {
    for (const p of ['/crm/', '/admin/', '/api/x/']) expect([301, 410]).not.toContain(get(p).status)
  })
  it('the committed ledger of the client satisfies every rule against its real pages', () => {
    process.env.CLIENTS_DIR = path.resolve(__dirname, '../../../../../clients')
    resetRedirectCache()
    const idx = loadRedirects('icst')
    // Structural rules always hold. Destinations that are not built yet are reported, and become errors once LEDGER_STRICT=1 (set for launch).
    const structural = idx.issues.filter((i) => i.code !== 'TARGET_MISSING')
    expect(structural).toEqual([])
    if (process.env.LEDGER_STRICT) expect(idx.issues).toEqual([])
    expect(readFileSync(path.resolve(__dirname, '../../../../../clients/icst/redirects/ledger.tsv'), 'utf8').startsWith('from\tto\tstatus')).toBe(true)
  })
})
