/**
 * QA-FIX-1 (QA tester R17 interim pass; OGCS rows tsv 69a223f6; CT + owner rulings 2026-10-08):
 * S1 home project cards show the year only, S2 every project country has a chip, S3/N1 OGCS spellings and casing on /all-projects/,
 * S4 the Dry Soda hero stays the original photo (owner decision after DD review; the first swap was withdrawn), the closing band image stays decorative.
 * No <title> changes; the PTT LLDPE/LDPE wording is left as it is (owner: project team checks later).
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup as renderMarkup} from 'react-dom/server'
import {physicalHtml} from './physical-html'
import Page from '../../app/(site)/[[...slug]]/page'
import {portfolioView} from '../r4/R4Portfolio'
import {salmonDocument,salmonRoutes} from '../salmon'
import {salmonFamilyFor,salmonFamilyModel} from '../salmon-family-adapter'
const renderToStaticMarkup=(...args:Parameters<typeof renderMarkup>)=>physicalHtml(renderMarkup(...args))

const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(slug:string[])=>renderToStaticMarkup(await Page({params:Promise.resolve({slug}),searchParams:Promise.resolve({})}))
const view=()=>{
  const route=salmonRoutes().find(r=>r.routeId==='SALMON-pages-1353')!
  const doc=salmonDocument(route)
  return portfolioView(salmonFamilyModel(doc,salmonFamilyFor(doc)!))
}
const titles=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/project-titles.json'),'utf8')) as {titles:Record<string,string>}

describe('QA-FIX-1',()=>{
  it('S1: the home project cards show the year only, never a full post date',async()=>{
    const html=await render([])
    expect(html).not.toMatch(/(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d/)
  })
  it('S2: every country that has a project has a chip (Singapore included), and no chip repeats',()=>{
    const v=view()
    const chipHrefs=v.chips.map(c=>c.href)
    for(const c of v.countries.filter(x=>x.anchor!=='usa'))expect(chipHrefs,c.heading).toContain('#'+c.anchor)
    expect(chipHrefs).toContain('#usa')
    expect(new Set(chipHrefs).size).toBe(chipHrefs.length)
    expect(v.chips.find(c=>c.href!=='#usa'&&/singa/i.test(c.label))?.label).toBe('Singapore')
  })
  it('N1: group headings and card titles use the OGCS casing (headings in proper case, KBR/EDC upper case)',()=>{
    const v=view()
    expect(v.countries.map(c=>c.heading)).toContain('United States')
    expect(v.countries.map(c=>c.heading)).not.toContain('United states')
    expect(v.countries.map(c=>c.heading)).toContain('Jurong Island, Singapore')
    const byHref=new Map(v.countries.flatMap(c=>c.cards).map(c=>[c.href,c]))
    for(const [href,title] of Object.entries(titles.titles))expect(byHref.get(href)?.title,href).toBe(title)
    const lower=[...byHref.values()].filter(c=>c.title===c.title.toLowerCase()&&/[a-z]/.test(c.title)).map(c=>c.title)
    expect(lower).toEqual([])
    expect(byHref.get('/all-projects/thailand-projects/')!.meta).toBe('Thailand')
  })
  it('S3: the Vinachem card reads Bao Thang District; the misspelling is gone from /all-projects/',async()=>{
    const html=await render(['all-projects'])
    expect(html).toContain('Tang Loong Industrial Zone – Bao Thang District, Lao Cai Province, Vietnam')
    expect(html).not.toContain('Boa Thank')
    expect(html).toContain('United States')
    expect(html).not.toContain('>United states<')
  })
  it('S4 (owner decision via CT, R2): the Dry Soda hero is the original photo, unchanged; the process photo stays in its section; the closing band image is decorative',async()=>{
    const html=await render(['dry-soda-blasting'])
    const hero=/<img class="dr4-hero-img"[^>]*>/.exec(html)![0]
    expect(hero).toContain('drysoda-hero-')
    expect(hero).toContain('alt="Workers handling stacked black cooling tower fill packs on a hillside industrial site"')
    expect(html).toContain('drysoda-process-')
    const srcs=[...html.matchAll(/<img [^>]*\bsrc="(\/media\/design-r4\/[^"]+)"/g)].map(m=>m[1]!.replace(/-\d+\.webp$/,''))
    for(const s of new Set(srcs))expect(srcs.filter(x=>x===s).length,s).toBe(1)
    expect(/<img class="dr4-cta-img"[^>]*>/.exec(html)![0]).toMatch(/alt=""/)
  })
  it('PTT wording is untouched (owner: leave LLDPE and LDPE as they are for launch)',()=>{
    expect(readFileSync(path.join(process.cwd(),'content/design/design-r3-media.json'),'utf8')).toContain('Cooling tower cells at the PTT LLDPE II project')
    expect(readFileSync(path.join(process.cwd(),'content/salmon/documents/SALMON-pages-1353.json'),'utf8')).toContain('LDPE II')
  })
})
