/**
 * CATALOG-FANS-2 (owner/CT 2026-10-08; OGCS WAVE1 seal 9cee9f3c, WAVE2 seal b68a525a): the seven TUF-LITE IV series records (children of the family), the three
 * TUF-LITE III variants (4000KWUHT, 3000KUHT, 3000KC) and the Howden D/SX size-range updates. The menu drift guard (fans-menu-1) covers the derived Fans menu.
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
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean}>}
const hrefsOf=(html:string)=>new Set([...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]!))
const FAMILY='/product/tuf-lite-iv-fan-assemblies/'
const NEW=ledger.routes.filter(r=>/^SALMON-product-49(0[1-9]|10)$/.test(r.routeId))

describe('CATALOG-FANS-2: the ten series and variant records',()=>{
  it('are public, indexable catalog products with unique slugs (the RFQ product_slug) and the product set is 191',()=>{
    expect(NEW).toHaveLength(10)
    for(const r of NEW){expect([r.state,r.export,r.indexable,r.sitemap],r.path).toEqual(['PUBLIC',true,true,true]);expect(r.path).toMatch(/^\/product\/tuf-lite-ii?i?v?-[a-z0-9-]+\/$/)}
    expect(new Set(NEW.map(r=>r.path)).size).toBe(10)
    expect(ledger.routes.filter(r=>/^SALMON-product-\d+$/.test(r.routeId)&&r.state==='PUBLIC'&&r.export)).toHaveLength(191)
  })
  it('each renders its own H1 and a unique SEO title and meta, the manufacturer specs and literature, a quote action; no HVAC, price, stock, warranty or performance claims',async()=>{
    const titles=new Set<string>(),metas=new Set<string>()
    for(const r of NEW){
      const html=await render(r.path)
      expect(html,r.path).toMatch(/<h1[^>]*>[^<]*TUF-LITE I+V? /)
      const title=/property="og:title" content="([^"]*)"/.exec(html)?.[1]??''
      const meta=/property="og:description" content="([^"]*)"/.exec(html)?.[1]??''
      expect(title,r.path).toMatch(/^Hudson TUF-LITE I+V? .*- ICS$/)
      expect(titles.has(title),`${r.path}: unique title`).toBe(false);titles.add(title)
      expect(metas.has(meta),`${r.path}: unique meta`).toBe(false);metas.add(meta)
      expect(meta.length,r.path).toBeLessThanOrEqual(160)
      expect(html,r.path).toContain('Hudson Products Corp., a Chart Industries company')
      expect(html,r.path).toContain('files.chartindustries.com')
      expect(html,r.path).not.toMatch(/HVAC|in stock|\$\s?\d|warranty|4–5X|up to 20%|most aerodynamic/i)
      expect(html,r.path).toMatch(/Request a Quote/i)
    }
  },300000)
  it('the Ultra Hi Temp records carry the burnt-orange render; the 3000KC uses a header-free crop of the 3000K image; images are never shown above native size',async()=>{
    const uht=await render('/product/tuf-lite-iv-4000muht-ultra-hi-temp-series-hub-fan-assemblies/')
    expect(uht).toMatch(/<img[^>]*width="653" height="653"[^>]*alt="Hudson TUF-LITE IV Ultra Hi Temp fan[^"]*"/)
    const iii=await render('/product/tuf-lite-iii-3000kuht-ultra-hi-temp-series-hub-fan-assemblies/')
    expect(iii).toMatch(/<img[^>]*width="1028" height="751"/)
    const kc=await render('/product/tuf-lite-iii-3000kc-series-hub-fan-assemblies/')
    // CT/DD: a native crop (500×422, no resampling) of the 3000K primary image without its printed "3000K Series" model header, so the page never shows a second model name
    expect(kc).toMatch(/<img[^>]*width="500" height="422"/)
    expect(kc).toContain('f542f8425a450237c157cdd71d7b9edc792fb147bbea0000823c4e78d82f3854')
    // the product's own picture is the crop; (the 3000K sibling card keeps its original image elsewhere on the page)
    expect([...kc.matchAll(/<img[^>]*width="500" height="422"[^>]*>/g)].every(m=>!m[0].includes('d241ce46'))).toBe(true)
  })
  it('are listed on /fans/, on the Fans category (33) and on the Hudson tag (27), and the family page is untouched',async()=>{
    const fans=hrefsOf(await render('/fans/')),cat=hrefsOf(await render('/product-category/fans/')+await render('/product-category/fans/page/2/')),hudson=hrefsOf(await render('/product-tag/hudson/'))
    for(const r of NEW){expect(fans.has(r.path),`/fans/ ${r.path}`).toBe(true);expect(cat.has(r.path),`category ${r.path}`).toBe(true);expect(hudson.has(r.path),`hudson ${r.path}`).toBe(true)}
    expect(hrefsOf(await render('/product-tag/hudson/')).has(FAMILY)).toBe(true)
  },300000)
})

describe('CATALOG-FANS-2: Howden size-range updates (OGCS WAVE2_HOWDEN_UPDATES; titles, H1s and metas unchanged)',()=>{
  it('the D page covers 26–38 ft (7.93 m to 11.58 m) and the SX page 28″-36′ (0.71M-10.97M) in its specifications and lead sentence (the claims conformance list pins the composed text after the batch)',()=>{
    const conf=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/claims-conformance.json'),'utf8')) as {present:Array<{row:string;text:string}>}
    const present=Object.fromEntries(conf.present.filter(c=>/^HW[DS]-/.test(c.row)).map(c=>[c.row,c.text]))
    expect(present['HWD-01']).toContain('26 ft to 38 ft (7.93 m to 11.58 m)')
    expect(present['HWD-02']).toContain('38 ft')
    expect(present['HWS-01']).toContain('28″-36′ (0.71M-10.97M)')
    expect(present['HWS-02']).toContain('28″-36′ (0.71M-10.97M)')
  })
})
