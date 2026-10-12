/**
 * RESTORE-200 (REDIRECTS-REVIEW-1; OGCS spec RESTORE200_PAGES.tsv, CT 2026-10-11): four distinct live WordPress articles with their own clicks are served at their
 * old URLs at 200 again (self canonical, sitemap once), the staging 301s to /nozzles/, /counterflow-vs-crossflow/, /frp-cooling-towers/ and /cooling-tower-fan/ are gone,
 * and those four destinations stay at 200. The hosted site reads the PROMOTED SNAPSHOT composed from database records, so the content tests run that path: a record as the
 * review database holds it (held draft), the production step against an in-memory REST fake, `composePublicDocument` (the publisher), then the real renderer.
 */
import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {composePublicDocument} from '../../content/compose'
import {extractSlots} from '../../content/content-slots'
import {storedDocument} from '../../../ops/seo-pass/scan-slots'
import {applyStep,planStep} from '../../../ops/prod-step/cf3-prod-step-1.mjs'
import {DATA2} from '../../../ops/prod-step/staging-audit-redirects-step-2.mjs'
import {SalmonCanonical,servedDescription,servedTitle} from '../SalmonCanonical'
import {RESTORED_ARTICLES} from '../wave4'
import type {SalmonDocument} from '../salmon'

const APP=process.cwd()
type Rec=Record<string,ReturnType<typeof JSON.parse>>
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<Rec>;redirects:Array<{source:string;destination:string}>}
const SPEC=[
  {path:'/cooling-tower-spray-nozzles/',id:'SALMON-posts-3719',from:'/nozzles/',title:'Cooling Tower Spray Nozzles: A Selection Guide - ICS',h1:'Cooling Tower Spray Nozzles: A Selection Guide',meta:'Learn how to select the right cooling tower spray nozzles. This guide covers nozzle types, spray patterns, and maintenance to improve cooling efficiency.'},
  {path:'/crossflow-vs-counterflow-cooling-tower-2/',id:'SALMON-posts-3475',from:'/counterflow-vs-crossflow/',title:'Crossflow vs Counterflow Cooling Towers: Key Differences - ICS',h1:'Crossflow vs Counterflow Cooling Towers: Key Differences',meta:'Discover the key differences between crossflow and counterflow cooling towers. Learn how they compare on efficiency, maintenance and fit for industrial plants.'},
  {path:'/frp-cooling-tower-advantages/',id:'SALMON-posts-3648',from:'/frp-cooling-towers/',title:'FRP Cooling Tower Advantages: Durable, Corrosion Resistant - ICS',h1:'FRP Cooling Tower Advantages: Durable & Cost-Effective',meta:'Discover FRP cooling tower advantages over conventional cooling towers: corrosion-resistant, lightweight design and low maintenance for industrial use.'},
  {path:'/cooling-tower-fan-balancing/',id:'SALMON-posts-3594',from:'/cooling-tower-fan/',title:'Cooling Tower Fan Balancing: Boost Efficiency & End Downtime - ICS',h1:'Cooling Tower Fan Balancing: Boost Efficiency & End Downtime',meta:'Learn 13 practical tips for cooling tower fan balancing: vibration limits, balance grades and inspection, to cut downtime and support fan efficiency.'},
]
const row=(p:string)=>ledger.routes.find((r)=>r.path===p)!

describe('release authority',()=>{
  it('the four old URLs are PUBLIC, exported, indexable, in the sitemap once, with a self canonical, and no longer redirect sources',()=>{
    for(const s of SPEC){
      expect(row(s.path),s.path).toMatchObject({routeId:s.id,state:'PUBLIC',export:true,indexable:true,sitemap:true,canonical:`https://h2ocooling.com${s.path}`,redirect:null})
      expect(ledger.routes.filter((r)=>r.path===s.path),s.path).toHaveLength(1)
      expect(ledger.redirects.find((r)=>r.source===s.path),s.path).toBeUndefined()
      // the destinations the 301s pointed at stay public pages
      expect(row(s.from),s.from).toMatchObject({state:'PUBLIC',export:true})
    }
    expect([...RESTORED_ARTICLES].sort()).toEqual(SPEC.map((s)=>s.path).sort())
  })
  it('the batch data agrees: the four 301 rows are gone from redirects.tsv, and each page has its title/meta row and a 200 conformance row (the old 301 conformance row is replaced)',()=>{
    const tsv=(f:string)=>readFileSync(path.join(APP,'ops/seo-pass/data',f),'utf8').split('\n').map((l)=>l.split('\t'))
    for(const s of SPEC){
      expect(tsv('redirects.tsv').find((c)=>c[0]===s.path),s.path).toBeUndefined()
      const seo=tsv('seo-fields.tsv').find((c)=>c[0]===s.path)!
      expect([seo[3],seo[4]],s.path).toEqual([s.title,s.meta])
      expect(tsv('conformance.tsv').filter((c)=>c[0]===s.path).map((c)=>c[1]),s.path).toEqual(['200'])
      expect(tsv('route-dispositions.tsv').find((c)=>c[0]===s.path)!.slice(1,3),s.path).toEqual([s.id,'PUBLISH'])
    }
  })
})

/** A database record as the review database holds it: imported from the authority, held (REVIEW_HOLD, an unpublished draft). */
const heldRecord=(s:typeof SPEC[number]):Rec=>{
  const r=row(s.path),document=storedDocument(r as never)
  return {id:`id:${s.path}`,pathKey:s.path,path:s.path,routeId:s.id,family:'salmon',title:String((document as Rec).title??s.path),_status:'draft',updatedAt:'t1',seo:{canonical:r.canonical},
    document,slots:extractSlots(document,{productIds:new Map()}),source:{aliasOf:null},disposition:{state:'REVIEW_HOLD',export:false,indexable:false,sitemap:false,searchable:false,redirect:null}}
}
const norm=(t:string)=>t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/\s+/g,' ')

describe('payload path: held record -> the production step -> the publisher\'s composition -> the renderer',()=>{
  const records=new Map(SPEC.map((s)=>[s.path,heldRecord(s)]))
  const redirects:Rec[]=(DATA2.retireRedirects as Array<{source:string;destination:string}>).filter((r)=>SPEC.some((s)=>s.path===r.source)).map((r,i)=>({id:`rd${i}`,...r,active:true}))
  const patches:Array<{id:string;body:Rec}>=[]
  const api=async(p:string,init:{method?:string;body?:string}={})=>{
    const m=/^public-routes\?where\[pathKey\]\[equals\]=([^&]*)&/.exec(p)
    if(m){const r=records.get(decodeURIComponent(m[1]!));if(!r)return {status:200,body:{docs:[]}};if(r._status!=='published'&&!p.includes('draft=true'))return {status:200,body:{docs:[]}};return {status:200,body:{docs:[{...r}]}}}
    if(p.startsWith('public-routes/')&&init.method==='PATCH'){const id=p.slice('public-routes/'.length,p.indexOf('?depth=0'));const r=[...records.values()].find((x)=>x.id===id);if(!r)return {status:404,body:null};const body=JSON.parse(init.body!);patches.push({id,body});Object.assign(r,body);return {status:200,body:{}}}
    if(p.startsWith('public-redirects/')&&init.method==='PATCH'){const r=redirects.find((x)=>`public-redirects/${x.id}?depth=0`===p);if(!r)return {status:404,body:null};Object.assign(r,JSON.parse(init.body!));return {status:200,body:{}}}
    if(p.startsWith('public-redirects?')&&!init.method)return {status:200,body:{docs:redirects,hasNextPage:false}}
    return {status:404,body:null}
  }
  // only the RESTORE-200 part of the one step: the other routes of the step are absent from this fake, so they are not part of this plan
  const data={...DATA2,meta:(DATA2.meta as Rec[]).filter((m)=>records.has(m.path)),slotEdits:(DATA2.slotEdits as Rec[]).filter((e)=>records.has(e.path)),redirects:[],withdraw:[],retireRedirects:(DATA2.retireRedirects as Rec[]).filter((r)=>records.has(r.source))}
  it('releases each article in one write, with its edits; the old 301 records are retired; a rerun changes nothing',async()=>{
    const plan=await planStep(api,data)
    expect(plan.counts).toMatchObject({release:4,retire:4,refused:0})
    const res=await applyStep(api,plan,data)
    expect(res.problems).toEqual([])
    for(const s of SPEC){
      expect(patches.filter((x)=>x.id===`id:${s.path}`),s.path).toHaveLength(1)
      expect(records.get(s.path)).toMatchObject({_status:'published',disposition:{state:'PUBLIC',export:true,indexable:true,sitemap:true,searchable:true,redirect:null}})
    }
    expect(redirects.every((r)=>r.active===false)).toBe(true)
    expect((await planStep(api,data)).counts).toMatchObject({meta:0,slotEdits:0,release:0,retire:0,refused:0})
  })
  it('the served pages: exact title, meta and H1 (the self canonical is in the ledger, above); the claims check applied (no HVAC, no unsupported numbers, no guarantees, no first person, no sidebar)',()=>{
    for(const s of SPEC){
      const composed=composePublicDocument(records.get(s.path) as never) as unknown as SalmonDocument
      const html=renderToStaticMarkup(<SalmonCanonical doc={composed}/>)
      const text=norm(html)
      expect(servedTitle(composed),s.path).toBe(s.title)
      expect(servedDescription(composed),s.path).toBe(s.meta)
      expect(norm((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)||['',''])[1]!).trim(),s.path).toBe(s.h1)
      expect(text,s.path).not.toMatch(/\bHVAC\b/)
      expect(text,s.path).not.toMatch(/\$\s?50\b|\$500,000|15-20%|15-30%|up to 15%|\bguarantee[sd]?\b|leading manufacturer|\bI[’']ve\b|Recent Posts/)
    }
    const frp=norm(renderToStaticMarkup(<SalmonCanonical doc={composePublicDocument(records.get('/frp-cooling-tower-advantages/') as never) as unknown as SalmonDocument}/>))
    expect(frp).not.toMatch(/Expected Lifespan|20\+ Years|5-15 Years/)
    expect(frp).toMatch(/Corrosion Risk\s+Low\b/)
    expect(frp).toContain('an investment in dependable performance and long-term operational resilience with')
    const fan=norm(renderToStaticMarkup(<SalmonCanonical doc={composePublicDocument(records.get('/cooling-tower-fan-balancing/') as never) as unknown as SalmonDocument}/>))
    expect(fan).toContain('industrial processes or process chillers')
    expect(fan).toContain('ISO 20816')
    expect(fan).toContain('13 Practical Tips for Cooling Tower Fan Balancing')
    const nozzles=norm(renderToStaticMarkup(<SalmonCanonical doc={composePublicDocument(records.get('/cooling-tower-spray-nozzles/') as never) as unknown as SalmonDocument}/>))
    expect(nozzles).toContain('Request a quote and tell us the tower make and model')
  })
})
