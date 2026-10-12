/**
 * 1.2f-FIX-A (CT 2026-10-11): copy that passed its tests in repository mode but was not served by the hosted review release.
 *  A/B  The English service pages are DATABASE records in payload mode (the promoted snapshot is composed from the record: its `title`, its edited
 *       page elements over the imported `document`). A review database imported before COPY-FIXES-1 therefore kept the old title/lead, and the
 *       code-owned request/FAQ headings were missing from its documents. These tests run the payload path: a snapshot generation built from the OLD
 *       import, composed the way the publisher composes it, drawn by EnglishServicePage; then the service-edits step against an in-memory REST fake.
 */
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {composePublicDocument} from '../../content/compose'
import {extractServiceSlots} from '../../content/content-slots'
import {EnglishServicePage,englishServiceForPath,englishServicePages} from '../EnglishServices'
import {DATA,applyServiceEdits,planServiceEdits} from '../../../ops/prod-step/service-edits-step-3.mjs'

const APP=process.cwd()
type Rec=Record<string,ReturnType<typeof JSON.parse>>
const WET='/wet-hybrid-dry-cooling-tower-repair/'
const EMERGENCY='/emergency-cooling-tower-repair/'
const repo=JSON.parse(readFileSync(path.join(APP,'content/english-completion/service-pages.json'),'utf8')) as Rec[]

/** The service as the review database imported it before COPY-FIXES-1: old title/lead, none of the code-owned headings. */
const imported=(id:string):Rec=>{
  const page=structuredClone(repo.find(x=>x.id===id)!)
  delete page.requestHeading
  delete page.faqHeading
  if(id==='ENGLISH-SERVICE-WET-HYBRID-DRY')page.title='Wet, Hybrid, and Dry Cooling Tower'
  if(id==='ENGLISH-SERVICE-EMERGENCY')page.lead=page.lead.replace(/\.$/,' quickly.')
  return page
}
/** A database route record of the import (what compose.ts reads). */
const record=(id:string,over:Rec={}):Rec=>{
  const document=imported(id)
  return {family:'english-service',routeId:id,path:document.path,title:document.title,document,slots:extractServiceSlots(document),seo:{title:null,description:null},_status:'published',id:`id:${id}`,updatedAt:'t1',...over}
}
/** The promoted snapshot's english-services.json: every service composed from its record, the way the publisher does. */
const snapshotOf=(records:Rec[]):Rec[]=>records.map(r=>{const doc=composePublicDocument(r as never) as Rec;return {...doc}})

let dir='',before:Record<string,string|undefined>={}
beforeAll(()=>{
  before={H2O_CONTENT_SOURCE:process.env.H2O_CONTENT_SOURCE,CONTENT_SNAPSHOT_DIR:process.env.CONTENT_SNAPSHOT_DIR}
  dir=mkdtempSync(path.join(os.tmpdir(),'h2o-fixa-'))
  process.env.H2O_CONTENT_SOURCE='payload'
  process.env.CONTENT_SNAPSHOT_DIR=dir
})
afterAll(()=>{
  for(const [k,v] of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v
  rmSync(dir,{recursive:true,force:true})
})
/** Promotes a generation holding exactly these services (the test fixture of `release -> releases/<id>.json -> generations/<id>`). */
function promote(id:string,services:Rec[]){
  mkdirSync(path.join(dir,'generations',id),{recursive:true})
  mkdirSync(path.join(dir,'releases'),{recursive:true})
  writeFileSync(path.join(dir,'generations',id,'english-services.json'),JSON.stringify(services))
  // what the page chrome reads from the same generation (the accepted release ledger)
  writeFileSync(path.join(dir,'generations',id,'ledger.json'),readFileSync(path.join(APP,'content/release/route-ledger.json')))
  writeFileSync(path.join(dir,'releases',`${id}.json`),JSON.stringify({content:id}))
  rmSync(path.join(dir,'release'),{force:true})
  symlinkSync(path.join('releases',`${id}.json`),path.join(dir,'release'))
}
const servicesOf=()=>repo.map(x=>record(x.id))

describe('A/B: the English service pages in payload mode',()=>{
  it('before the step, a database imported before COPY-FIXES-1 serves the OLD title and lead (the bug), but already the code-owned headings',()=>{
    promote('g-old',snapshotOf(servicesOf()))
    const wet=englishServiceForPath(WET)!,em=englishServiceForPath(EMERGENCY)!
    expect(wet.title).toBe('Wet, Hybrid, and Dry Cooling Tower')
    expect(em.lead).toMatch(/scoped quickly\.$/)
    // the fix in the render path: the request and FAQ headings come from the build's own file, not from the imported document
    expect(em.requestHeading).toBe('Request an urgent repair assessment')
    expect(em.faqHeading).toBe('Urgent repair FAQ')
    expect(englishServicePages().find(x=>x.id==='ENGLISH-SERVICE-CROSSFLOW')!.requestHeading).toBe('Request a crossflow tower assessment')
    const html=renderToStaticMarkup(<EnglishServicePage service={em}/>)
    expect(html).toContain('Request an urgent repair assessment')
    expect(html).toContain('Urgent repair FAQ')
  })
  it('a heading the record itself holds wins over the build file',()=>{
    const own=record('ENGLISH-SERVICE-EMERGENCY',{document:{...imported('ENGLISH-SERVICE-EMERGENCY'),requestHeading:'Staff heading'}})
    promote('g-own',snapshotOf([own,...repo.filter(x=>x.id!=='ENGLISH-SERVICE-EMERGENCY').map(x=>record(x.id))]))
    expect(englishServiceForPath(EMERGENCY)!.requestHeading).toBe('Staff heading')
  })
  it('the service-edits step writes the title and the lead; the next publish serves "Repair and Maintenance" as title and H1, and the scoped lead',async()=>{
    const wetRec=record('ENGLISH-SERVICE-WET-HYBRID-DRY'),emRec=record('ENGLISH-SERVICE-EMERGENCY')
    const routes=new Map<string,Rec>([[WET,wetRec],[EMERGENCY,emRec]])
    const api=async(p:string,init:{method?:string;body?:string}={})=>{
      const m=/^public-routes\?where\[pathKey\]\[equals\]=([^&]*)&/.exec(p)
      if(m)return {status:200,body:{docs:[routes.get(decodeURIComponent(m[1]!))].filter(Boolean)}}
      if(p.startsWith('public-routes/')&&init.method==='PATCH'){const r=[...routes.values()].find(x=>`public-routes/${x.id}?depth=0`===p)!;Object.assign(r,JSON.parse(init.body!));return {status:200,body:{}}}
      return {status:404,body:null}
    }
    const plan=await planServiceEdits(api,DATA)
    expect(plan.counts).toEqual({changes:2,unchanged:0,refused:0})
    const res=await applyServiceEdits(api,plan,DATA)
    expect(res.problems).toEqual([])
    expect((await planServiceEdits(api,DATA)).counts).toEqual({changes:0,unchanged:2,refused:0})
    // the publisher composes the snapshot from the written records
    promote('g-new',snapshotOf([...repo.map(x=>x.id===wetRec.routeId?wetRec:x.id===emRec.routeId?emRec:record(x.id))]))
    const wet=englishServiceForPath(WET)!,em=englishServiceForPath(EMERGENCY)!
    expect(wet.title).toBe('Wet, Hybrid, and Dry Cooling Tower Repair and Maintenance')
    expect(em.lead).toMatch(/can be scoped\.$/)
    const html=renderToStaticMarkup(<EnglishServicePage service={wet} head={{title:wet.title+' | ICS',description:wet.lead}}/>)
    expect(html).toContain('<h1>Wet, Hybrid, and Dry Cooling Tower Repair and Maintenance</h1>')
    expect(html).toContain('Wet, Hybrid, and Dry Cooling Tower Repair and Maintenance | ICS')
    expect(renderToStaticMarkup(<EnglishServicePage service={em}/>)).toContain('Request an urgent repair assessment')
  })
  it('refuses what staff edited, never overwrites it',async()=>{
    const run=async(wetOver:Rec,emOver:Rec)=>{
      const routes=new Map<string,Rec>([[WET,record('ENGLISH-SERVICE-WET-HYBRID-DRY',wetOver)],[EMERGENCY,record('ENGLISH-SERVICE-EMERGENCY',emOver)]])
      const api=async(p:string)=>{const m=/^public-routes\?where\[pathKey\]\[equals\]=([^&]*)&/.exec(p);return {status:200,body:{docs:m?[routes.get(decodeURIComponent(m[1]!))].filter(Boolean):[]}}}
      return planServiceEdits(api,DATA)
    }
    expect((await run({title:'Staff title'},{})).counts).toEqual({changes:1,unchanged:0,refused:1})
    const emSlots=extractServiceSlots(imported('ENGLISH-SERVICE-EMERGENCY')).map(s=>s.key==='service:lead'?{...s,copy:'Staff lead'}:s)
    expect((await run({},{slots:emSlots})).counts).toEqual({changes:1,unchanged:0,refused:1})
  })
})

