/**
 * CONTENT-FIX-3 (post-launch UPDATE-2, CT 2026-10-08): OGCS UPDATE-2 HVAC meta rows (seal e7b228b7) and LOCALE-HVAC-REWRITE-1 (seal 6e23108f).
 * UP2-01 is already the stored value; UP2-02 changes the category meta; UP2-03..06 are superseded by the locale rewrite, whose metas are final.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const LEDGER=JSON.parse(readFileSync(path.join(APP,'content/design/locale-hvac-rewrite-1.json'),'utf8')) as {pages:Array<{language:string;routeId:string;route:string;h1AndTitle:string;meta:string;blocks:number;h2:string[];toc:string[]}>}
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const seoRows=readFileSync(path.join(APP,'ops/seo-pass/data/seo-fields.tsv'),'utf8').split('\n').map(l=>l.split('\t'))
const row=(p:string)=>seoRows.find(c=>c[0]===p)!
const plain=(html:string)=>html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/(?:href|src|content|data-[a-z-]+)="[^"]*"/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')

describe('CONTENT-FIX-3: UPDATE-2 meta rows',()=>{
  it('UP2-01 is the stored value (no HVAC); UP2-02 is the neutral industrial category meta',()=>{
    expect(row('/cooling-tower-maintenance-checklist/')[4]).toBe('Maximize efficiency with our 2026 cooling tower maintenance checklist. Learn to prevent corrosion, improve safety, and optimize your industrial cooling system.')
    expect(row('/category/cooling-tower-servicesindustrial-cooling-tower/')[4]).toBe('Cooling tower services and articles for industrial facilities: repair, maintenance, upgrades and replacement.')
    for(const c of seoRows.slice(1)){if(c.length>4)expect(c[4],c[0]).not.toMatch(/\bHVAC\b|air conditioning/i)}
  })
})

describe('CONTENT-FIX-3: the four locale articles are neutral industrial "What is a cooling tower?" articles (same URLs, no redirect)',()=>{
  it('the ledger names exactly the four HVAC locale articles, 62 blocks each',()=>{
    expect(LEDGER.pages.map(p=>p.routeId)).toEqual(['LIVE-LOCALE-th-14460','LIVE-LOCALE-id-14466','LIVE-LOCALE-vi-14464','LIVE-LOCALE-ja-14462'])
    for(const p of LEDGER.pages){expect(p.blocks).toBe(62);expect(p.h2).toHaveLength(8)}
  })
  for(const lang of ['th','id','vi','ja']){
    it(`${lang}: new H1, title and meta, 8 sections with a table of contents, no HVAC, air-conditioning, commercial-building or stainless wording`,async()=>{
      const page=LEDGER.pages.find(p=>p.language===lang)!
      const html=await render(page.route)
      expect(html).toMatch(new RegExp('<h1[^>]*>[^<]*'+page.h1AndTitle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
      expect(html).toContain(`content="${page.meta}"`)
      const text=plain(html)
      expect(text).not.toMatch(/HVAC|air.?condition|commercial building|stainless/i)
      for(const h of page.h2)expect(text,h).toContain(h)
      expect(html).toContain('ez-toc-container')
      expect(new Set([...html.matchAll(/href="#([^"]+)"/g)].map(m=>m[1])).size).toBeGreaterThanOrEqual(page.toc.length)
    },120000)
  }
})

describe('CONTENT-FIX-3: long product titles use the same display face as every other product title',()=>{
  it('the r5-product-title--long rule keeps Bebas (display) caps and only reduces the size; no sans-serif override',()=>{
    const css=readFileSync(path.join(APP,'src/app/(site)/design-r5.css'),'utf8')
    const rule=/\.r5-product-title--long\s*\{([^}]*)\}/.exec(css)?.[1]??''
    expect(rule).toContain('font-family: var(--dr4-display)')
    expect(rule).toMatch(/text-transform:\s*uppercase/)
    expect(rule).toMatch(/font-size:\s*clamp\(30px,\s*3vw,\s*42px\)/)
    expect(rule).not.toMatch(/DM Sans|--dr4-sans|font-weight:\s*[5-9]00/)
  })
  it('the 4000MUHT product (longest title) renders the long-title class',async()=>{
    const html=await render('/product/tuf-lite-iv-4000muht-ultra-hi-temp-series-hub-fan-assemblies/')
    expect(html).toMatch(/class="r5-product-title r5-product-title--long"/)
  })
})
