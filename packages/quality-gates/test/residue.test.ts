import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { scan, scanText, sha256, LEGACY_KEY_SHA256, loadLegacyHostHashes } from '../src/index.ts'

const REPO = resolve(import.meta.dirname, '../../..')
const LEGACY_SUBS = resolve(REPO, 'legacy-reference/syed-ai-site/subscribers.php')
const LEGACY_PROXY = resolve(REPO, 'legacy-reference/search-evidence-suite/search-evidence-console/proxy.php')

// The key literal was redacted from the repository copy before the first push (ADR-027). When a
// pristine archive is present locally the hash constant is checked against it; otherwise that one
// test is skipped and the scanner is exercised with the hash of a planted test key instead.
function pristineKey(): string | null {
  if (!existsSync(LEGACY_SUBS)) return null
  const m = readFileSync(LEGACY_SUBS, 'utf8').match(/const SUBS_KEY = '([0-9a-f]{18})'/)
  return m ? m[1]! : null
}
const TEST_KEY = 'a1b2c3d4e5f6a7b8c9' // 18 hex, same shape as the legacy key
const KEYS = new Set([sha256(TEST_KEY)])

let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gates-'))
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('legacy admin key', () => {
  it('redacted copy contains no 18-hex key literal', () => {
    expect(existsSync(LEGACY_SUBS)).toBe(true)
    const src = readFileSync(LEGACY_SUBS, 'utf8')
    expect(src).toContain('<legacy-admin-key-redacted>')
  })
  it.skipIf(pristineKey() === null)('hash constant matches the key in a pristine archive', () => {
    expect(sha256(pristineKey()!)).toBe(LEGACY_KEY_SHA256)
  })
  it('flags the key when planted in a source file (by hash)', () => {
    const f = scanText(`const k = '${TEST_KEY}'`, 'x.ts', {
      hostHashes: new Set(),
      forbidden: [],
      keyHashes: new Set([sha256(TEST_KEY)]),
    })
    expect(f.map((x) => x.rule)).toContain('legacy-admin-key')
  })
  it('does not flag unrelated 18-hex strings', () => {
    const f = scanText(`const k = '0123456789abcdef01'`, 'x.ts', { hostHashes: new Set(), forbidden: [] })
    expect(f).toEqual([])
  })
})

describe('legacy allowlist hosts', () => {
  it('loads the committed hash list beside proxy.php without exposing hosts', () => {
    const hashes = loadLegacyHostHashes(LEGACY_PROXY)
    expect(hashes.size).toBeGreaterThanOrEqual(10)
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
  it('the redacted proxy.php names no client host', () => {
    const src = readFileSync(LEGACY_PROXY, 'utf8')
    const hashes = loadLegacyHostHashes(LEGACY_PROXY)
    for (const m of src.matchAll(/['"]([a-z0-9.-]+\.[a-z]{2,})['"]/gi))
      expect(hashes.has(sha256(m[1]!.toLowerCase()))).toBe(false)
  })
  it('flags a planted allowlist host and ignores ordinary hosts', () => {
    const host = 'client-example.test'
    const hashes = new Set([sha256(host)])
    expect(
      scanText(`fetch('https://${host}/x')`, 'x.ts', { hostHashes: hashes, forbidden: [] }).map(
        (f) => f.rule,
      ),
    ).toContain('legacy-allowlist-host')
    expect(scanText(`fetch('https://example.com/x')`, 'x.ts', { hostHashes: hashes, forbidden: [] })).toEqual(
      [],
    )
  })
})

describe('secret shapes', () => {
  it('flags real-looking secret assignments but not placeholders', () => {
    const bad = scanText('PAYLOAD_SECRET=9f8e7d6c5b4a39281706f5e4d3c2b1a0', '.env.prod', {
      hostHashes: new Set(),
      forbidden: [],
    })
    expect(bad.map((f) => f.rule)).toContain('env-secret-assignment')
    const ok = scanText(
      'PAYLOAD_SECRET=generate-a-long-random-string\nSMTP_PASS=change-me\nS3_SECRET_ACCESS_KEY=minioadmin',
      '.env.example',
      { hostHashes: new Set(), forbidden: [] },
    )
    expect(ok).toEqual([])
  })
  it('flags private key blocks and vendor token shapes', () => {
    // assembled at runtime so this test file does not itself trip the scanner
    const pem = ['-----BEGIN RSA', 'PRIVATE', 'KEY-----'].join(' ')
    const aws = 'AKIA' + 'ABCDEFGHIJKLMNOP'
    const ant = 'sk-ant-' + 'abcdefghijklmnopqrstuvwxyz'
    const f = scanText([pem, aws, ant].join('\n'), 'x', { hostHashes: new Set(), forbidden: [] })
    expect(new Set(f.map((x) => x.rule))).toEqual(
      new Set(['private-key-block', 'aws-access-key', 'anthropic-key']),
    )
  })
})

describe('scan(root)', () => {
  it('fails on a planted key, a committed .env and a client literal; passes when clean', async () => {
    mkdirSync(join(tmp, 'src'), { recursive: true })
    mkdirSync(join(tmp, 'legacy-reference'), { recursive: true })
    writeFileSync(join(tmp, 'legacy-reference', 'ok.txt'), TEST_KEY) // reference path is exempt
    writeFileSync(join(tmp, 'src', 'clean.ts'), 'export const a = 1\n')
    expect(await scan({ root: tmp, forbiddenLiterals: ['syed.ai'], keyHashes: KEYS })).toEqual([])

    writeFileSync(join(tmp, 'src', 'bad.ts'), `const k='${TEST_KEY}'; const site='https://syed.ai/'\n`)
    writeFileSync(join(tmp, '.env'), 'PAYLOAD_SECRET=x\n')
    // a gitignored local .env is NOT a finding; the committed-looking one above (no .gitignore yet) is

    mkdirSync(join(tmp, '.next', 'standalone'), { recursive: true })
    writeFileSync(join(tmp, '.next', 'standalone', '.env'), 'X=1\n')
    const findings = await scan({ root: tmp, forbiddenLiterals: ['syed.ai'], keyHashes: KEYS })
    const rules = new Set(findings.map((f) => f.rule))
    expect(rules).toEqual(new Set(['legacy-admin-key', 'forbidden-literal', 'env-file-present']))
    expect(findings.find((f) => f.file === '.next/standalone/.env')?.detail).toMatch(/build bundle/)

    // With a .gitignore excluding .env and .next, the developer's local .env stops being a finding
    writeFileSync(join(tmp, '.gitignore'), '.env\n.next/\n')
    const after = await scan({ root: tmp, forbiddenLiterals: ['syed.ai'], keyHashes: KEYS })
    expect(after.map((f) => f.file)).not.toContain('.env')
    expect(after.map((f) => f.file)).not.toContain('.next/standalone/.env')
    // but scanning the bundle directory explicitly still catches the copied .env
    const bundle = await scan({ root: join(tmp, '.next') })
    expect(bundle.map((f) => f.rule)).toContain('env-file-present')
  })
})

describe('this repository', () => {
  it('is clean outside the reference paths', async () => {
    const findings = await scan({ root: REPO })
    expect(findings, JSON.stringify(findings, null, 1)).toEqual([])
  })
})
