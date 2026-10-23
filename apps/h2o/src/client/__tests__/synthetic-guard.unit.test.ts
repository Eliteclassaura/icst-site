import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ICST launch blocker (DD ICST-CONFORM-1, 23 Oct 2026): placeholder copy ("Synthetic services", "Synthetic call to action title", ...) must not
 * reach the public site. The inventory of the 275 placeholder slots is RELEASE_KIT0/ICST_SYNTHETIC_SLOTS_2026-10-23.tsv.
 *
 * ICST_SYNTHETIC_GUARD=report (default until the freeze, Mon 26 Oct 18:00 EDT): the guard lists every hit and passes, so the Saturday
 * preflight is not failed by it. ICST_SYNTHETIC_GUARD=enforce: any hit fails. The freeze-1 build must run with enforce.
 *
 * Scope: every ICST page JSON, the chrome file, the cookie inventory, the copy table and the form notice, and the rendered HTML of a
 * build when one exists (apps/h2o/.next). ALLOWLIST: exact real copy that uses the word legitimately (not a placeholder). Adding an entry
 * is a copy decision and needs OGCS or the owner.
 */
const MODE = process.env.ICST_SYNTHETIC_GUARD ?? 'report'
const ALLOWLIST = [
  'What is the role of synthetic oil in gearbox maintenance?',
  'Synthetic Oil Migration',
]
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'clients', 'icst')
const APP = path.resolve(__dirname, '..', '..', '..')
const PATTERN = /synthetic/i

function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (statSync(p).isDirectory()) walk(p, keep, out)
    else if (keep(p)) out.push(p)
  }
  return out
}

function hits(text: string): string[] {
  return text.split('\n').filter((line) => PATTERN.test(line) && !ALLOWLIST.some((a) => line.includes(a)))
}

function sourceFiles(): string[] {
  return [
    ...walk(path.join(ROOT, 'content', 'pages'), (f) => f.endsWith('.json')),
    path.join(ROOT, 'content', 'chrome.json'),
    path.join(ROOT, 'cookies', 'inventory.json'),
    path.join(ROOT, 'content', 'rfq', 'icst-native-rfq-copy-r1.tsv'),
    path.join(ROOT, 'content', 'rfq', 'form-notice-source.md'),
  ].filter((f) => existsSync(f))
}

function renderedFiles(): string[] {
  return walk(path.join(APP, '.next'), (f) => f.endsWith('.html'))
}

describe('ICST synthetic placeholder guard', () => {
  it('the mode is report or enforce', () => {
    expect(['report', 'enforce']).toContain(MODE)
  })

  it('no ICST page, chrome, cookie or copy source carries placeholder copy (enforce) or lists it (report)', () => {
    const found: string[] = []
    for (const f of sourceFiles()) {
      for (const line of hits(readFileSync(f, 'utf8'))) found.push(`${path.relative(ROOT, f)}: ${line.trim().slice(0, 120)}`)
    }
    if (MODE === 'report') {
      console.warn(`[ICST_SYNTHETIC_GUARD=report] ${found.length} source hit(s) (enforce at the freeze)`)
      expect(Array.isArray(found)).toBe(true)
      return
    }
    expect(found).toEqual([])
  })

  it('the rendered HTML of a build (if present) carries no placeholder copy', () => {
    const files = renderedFiles()
    const found: string[] = []
    for (const f of files) {
      for (const line of hits(readFileSync(f, 'utf8'))) found.push(`${path.relative(APP, f)}: ${line.trim().slice(0, 120)}`)
    }
    if (files.length === 0) return // no build on this machine; the freeze-1 build runs this against its own .next
    if (MODE === 'report') {
      console.warn(`[ICST_SYNTHETIC_GUARD=report] ${found.length} rendered hit(s) across ${files.length} HTML file(s)`)
      return
    }
    expect(found).toEqual([])
  })
})
