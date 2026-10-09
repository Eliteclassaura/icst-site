/**
 * CONTENT-FIX-3 (post-launch UPDATE-2, CT 2026-10-08): OGCS UPDATE-2 HVAC meta rows (seal e7b228b7) and LOCALE-HVAC-REWRITE-1 (seal 6e23108f).
 * UP2-01 is already the stored value; UP2-02 changes the category meta; UP2-03..06 (locale twins) stay as stored: OGCS ruled KEEP-HOLD (the twins stay 301d to the same-language guides).
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
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const seoRows=readFileSync(path.join(APP,'ops/seo-pass/data/seo-fields.tsv'),'utf8').split('\n').map(l=>l.split('\t'))
const row=(p:string)=>seoRows.find(c=>c[0]===p)!

describe('CONTENT-FIX-3: UPDATE-2 meta rows',()=>{
  it('UP2-01 is the stored value (no HVAC); UP2-02 is the neutral industrial category meta',()=>{
    expect(row('/cooling-tower-maintenance-checklist/')[4]).toBe('Maximize efficiency with our 2026 cooling tower maintenance checklist. Learn to prevent corrosion, improve safety, and optimize your industrial cooling system.')
    expect(row('/category/cooling-tower-servicesindustrial-cooling-tower/')[4]).toBe('Cooling tower services and articles for industrial facilities: repair, maintenance, upgrades and replacement.')
    for(const c of seoRows.slice(1)){if(c.length>4)expect(c[4],c[0]).not.toMatch(/\bHVAC\b|air conditioning/i)}
  })
})

const redirectRows=readFileSync(path.join(APP,'ops/seo-pass/data/redirects.tsv'),'utf8').split('\n').map(l=>l.split('\t'))
const LOCALE_TWINS=['LIVE-LOCALE-th-14460','LIVE-LOCALE-id-14466','LIVE-LOCALE-vi-14464','LIVE-LOCALE-ja-14462']
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean;indexable:boolean;redirect?:string}>;redirects:Array<{source:string;destination:string;status:number}>}
describe('CONTENT-FIX-3.1 (OGCS KEEP-HOLD): the four HVAC locale twins stay held and 301 to their same-language guides',()=>{
  it('each twin is still a REDIRECT route (not exported, not indexable) with a one-hop 301 to a public same-language page',()=>{
    for(const id of LOCALE_TWINS){
      const r=ledger.routes.find(x=>x.routeId===id)!
      expect([r.state,r.export,r.indexable],id).toEqual(['REDIRECT',false,false])
      expect(ledger.routes.find(x=>x.path===r.redirect)?.state,id).toBe('PUBLIC')
      const tsvRow=redirectRows.find(c=>c[0]===r.path)
      expect([tsvRow?.[2],tsvRow?.[1]],`${id}: the batch's 301 record`).toEqual(['301',r.redirect])
      expect(ledger.redirects.some(x=>x.source===r.redirect),`${id}: no chain`).toBe(false)
    }
  })
  it('the twins carry no rewritten article (no "What is a cooling tower" rewrite ships for them): their stored text is the base text',()=>{
    for(const id of LOCALE_TWINS){const doc=JSON.parse(readFileSync(path.join(APP,`content/salmon/documents/SALMON-${id}.json`),'utf8')) as {seo:{title:string}}
      expect(doc.seo.title,id).toMatch(/hvac/i)}
  })
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
