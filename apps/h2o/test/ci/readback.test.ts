import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runChecks } from '../../ops/ci/readback.mjs'

let server: http.Server
let base = ''
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/api/ready') return void res.writeHead(200).end('ok')
    if (req.url === '/') return void res.writeHead(200, { 'x-robots-tag': 'noindex' }).end('<meta name="robots" content="noindex"><footer>New footer text</footer>')
    if (req.url === '/chrome/') return void res.writeHead(200).end('<header><nav>Hudson | TUF-LITE II | Moore</nav></header><main>Search</main><footer><a>About ICS</a><a>Expert Industrial Cooling Solutions</a></footer>')
    if (req.url === '/crm/') return void res.writeHead(307, { location: '/admin/login/?redirect=/crm/' }).end()
    if (req.url === '/leaky/') return void res.writeHead(200).end('<link rel="canonical" href="http://localhost:3000/">')
    res.writeHead(404).end('no')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

describe('DEPLOY-PIPE-1 readback', () => {
  it('passes when status, content, headers and redirects match; fails (naming the problem, never the body) otherwise', async () => {
    const spec = {
      everywhereNotContains: ['localhost'],
      checks: [
        { name: 'ready', path: '/api/ready', status: 200 },
        { name: 'home', path: '/', status: 200, contains: ['New footer text'], notContains: ['Old default footer'], headers: { 'x-robots-tag': 'noindex' } },
        { name: 'crm redirect', path: '/crm/', status: 307, location: 'login' },
        { name: 'missing page', path: '/nope/', status: 200 },
        { name: 'old chrome still live', path: '/', status: 200, contains: ['Old default footer'] },
        { name: 'localhost leak', path: '/leaky/', status: 200 },
      ],
    }
    const r = (await runChecks(base, spec)) as Array<{ name: string; pass: boolean; problems: string[] }>
    const by = Object.fromEntries(r.map((x) => [x.name, x]))
    expect(['ready', 'home', 'crm redirect'].every((n) => by[n]!.pass)).toBe(true)
    expect(by['missing page']!.problems[0]).toContain('status 404')
    expect(by['old chrome still live']!.problems[0]).toContain('missing: Old default footer')
    expect(by['localhost leak']!.problems.join()).toContain('present (must be absent): localhost')
    expect(JSON.stringify(r)).not.toContain('canonical') // no body text is ever reported
  })
  it('region checks judge only the footer / header, not the whole page (a "Search" in main does not fail the footer)', async () => {
    const spec = { checks: [
      { name: 'footer ok', path: '/chrome/', status: 200, region: 'footer', contains: ['About ICS'] },
      { name: 'footer stale default', path: '/chrome/', status: 200, region: 'footer', notContains: ['Expert Industrial Cooling Solutions'] },
      { name: 'footer: search is only in main', path: '/chrome/', status: 200, region: 'footer', notContains: ['Search'] },
      { name: 'header menu missing TUF-LITE IV', path: '/chrome/', status: 200, region: 'header', contains: ['Hudson', 'TUF-LITE IV'] },
      { name: 'no such region', path: '/chrome/', status: 200, region: 'aside', contains: ['x'] },
    ] }
    const r = (await runChecks(base, spec)) as Array<{ name: string; pass: boolean; problems: string[] }>
    const by = Object.fromEntries(r.map((x) => [x.name, x]))
    expect(by['footer ok']!.pass).toBe(true)
    expect(by['footer: search is only in main']!.pass).toBe(true)
    expect(by['footer stale default']!.problems[0]).toContain('present (must be absent)')
    expect(by['header menu missing TUF-LITE IV']!.problems).toEqual(['missing: TUF-LITE IV'])
    expect(by['no such region']!.problems[0]).toContain('no <aside> element')
  })
  it('an unreachable host is a FAIL, not a crash', async () => {
    const r = (await runChecks('http://127.0.0.1:1', { checks: [{ name: 'x', path: '/', status: 200 }] })) as Array<{ pass: boolean; problems: string[] }>
    expect(r[0]).toMatchObject({ pass: false, problems: ['request failed'] })
  })
})
