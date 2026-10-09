import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadAllow, parseAllow, scanDir, scanText } from '../../ops/ci/compiled-url-scan.mjs'

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

describe('DEPLOY-PIPE-1.2: an empty or malformed expected origin FAILS (Auditor F-5)', () => {
  const scan = path.resolve(process.cwd(), 'ops/ci/compiled-url-scan.mjs')
  const identity = path.resolve(process.cwd(), 'ops/ci/check-image-identity.sh')
  it('the compiled-URL scan refuses to run without a valid https origin (even on a clean directory)', () => {
    mkdirSync(path.join(tmp, 'd'), { recursive: true })
    writeFileSync(path.join(tmp, 'd/x.js'), 'const a=1')
    for (const args of [[], ['--origin', ''], ['--origin', 'http://h2ocooling.com'], ['--origin', 'h2ocooling.com']]) {
      const r = spawnSync('node', [scan, path.join(tmp, 'd'), ...args], { encoding: 'utf8' })
      expect(r.status, args.join(' ')).toBe(2)
    }
    expect(spawnSync('node', [scan, path.join(tmp, 'd'), '--origin', 'https://h2ocooling.com'], { encoding: 'utf8' }).status).toBe(1) // valid origin, but not compiled in
  })
  it('the identity script fails at once on an empty or non-https origin, before it touches docker', () => {
    for (const origin of ['', 'http://h2ocooling.com', 'h2ocooling.com']) {
      const r = spawnSync('bash', [identity, 'no-such-image', 'abc', '1', origin, path.join(tmp, 'ev')], { encoding: 'utf8' })
      expect(r.status, origin).toBe(1)
      expect(r.stdout).toContain('expected origin')
    }
  })
})

/**
 * DEPLOY-PIPE-1.6: the count-pinned allow file. CI run 37989456084 failed ONLY because the compiled bundle holds exactly 3
 * occurrences of the approved LANG-HOST-1 translate-origin literal `https://staging.h2ocooling.org` (apps/h2o/src/site/lang/
 * lang-model.ts, next to `https://www.h2ocooling.com`), compiled into two server chunks and one static chunk.
 */
describe('DEPLOY-PIPE-1.6: scan-allow.json (count-pinned, repo-owned)', () => {
  const LIT = 'https://staging.h2ocooling.org'
  const scan = path.resolve(process.cwd(), 'ops/ci/compiled-url-scan.mjs')
  const identity = path.resolve(process.cwd(), 'ops/ci/check-image-identity.sh')
  const entry = { literal: LIT, max: 3, reason: 'LANG-HOST-1 translate-origin allowlist (lang-model.ts); remove with the staging hostname', removeBy: '2026-10-20' }
  const allow = [entry]
  const withAllow = { ...opts, allow }
  let n = 0
  /** a compiled-output directory: `files` maps a relative path to its text (the expected origin is always compiled in) */
  const dirOf = (files: Record<string, string>) => {
    const d = path.join(tmp, `allow-${n++}`)
    mkdirSync(d, { recursive: true })
    writeFileSync(path.join(d, 'origin.js'), 'const o="https://h2ocooling.com"')
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(d, f)), { recursive: true })
      writeFileSync(path.join(d, f), text)
    }
    return d
  }
  const three = {
    'server/chunks/ssr/apps_h2o_155bskv._.js': `const ORIGINS=["https://www.h2ocooling.com","${LIT}"]`,
    'server/chunks/ssr/_src_09w_57c._.js': `x=["${LIT}","https://www.h2ocooling.com"]`,
    'static/chunks/1yw82bizrw0on.js': `var a=["https://www.h2ocooling.com","${LIT}"]`,
  }
  const writeAllow = (text: string) => {
    const f = path.join(tmp, `allow-${n++}.json`)
    writeFileSync(f, text)
    return f
  }

  it('the real scan-allow.json is exactly CT\'s entry', () => {
    const real = path.resolve(process.cwd(), 'ops/ci/scan-allow.json')
    expect(JSON.parse(readFileSync(real, 'utf8'))).toEqual([{ literal: LIT, max: 3, reason: 'LANG-HOST-1 translate-origin allowlist (apps/h2o/src/site/lang/lang-model.ts); remove with the staging hostname at GO+3-7d', removeBy: '2026-10-20' }])
    expect(loadAllow(real, { forbid: opts.forbid })).toHaveLength(1)
  })

  it('the 3 real hits pass: allowed by rule, reported with file and count, and the evidence keeps both numbers', () => {
    const r = scanDir(dirOf(three), withAllow)
    expect(r).toMatchObject({ pass: true, forbiddenRaw: 3, forbiddenFinal: 0, forbidden: [] })
    expect(r.allowedByRule).toEqual([{ ...entry, count: 3, files: expect.any(Array) }])
    expect(r.allowedByRule[0]!.files.map((f: { file: string; count: number }) => f.count)).toEqual([1, 1, 1])
    expect(r.allowedByRule[0]!.files.map((f: { file: string }) => f.file).sort()).toEqual(Object.keys(three).map((f) => f.replace(/\//g, path.sep)).sort())
    // without the rule the same directory is the old failure
    expect(scanDir(dirOf(three), opts)).toMatchObject({ pass: false, forbiddenRaw: 3, forbiddenFinal: 3 })
  })

  it('a 4th occurrence fails: when the total is over max, EVERY hit of that literal stays forbidden', () => {
    const r = scanDir(dirOf({ ...three, 'static/chunks/extra.js': `z="${LIT}"` }), withAllow)
    expect(r).toMatchObject({ pass: false, forbiddenRaw: 4, forbiddenFinal: 4, allowedByRule: [] })
    expect(r.forbidden.every((f: { overMax?: boolean }) => f.overMax === true)).toBe(true)
    // two in one file and two in another is the same total
    expect(scanDir(dirOf({ 'a.js': `["${LIT}","${LIT}"]`, 'b.js': `["${LIT}","${LIT}"]` }), withAllow).pass).toBe(false)
    // fewer than max is fine (the rule is a ceiling, not a requirement)
    expect(scanDir(dirOf({ 'a.js': `["${LIT}"]` }), withAllow)).toMatchObject({ pass: true, allowedByRule: [{ count: 1 }] })
  })

  it('a look-alike host, another scheme, a path, another case or a longer name stays forbidden', () => {
    for (const bad of [
      `"${LIT}.evil.test"`, // longer host
      `"${LIT}.evil.test/x"`,
      '"http://staging.h2ocooling.org"', // another scheme
      '"//staging.h2ocooling.org"',
      '"staging.h2ocooling.org"', // no scheme
      `"${LIT}/translate"`, // a path
      `"${LIT}:8443"`, // a port
      `"${LIT}-old"`,
      '"HTTPS://STAGING.H2OCOOLING.ORG"', // another case
      '"https://staging.h2ocooling.com"', // another host
      '"https://staging.other.org"',
      `"x${LIT}"`, // glued to a longer scheme
      `"${LIT}@evil.test"`,
    ]) expect(scanDir(dirOf({ 'a.js': bad }), withAllow), bad).toMatchObject({ pass: false, forbiddenFinal: 1, allowedByRule: [{ count: 0 }] })
    // an allowed hit next to a look-alike: the look-alike alone fails the scan
    expect(scanDir(dirOf({ 'a.js': `["${LIT}","${LIT}.evil.test"]` }), withAllow)).toMatchObject({ pass: false, forbiddenFinal: 1, allowedByRule: [{ count: 1 }] })
    // the allowed literal is accepted inside quotes, brackets, commas, spaces and JSON-escaped strings
    for (const ok of [`"${LIT}"`, `'${LIT}'`, `\`${LIT}\``, `[${LIT},x]`, `${LIT} x`, `\\"${LIT}\\"`, `(${LIT})`]) expect(scanDir(dirOf({ 'a.js': ok }), withAllow).pass, ok).toBe(true)
  })

  it('sslip and the forbidden-hosts variable are NEVER allowable, with or without an entry', () => {
    for (const bad of ['u="http://abc.sslip.io"', `u="${LIT}/?r=sslip"`, 'host="203.0.113.7"', `["${LIT}","203.0.113.7"]`]) {
      const r = scanDir(dirOf({ 'a.js': bad }), withAllow)
      expect(r.pass, bad).toBe(false)
      expect(r.forbidden.some((f: { kind: string }) => f.kind === 'forbidden:sslip' || f.kind === 'forbidden:203.0.113.7'), bad).toBe(true)
    }
    // defence in depth: even an entry that got past validation (built by hand here) never covers a non-`staging.` hit
    const sneaky = [{ ...entry, literal: 'https://a.b.203.0.113.7' }]
    expect(scanText('u="https://a.b.203.0.113.7"', { ...opts, allow: sneaky })).toMatchObject({ forbidden: [{ kind: 'forbidden:203.0.113.7' }], ruleHits: [] })
    // the allow file cannot name them either (it is refused outright, not ignored)
    expect(() => parseAllow(JSON.stringify([{ ...entry, literal: 'https://staging.sslip.io' }]), opts.forbid)).toThrow(/never allowable/)
    expect(() => parseAllow(JSON.stringify([{ ...entry, literal: 'https://staging.sslip.io' }]), ['staging.', 'sslip'])).toThrow(/never allowable/)
    expect(() => parseAllow(JSON.stringify([{ ...entry, literal: 'https://staging.203.0.113.7.nip.io' }]), ['staging.', 'sslip', '203.0.113.7'])).toThrow()
  })

  it('an empty allow file (or none) is the old behaviour; an explicit missing file stops the scan', () => {
    expect(parseAllow('[]', opts.forbid)).toEqual([])
    expect(scanDir(dirOf(three), { ...opts, allow: parseAllow('[]', opts.forbid) })).toMatchObject({ pass: false, forbiddenFinal: 3 })
    expect(loadAllow(path.join(tmp, 'no-such-allow.json'), { forbid: opts.forbid })).toEqual([]) // the default file missing = strict
    expect(() => loadAllow(path.join(tmp, 'no-such-allow.json'), { explicit: true, forbid: opts.forbid })).toThrow(/does not exist/)
  })

  it('a malformed allow file fails closed: bad JSON, a non-array, a missing reason or removeBy, a bad date or max, an unknown key, a duplicate', () => {
    const bad: Array<[string, RegExp]> = [
      ['', /not valid JSON/],
      ['{ "literal": "x" ', /not valid JSON/],
      ['{}', /array/],
      ['"x"', /array/],
      ['[1]', /object/],
      [JSON.stringify([{ ...entry, reason: undefined }]), /reason/],
      [JSON.stringify([{ ...entry, reason: '   ' }]), /reason/],
      [JSON.stringify([{ ...entry, reason: 'x' }]), /reason/],
      [JSON.stringify([{ ...entry, removeBy: undefined }]), /removeBy/],
      [JSON.stringify([{ ...entry, removeBy: '2026-13-40' }]), /removeBy/],
      [JSON.stringify([{ ...entry, removeBy: '2026-02-30' }]), /removeBy/],
      [JSON.stringify([{ ...entry, removeBy: 'soon' }]), /removeBy/],
      [JSON.stringify([{ ...entry, max: 0 }]), /max/],
      [JSON.stringify([{ ...entry, max: 3.5 }]), /max/],
      [JSON.stringify([{ ...entry, max: '3' }]), /max/],
      [JSON.stringify([{ ...entry, max: 1000 }]), /max/],
      [JSON.stringify([{ ...entry, extra: 1 }]), /unknown key/],
      [JSON.stringify([{ ...entry, literal: 'http://staging.h2ocooling.org' }]), /literal/],
      [JSON.stringify([{ ...entry, literal: 'https://h2ocooling.com' }]), /literal/],
      [JSON.stringify([{ ...entry, literal: `${LIT}/path` }]), /literal/],
      [JSON.stringify([{ ...entry, literal: 'https://staging.' }]), /literal/],
      [JSON.stringify([entry, entry]), /duplicate/],
      [JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ ...entry, literal: `https://staging.site${i}.org` }))), /at most/],
    ]
    for (const [text, why] of bad) expect(() => parseAllow(text, opts.forbid), text.slice(0, 60)).toThrow(why)
    expect(parseAllow(JSON.stringify([entry]), opts.forbid)).toEqual(allow)
    // and the command line stops (exit 2) rather than scanning with a guess
    const d = dirOf(three)
    for (const text of ['', '{', '[{"literal":"https://staging.h2ocooling.org","max":3}]']) {
      const r = spawnSync('node', [scan, d, '--origin', 'https://h2ocooling.com', '--allow', writeAllow(text)], { encoding: 'utf8' })
      expect(r.status, text).toBe(2)
      expect(r.stderr).toContain('scan-allow')
    }
  })

  it('the command line: the 3 real hits exit 0 with the evidence JSON (both numbers, rule, files); a 4th exits 1; the default file is the repo\'s', () => {
    const run = (d: string, extra: string[] = []) => {
      const out = path.join(tmp, `ev-${n++}.json`)
      const r = spawnSync('node', [scan, d, '--origin', 'https://h2ocooling.com', '--out', out, ...extra], { encoding: 'utf8' })
      return { r, ev: JSON.parse(readFileSync(out, 'utf8')) }
    }
    const ok = run(dirOf(three))
    expect(ok.r.status).toBe(0)
    expect(JSON.parse(ok.r.stdout)).toMatchObject({ pass: true, forbidden: 0, forbiddenRaw: 3, allowedByRule: 3, originSeen: true })
    expect(ok.ev).toMatchObject({ pass: true, forbiddenRaw: 3, forbiddenFinal: 0, forbidden: [], allowFile: 'scan-allow.json' })
    expect(ok.ev.allowedByRule).toEqual([expect.objectContaining({ literal: LIT, max: 3, count: 3, removeBy: '2026-10-20', reason: expect.stringContaining('LANG-HOST-1') })])
    expect(ok.ev.allowedByRule[0].files).toHaveLength(3)
    const four = run(dirOf({ ...three, 'static/chunks/extra.js': `z="${LIT}"` }))
    expect(four.r.status).toBe(1)
    expect(four.ev).toMatchObject({ pass: false, forbiddenRaw: 4, forbiddenFinal: 4, allowedByRule: [] })
    // a different allow file by flag (tests only); an empty one is the old behaviour
    const emptied = run(dirOf(three), ['--allow', writeAllow('[]')])
    expect(emptied.r.status).toBe(1)
    expect(emptied.ev).toMatchObject({ forbiddenRaw: 3, forbiddenFinal: 3, allowFile: null })
    // the allow file never rescues a missing origin
    expect(spawnSync('node', [scan, dirOf({}), '--origin', 'https://other.example.org'], { encoding: 'utf8' }).status).toBe(1)
  })

  it('no environment variable or repository variable can widen the allowance: the scan and the identity script read only the repo file or --allow', () => {
    const src = readFileSync(scan, 'utf8')
    const sh = readFileSync(identity, 'utf8')
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')).not.toMatch(/process\.env/) // code, not the header comment
    expect(sh).not.toMatch(/--allow|ALLOW/i)
    expect(sh).toContain('compiled-url-scan.mjs')
    expect(readFileSync(path.resolve(process.cwd(), 'docs/DEPLOY_PIPELINE.md'), 'utf8')).toContain('scan-allow.json')
  })
})
