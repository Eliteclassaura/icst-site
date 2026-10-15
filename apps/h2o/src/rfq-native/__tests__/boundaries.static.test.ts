/**
 * Native RFQ boundaries (brief: strict CSP stays, no third-party scripts, no PII in URLs/analytics/logs; contract §2–§4).
 * Read from the sources: nothing here may load or call anything but this site's own /api/rfq/ endpoints.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const DIR = path.join(process.cwd(), 'src/rfq-native')
const files = readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f))
const source = Object.fromEntries(files.map((f) => [f, readFileSync(path.join(DIR, f), 'utf8')]))
const all = Object.values(source).join('\n')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('native RFQ boundaries', () => {
  it('names no remote host and loads no script', () => {
    expect(code(all)).not.toMatch(/https?:\/\//)
    expect(all).not.toMatch(/createElement\(\s*['"]script['"]\s*\)|<script|dangerouslySetInnerHTML|innerHTML|\beval\(|new Function\(/)
  })
  it('calls only this site’s /api/rfq/ endpoints (registry, token, submit), same-origin', () => {
    const calls = [...code(all).matchAll(/fetch(?:er)?\(\s*([^,)]+)/g)].map((m) => m[1]!.trim())
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c, c).toMatch(/^[`'"]\/api\/rfq\/(?:registry|token|submit)\/|^\.\.\.a$/)
    expect(all).not.toMatch(/sendBeacon|XMLHttpRequest|WebSocket/)
  })
  it('puts no visitor data in a URL: the registry URL carries the locale only, answers travel in the POST body only', () => {
    expect(code(all)).toMatch(/`\/api\/rfq\/registry\/\?locale=\$\{encodeURIComponent\(locale\)\}`/)
    expect(code(all)).not.toMatch(/\/api\/rfq\/(?:token|submit)\/\?/)
    expect(code(source['submission.ts']!)).toMatch(/method: 'POST'[\s\S]*body: JSON\.stringify\(body\)/)
  })
  it('logs nothing; stores exactly two sessionStorage keys (the draft and first-touch attribution), never localStorage or a cookie', () => {
    expect(code(all)).not.toMatch(/console\./)
    expect(code(all)).not.toMatch(/localStorage|document\.cookie\s*=/)
    expect([...new Set([...code(all).matchAll(/`\$\{STORAGE_NAMESPACE\}(\.rfq\.[a-z.0-9]+)`/g)].map((m) => m[1]))].sort()).toEqual(['.rfq.attr.v1', '.rfq.draft.v1'])
    // every sessionStorage write goes through one of the two keys
    for (const m of code(all).matchAll(/sessionStorage\?*\.setItem\(\s*([A-Z_]+)/g)) expect(['ATTR_KEY', 'DRAFT_KEY']).toContain(m[1])
  })
})
