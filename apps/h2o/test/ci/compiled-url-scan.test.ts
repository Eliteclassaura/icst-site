import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { scanDir, scanText } from '../../ops/ci/compiled-url-scan.mjs'

const opts = { origin: 'https://h2ocooling.com', forbid: ['staging.', 'sslip', '203.0.113.7'] }
const tmp = mkdtempSync(path.join(os.tmpdir(), 'scan-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('DEPLOY-PIPE-1 compiled-URL scan (bounded rule)', () => {
  it('forbidden hosts must be 0', () => {
    for (const bad of ['fetch("https://staging.h2ocooling.org/x")', 'u="http://abc.sslip.io"', 'host="203.0.113.7"']) expect(scanText(bad, opts).forbidden.length, bad).toBeGreaterThan(0)
    expect(scanText('const a="https://h2ocooling.com/x"', opts).forbidden).toHaveLength(0)
  })
  it('a source file named staging.ts or a file trace is not a staging host', () => {
    expect(scanText('"../../src/site/staging.ts","standard-head.tsx"', opts).forbidden).toHaveLength(0)
    mkdirSync(path.join(tmp, 'c'), { recursive: true })
    writeFileSync(path.join(tmp, 'c/route.js.nft.json'), '{"files":["src/site/staging.h2ocooling.org.ts","sslip"]}')
    writeFileSync(path.join(tmp, 'c/x.js'), 'const o="https://h2ocooling.com"')
    expect(scanDir(path.join(tmp, 'c'), opts)).toMatchObject({ pass: true, files: 1 })
  })
  it('localhost as the EFFECTIVE origin is forbidden', () => {
    for (const bad of ['"NEXT_PUBLIC_SERVER_URL":"http://localhost:3000"', 'metadataBase:new URL("http://localhost:3000")', 'canonical:"http://localhost/x"', 'siteUrl="http://localhost:3215"']) expect(scanText(bad, opts).forbidden.map((x: { kind: string }) => x.kind), bad).toContain('localhost-as-origin')
  })
  it('generic library fallbacks are ALLOWED and counted (parser bases, env-or-default, dev guards)', () => {
    const t = 'new URL(path, "http://localhost");x=process.env.PAYLOAD_PUBLIC_SERVER_URL||"http://localhost:3000";if(process.env.NODE_ENV==="development")u="http://localhost:3000"'
    const r = scanText(t, opts)
    expect(r.forbidden).toHaveLength(0)
    expect(r.allowed.length).toBe(3)
  })
  it('a directory scan needs the expected origin compiled in, reports counts and 3 examples', () => {
    mkdirSync(path.join(tmp, 'a'), { recursive: true })
    writeFileSync(path.join(tmp, 'a/x.js'), 'const o="https://h2ocooling.com";new URL(p,"http://localhost");new URL(q,"http://localhost")')
    writeFileSync(path.join(tmp, 'a/y.js'), 'new URL(r,"http://localhost");new URL(s,"http://localhost")')
    const r = scanDir(path.join(tmp, 'a'), opts)
    expect(r).toMatchObject({ pass: true, originSeen: true, allowedCount: 4 })
    expect(r.allowedExamples).toHaveLength(3)
    writeFileSync(path.join(tmp, 'a/z.js'), 'host="staging.h2ocooling.org"')
    expect(scanDir(path.join(tmp, 'a'), opts).pass).toBe(false)
    mkdirSync(path.join(tmp, 'b'), { recursive: true })
    writeFileSync(path.join(tmp, 'b/x.js'), 'const o="https://example.test"')
    expect(scanDir(path.join(tmp, 'b'), opts)).toMatchObject({ pass: false, originSeen: false })
  })
})
