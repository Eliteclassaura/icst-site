/**
 * FANS-MENU-1 (owner/CT 2026-10-08): the header Parts > Fans menu (desktop and mobile) and the brand tiles on /fans/ and /product-category/fans/ show every
 * fan brand and family that exists in the catalog, plus Moore Fans and its Class 10000 pages. The list is derived from the catalog data
 * (ops/catalog/build-fan-menu.mjs -> content/design/fan-menu.json); a new fan product without a regenerated menu fails the drift guard below.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonNavigation} from '../navigation-data'
import {FAN_MENU_LINKS,MOORE_FANS_LINKS} from '../moore-fans'
import {buildFanMenu} from '../../../ops/catalog/build-fan-menu.mjs'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const hrefsOf=(html:string)=>new Set([...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]!))
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;state:string;export:boolean}>}

describe('FANS-MENU-1',()=>{
  it('the committed menu data is what the catalog derives (a new fan product needs a regenerated menu)',()=>{
    const derived=buildFanMenu(APP) as {items:Array<{label:string;href:string}>}
    const committed=JSON.parse(readFileSync(path.join(APP,'content/design/fan-menu.json'),'utf8')) as {items:Array<{label:string;href:string}>}
    expect(derived.items).toEqual(committed.items)
    expect(FAN_MENU_LINKS.slice(0,committed.items.length).map(l=>l[1])).toEqual(committed.items.map(i=>i.href))
  })
  it('the menu is the brand and family items, then Moore Fans and its three Class 10000 pages; no Cofimco item; fan stacks stay a separate Parts item',()=>{
    const labels=FAN_MENU_LINKS.map(l=>l[0])
    expect(labels).toEqual(expect.arrayContaining(['Hudson fans','TUF-LITE II','TUF-LITE III','Howden fans','Moore Fans','Class 10000 Heavy Duty Standard Chord','Class 10000 XC','Class 10000 Minimum Acoustic Geometry']))
    expect(labels.join('|')).not.toMatch(/Cofimco/i)
    const parts=salmonNavigation.find(g=>g.label==='Parts')!.items.map(i=>i[1])
    expect(parts.filter(h=>h==='/cooling-tower-fan-stacks/')).toHaveLength(1)
    const at=parts.indexOf('/fans/')
    expect(parts.slice(at,at+1+FAN_MENU_LINKS.length)).toEqual(['/fans/',...FAN_MENU_LINKS.map(l=>l[1])])
  })
  it('every item is a public page that renders, and is in the desktop and the mobile menu and on both fan listings',async()=>{
    const pub=new Set(ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export).map(r=>r.path))
    for(const [label,href] of FAN_MENU_LINKS){expect(pub.has(href),`${label} ${href} is a public route`).toBe(true);expect(await render(href),`${label} -> ${href}`).toContain('<h1')}
    const fans=await render('/fans/')
    for(const [,href] of FAN_MENU_LINKS)expect(fans.split(`href="${href}"`).length-1,`menu twice (desktop + mobile) + tile: ${href}`).toBeGreaterThanOrEqual(3)
    const cat=await render('/product-category/fans/')
    for(const listing of [fans,cat])for(const [label,href] of FAN_MENU_LINKS)expect(hrefsOf(listing).has(href),label).toBe(true)
    for(const [,href] of MOORE_FANS_LINKS)expect(FAN_MENU_LINKS.map(l=>l[1])).toContain(href)
  },300000)
  it('every fan product is listed on its brand listing page (so every brand item leads to its products)',async()=>{
    const menu=JSON.parse(readFileSync(path.join(APP,'content/design/fan-menu.json'),'utf8')) as {items:Array<{label:string;href:string}>}
    const hudson=hrefsOf(await render('/product-tag/hudson/')),howden=hrefsOf(await render('/product-tag/howden/'))
    expect(menu.items.map(i=>i.href)).toEqual(expect.arrayContaining(['/product-tag/hudson/','/product-tag/howden/']))
    for(const p of ['/product/tuf-lite-iii-3000k-series-hub-fan-assemblies/','/product/tuf-lite-ii-8000h-series-hub-fan-assemblies/'])expect(hudson.has(p),p).toBe(true)
    for(const p of ['/product/howden-pro-d-series-26-36-7-93m-10-98m-fans/','/product/pro-e-series-4-48-1-22m-14-63m-fans/'])expect(howden.has(p),p).toBe(true)
  },300000)
})
