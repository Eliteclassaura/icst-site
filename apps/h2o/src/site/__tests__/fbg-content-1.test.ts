/** FBG-CONTENT-1: OGCS audit-workbook FBG-02/05/07/08/09/13 as page-element fixes (slot-fixes batch rows + the production step's slotEdits). */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { heldImageAlt, releaseRoutes, salmonDocument } from '../salmon'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { SalmonCanonical } from '../SalmonCanonical'
import { LiveEnglishDetail } from '../Wave4Presentation'
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
  it('FBG-13 follow-up: no held image alt keeps the " - h2ocooling" tag; the category card alt is the OGCS wording', () => {
    expect(heldImageAlt('https://h2ocooling.com/wp-content/uploads/2018/02/crossflow-vs-counterflow-cooling-tower-1.jpg')).toBe('Crossflow vs counterflow cooling tower comparison')
    expect(heldImageAlt('https://h2ocooling.com/wp-content/uploads/2018/02/types-of-cooling-towers.jpg')).toBe('Types of Cooling Towers')
    // the Salmon media-library fallback is cleaned the same way
    expect(heldImageAlt('https://salmon-rhinoceros-754457.hostingersite.com/wp-content/uploads/2026/07/Aluminum-vs-FRP-Fan-Blades-h2ocooling.com_.jpg')).toBe('Aluminum vs FRP Fan Blades')
    const live = JSON.parse(readFileSync(path.join(APP, 'content/salmon/live-image-alt.json'), 'utf8')) as { alt: Record<string, string> }
    for (const [k, v] of Object.entries(live.alt)) expect(v, k).not.toMatch(/[-|]\s*h2ocooling(\.com)?\s*$/i)
  })
  it('FBG-13 follow-up: the thermal-storage description (Tech Articles card text) and the guide title read ICS; the thermography FAQ heading is spelled and plural', () => {
    const tsv = readFileSync(path.join(APP, 'ops/seo-pass/data/seo-fields.tsv'), 'utf8').split('\n').map((l) => l.split('\t'))
    expect(tsv.find((c) => c[0] === '/cooling-tower-thermal-storage/')![4]).toBe('Learn how cooling tower thermal storage works with ice storage, chilled water tanks, off-peak cooling, and demand management. Full design guide by ICS.')
    expect(tsv.find((c) => c[0] === '/guide-about-cooling-tower/')![3]).toBe('What is a Cooling Tower? - ICS')
    expect((DATA2.meta as Array<{ path: string; field: string; new: string }>).find((m) => m.path === '/cooling-tower-thermal-storage/')).toMatchObject({ field: 'description', new: expect.stringMatching(/by ICS\.$/) })
    const th = edits.find((e) => e.path === '/cooling-tower-thermography/')!.fixes.find((f) => f.key === 'body.3.1.1.7.145')!
    expect(th.afterCanon).toContain('Frequently Asked Questions')
    expect(th.afterCanon).not.toContain('Aseked')
  })
  it('F11: the flat fan-stack page title is exact, the "replacment" typo is gone from every served head, title, JSON-LD and image alt', () => {
    const tsv = readFileSync(path.join(APP, 'ops/seo-pass/data/seo-fields.tsv'), 'utf8').split('\n').map((l) => l.split('\t'))
    expect(tsv.find((c) => c[0] === '/dyna-fab-10-height-fan-stack/')![3]).toBe('Cooling Tower Fan Stack Replacement | Fiberglass Fan Stacks')
    expect(tsv.find((c) => c[0] === '/product/dyna-fab-10-height-fan-stack/')![3]).toBe("Dyna-Fab 10' Height Fan Stack | Cooling Tower Fan Stacks") // the /product/ twin keeps its own title (both rank)
    expect((DATA2.meta as Array<{ path: string; field: string; new: string; expectedOld: unknown }>).find((m) => m.path === '/dyna-fab-10-height-fan-stack/')).toMatchObject({ field: 'title', expectedOld: [null, 'Cooling tower fan stack replacment'] })
    for (const [file, body] of [['seo-fields.tsv', tsv.map((c) => c.slice(0, 5).join('\t')).join('\n')]]) expect(body, file).not.toMatch(/replacment/i)
    // the served pages: the flat LIVE page (head, JSON-LD) and the product that carries the typo in its image alt
    const flat = salmonDocument(releaseRoutes().find((r) => r.targetPath === '/dyna-fab-10-height-fan-stack/')!)
    // (its <title> and og/twitter tags come from the SEO field the step writes; in repository mode the head still shows the imported title, so only the JSON-LD graph, which is generated, is read here)
    const flatHtml = renderToStaticMarkup(createElement(LiveEnglishDetail, { doc: flat }))
    const jsonLd = [...flatHtml.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
    expect(jsonLd.length).toBeGreaterThan(100)
    expect(jsonLd).not.toMatch(/replacment/i)
    const product = salmonDocument(releaseRoutes().find((r) => r.targetPath === '/product/ics-14-height-fan-stack/')!)
    expect(renderToStaticMarkup(createElement(SalmonCanonical, { doc: product }))).not.toMatch(/replacment/i)
  })
})
