/** FBG-CONTENT-1: OGCS audit-workbook FBG-02/05/07/08/09/13 as page-element fixes (slot-fixes batch rows + the production step's slotEdits). */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DATA2 } from '../../../ops/prod-step/staging-audit-redirects-step-2.mjs'

const APP = process.cwd()
type Fix = { key: string; field: string; before: string; after: unknown; afterCanon: string }
const sf = JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/slot-fixes.json'), 'utf8')) as Record<string, { slots: Fix[] }>
const edits = DATA2.slotEdits as Array<{ path: string; fixes: Array<{ key: string; field: string; before: string; after: unknown; afterCanon: string }> }>
const fbg = edits.filter((e) => !e.path.startsWith('/product/'))
const text = (v: unknown): string => JSON.stringify(v)
const canonOf = (p: string, key: string) => sf[p]!.slots.find((s) => s.key === key)!.afterCanon

describe('FBG-CONTENT-1', () => {
  it('carries 19 pages of FBG fixes next to the Brentwood H1, each one in the batch data and the step with the same result', () => {
    expect(edits).toHaveLength(20)
    expect(fbg).toHaveLength(19)
    for (const e of fbg) for (const f of e.fixes) {
      expect(canonOf(e.path, f.key), `${e.path} ${f.key}`).toBe(f.afterCanon)
      expect(f.after, `${e.path} ${f.key}`).toEqual(sf[e.path]!.slots.find((s) => s.key === f.key)!.after)
    }
  })
  it('FBG-02/05/07/08/09: the typo, the acronym, the heading, US spelling, no genuine-OEM and no speed or percentage claim', () => {
    const all = (p: string) => text(fbg.find((e) => e.path === p)!.fixes.map((f) => f.afterCanon))
    expect(all('/closed-loop-vs-open-loop/')).toContain('The extra investment')
    expect(all('/closed-loop-vs-open-loop/')).not.toContain('? he extra')
    expect(all('/resources/tools/')).toContain('ASHRAE Psychrometric Chart')
    expect(all('/disaster-recovery/')).toContain('Damage assessment')
    expect(all('/disaster-recovery/')).not.toContain('Assessment/tents')
    const moore = all('/fans/moore-fans/')
    expect(moore).toContain('Maximize the performance')
    expect(moore).not.toContain('genuine')
    expect(moore).not.toContain('Fast lead times')
    expect(all('/dry-soda-blast-cleaning-services-2/')).not.toContain('40%')
  })
  it('FBG-13: no company-name use of H2OCooling / H2O Cooling remains in a fixed element (URLs and email domains are untouched); alts lose the file-style site tag', () => {
    for (const e of fbg.filter((x) => !['/closed-loop-vs-open-loop/', '/resources/tools/', '/disaster-recovery/', '/fans/moore-fans/', '/dry-soda-blast-cleaning-services-2/'].includes(x.path))) {
      for (const f of e.fixes) {
        const after = f.field === 'alt' ? String(f.after) : text(f.after)
        expect(after.replace(/h2ocooling\.(com|org)|www\.h2ocooling/gi, '').match(/\bH2O ?Cooling\b/gi) ?? [], `${e.path} ${f.key}`).toEqual([])
        if (f.field === 'alt') expect(after).not.toMatch(/-\s*h2ocooling\s*$/i)
      }
    }
  })
})
