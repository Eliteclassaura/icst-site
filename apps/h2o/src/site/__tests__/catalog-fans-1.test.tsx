/**
 * CATALOG-FANS-1 (owner/CT 2026-10-08, OGCS Phase 1, seal 122aabc4): the Hudson TUF-LITE IV family record is a catalog product (public route, product page,
 * member of /fans/, /product-category/fans/ and the Hudson tag listing) and appears in the derived Parts > Fans menu. The series records follow in CATALOG-FANS-2.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonNavigation} from '../navigation-data'
import {FAN_MENU_LINKS} from '../moore-fans'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean}>}
const hrefsOf=(html:string)=>new Set([...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]!))
const PATH='/product/tuf-lite-iv-fan-assemblies/'
const row=ledger.routes.find(r=>r.path===PATH)!

describe('CATALOG-FANS-1: Hudson TUF-LITE IV',()=>{
  it('is a public, indexable catalog product; the product set is 191 with CATALOG-FANS-2 (slug = path slug, the RFQ product_slug)',()=>{
    expect([row.routeId,row.state,row.export,row.indexable,row.sitemap]).toEqual(['SALMON-product-4900','PUBLIC',true,true,true])
    expect(ledger.routes.filter(r=>/^SALMON-product-\d+$/.test(r.routeId)&&r.state==='PUBLIC'&&r.export)).toHaveLength(191) // 180 + 11 Hudson fan records (the family here; the ten series and variants in CATALOG-FANS-2)
  })
  it('renders its own H1, SEO title and meta, the manufacturer specs and literature, a quote action; no HVAC, price, stock or performance claims',async()=>{
    const html=await render(PATH)
    expect(html).toMatch(/<h1[^>]*>TUF-LITE IV – Fan Assemblies/)
    expect(/property="og:title" content="([^"]*)"/.exec(html)?.[1]).toBe('Hudson TUF-LITE IV Cooling Tower Fan Assemblies - ICS')
    expect(html).toContain('content="Request a quote for Hudson TUF-LITE IV fan assemblies, 11 ft to 36 ft, with carbon fiber and fiberglass blades for cooling towers and air coolers."')
    expect(html).toContain('Hudson Products Corp., a Chart Industries company')
    expect(html).toContain('https://files.chartindustries.com/Tuf-Lite_IV.pdf')
    expect(html).not.toMatch(/HVAC|in stock|\$\s?\d|warranty|4–5X|up to 20%|most aerodynamic/i)
    expect(html).toMatch(/Request a Quote/i)
  })
  it('its two images are the native-size brochure extractions (654×654 and 853×945), alt text set, served from /media',async()=>{
    const html=await render(PATH)
    expect(html).toMatch(/<img[^>]*width="654" height="654"[^>]*alt="Hudson TUF-LITE IV fan blades and seal disc[^"]*"/)
    expect(html).toMatch(/<img[^>]*width="853" height="945"/)
  })
  it('is listed on /fans/, on the Fans category (count 33 with CATALOG-FANS-2) and on the Hudson tag listing next to TUF-LITE II/III, and is in the Parts > Fans menu',async()=>{
    expect(hrefsOf(await render('/fans/')).has(PATH)).toBe(true)
    const cat1=await render('/product-category/fans/'),cat2=await render('/product-category/fans/page/2/')
    expect(cat1).toContain('Showing 1–16 of 33 results');expect(cat2).toContain('Showing 17–33 of 33 results')
    expect(hrefsOf(cat2).has(PATH)).toBe(true)
    const hudson=await render('/product-tag/hudson/')
    expect(hrefsOf(hudson).has(PATH)).toBe(true);expect(hrefsOf(hudson).has('/product/tuf-lite-iii-3000k-series-hub-fan-assemblies/')).toBe(true)
    expect(hudson).toContain('Showing all 27 results')
    expect(FAN_MENU_LINKS.map(l=>l[1])).toContain(PATH)
    expect(salmonNavigation.find(g=>g.label==='Parts')!.items.map(i=>i[1])).toContain(PATH)
    expect(FAN_MENU_LINKS.find(l=>l[1]===PATH)![0]).toBe('TUF-LITE IV')
  },300000)
})
