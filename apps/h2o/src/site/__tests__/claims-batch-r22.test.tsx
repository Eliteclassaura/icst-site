/**
 * R2.2 content batch (Control Tower 2026-10-05): the mock of what Commander's apply produces. Every affected page is composed as
 * Payload composes it after the apply (imported tree → text-override registry → the batch's slot values → restored sections)
 * and rendered by its template, then checked against the conformance list (ops/seo-pass/data/claims-conformance.json): every
 * ruled string absent, every owner-restored string present. The same list drives Commander's read-back (check-claims.mjs).
 */
import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {composePublicDocument,type RouteRecord} from '../../content/compose'
import {extractSlots,type ContentSlot} from '../../content/content-slots'
import type {RestoredGroup} from '../../content/restored-sections'
import {storedDocument} from '../../../ops/seo-pass/scan-slots'
import {pageText} from '../../../ops/seo-pass/claims-text.mjs'
import {repairDocumentText} from '../text-repair'
import type {SalmonDocument} from '../salmon'
import {matchedWave4Article} from '../wave4'
import {Wave4ArticleDetail,LiveEnglishDetail} from '../Wave4Presentation'
import {ArchivePage,isArchiveDocument} from '../ArchivePresentation'
import {PartsIndex,ProductDetail} from '../Wave3Presentation'
import {SalmonFamilyPage,salmonFamilyFor} from '../SalmonFamilies'
import {LuxuryCanonical,luxuryIds} from '../LuxuryCanonical'
import {SalmonCanonical} from '../SalmonCanonical'
import {r4Builders} from '../r4/R4Pages'
import {R4PortfolioPage,R4_PORTFOLIO_ROUTE} from '../r4/R4Portfolio'

type Row={path:string;routeId:string;state:string;export:boolean;sourceFile?:string;matchedArticle?:boolean}
type Fix={slots:Array<{key:string;field:string;after:unknown}>}
type Check={row:string;path:string;text:string}
const APP=process.cwd()
const json=<T,>(p:string)=>JSON.parse(readFileSync(path.join(APP,p),'utf8')) as T
const ledger=json<{routes:Row[]}>('content/release/route-ledger.json')
const fixes=json<Record<string,Fix>>('ops/seo-pass/data/slot-fixes.json')
const restored=json<Record<string,{routeId:string;h1?:string;groups:RestoredGroup[]}>>('ops/seo-pass/data/restored-sections.json')
const conformance=json<{absent:Check[];present:Check[]}>('ops/seo-pass/data/claims-conformance.json')
const products=new Map(ledger.routes.filter(r=>/^SALMON-product-[0-9]+$/.test(r.routeId)&&r.state==='PUBLIC'&&r.export).map(r=>[r.path,r.routeId] as [string,string]))
const decoded=(p:string)=>{try{return decodeURIComponent(p)}catch{return p}}
const rowFor=(p:string)=>ledger.routes.find(r=>decoded(r.path)===p&&r.sourceFile&&/^(?:SALMON|LIVE)-/.test(r.routeId))
const valueOf=<T,>(table:Record<string,T>,p:string)=>Object.entries(table).find(([k])=>decoded(k)===p)?.[1]

/** The page as Payload composes it after the R2.2 apply (or, with `batch` false, before it), rendered by the catch-all's template dispatch. */
const cache=new Map<string,string>()
const pageAfterApply=(p:string,batch=true):string=>{
  const hit=cache.get(p+batch);if(hit!==undefined)return hit
  const row=rowFor(p)!
  const document=storedDocument(row as never)
  const slots=(extractSlots(document,{productIds:products}) as ContentSlot[]).map(s=>({...s}))
  if(batch)for(const f of valueOf(fixes,p)?.slots??[])(slots.find(s=>s.key===f.key) as unknown as Record<string,unknown>)[f.field]=f.after
  const r=batch?valueOf(restored,p):undefined
  const record={routeId:row.routeId,path:row.path,family:row.routeId.startsWith('LIVE-')?'live':'salmon',title:r?.h1??String(document.title??''),document,slots,restoredSections:r?.groups??null} as RouteRecord
  const doc=repairDocumentText(composePublicDocument(record) as unknown as SalmonDocument)
  const family=salmonFamilyFor(doc)
  // The catch-all's dispatch order: Design R4 compositions first (they supersede the Salmon families on their routes).
  const el=r4Builders[doc.routeId]?<LuxuryCanonical doc={doc}/>:doc.routeId===R4_PORTFOLIO_ROUTE?<R4PortfolioPage doc={doc}/>:family?<SalmonFamilyPage doc={doc} config={family}/>:isArchiveDocument(doc)?<ArchivePage doc={doc}/>:doc.routeId.startsWith('LIVE-')?<LiveEnglishDetail doc={doc}/>:doc.targetPath==='/cooling-tower-parts-online/'?<PartsIndex doc={doc}/>:doc.type==='product'&&doc.routeId.startsWith('SALMON-product-')?<ProductDetail doc={doc}/>:matchedWave4Article(doc)?<Wave4ArticleDetail doc={doc}/>:luxuryIds.has(doc.routeId)?<LuxuryCanonical doc={doc}/>:<SalmonCanonical doc={doc}/>
  const text=pageText(renderToStaticMarkup(el))
  cache.set(p+batch,text)
  return text
}

describe('R2.2 conformance on the composed pages (mock apply)',()=>{
  it('every page in the list is a public imported record',()=>{
    for(const c of [...conformance.absent,...conformance.present])expect(rowFor(c.path),c.path).toBeDefined()
    expect(conformance.absent.length).toBeGreaterThan(200)
    // 11 owner-restored strings, the 10 CLAIMS-R2 Home wordings (CT 2026-10-06), the 11 R4 wordings (R4C-01…11, CT 2026-10-07) and the All Projects R4 lead line (CS093)
    expect(conformance.present).toHaveLength(33)
  })
  it('the check is live: before the batch, the ruled strings are on their pages',()=>{
    const notBefore=conformance.absent.filter(c=>!pageAfterApply(c.path,false).includes(c.text)).map(c=>c.row)
    // The four registry strings are already corrected by R2.1 (compose); five sweep strings are produced by an earlier edit on
    // the same element (the Locale Part B removal next to them), so they do not exist in the imported text either. CLAIMS-R2 rows
    // 05, 08 and 09 reword text that exists only after an earlier edit ("Our global team" → "Our team", CS088, CS089).
    // R4C-11 rewords a restored-section heading, which exists only once the batch writes the restored sections.
    expect(notBefore.sort()).toEqual(['C4','C4','CS050','CS065','CS068','CS072','CS077+CS077+CS077','CS084','CS098','R2L10-05','R2L10-08','R2L10-09','R4C-11'])
  },600000)
  it('every ruled string is absent from its page',()=>{
    const kept=conformance.absent.filter(c=>pageAfterApply(c.path).includes(c.text)).map(c=>`${c.row} ${c.path}: ${c.text.slice(0,80)}`)
    expect(kept).toEqual([])
  },600000)
  it('every owner-restored string is present on its page (Q4, Q5, Q7, Q9, Q11, Q12b; CS002 About wording)',()=>{
    const missing=conformance.present.filter(c=>!pageAfterApply(c.path).includes(c.text)).map(c=>`${c.row} ${c.path}: ${c.text}`)
    expect(missing).toEqual([])
  },300000)
})

describe('F1 regression (CT ruling 2026-10-05): nozzle specification items only on nozzle products',()=>{
  const NOZZLE_ITEMS=/Spray type:|Pressure range: 1–3\.5|Mounting: Threaded pipe connection|nozzles are built to handle varying industrial conditions/
  const isNozzle=(row:Row)=>/\/product-category\/[^"]*nozzle/i.test(String((JSON.parse(readFileSync(path.join(APP,'content/salmon',row.sourceFile!),'utf8')) as {contentHtml?:string}).contentHtml??''))||/nozzle/i.test(row.path)
  it('no public non-nozzle product page, after the batch, carries a nozzle spec item or the nozzle boilerplate',()=>{
    const offenders:string[]=[],before:string[]=[]
    let checked=0
    for(const row of ledger.routes){
      if(!products.has(row.path)||!row.sourceFile||isNozzle(row))continue
      checked++
      if(NOZZLE_ITEMS.test(pageAfterApply(decoded(row.path))))offenders.push(row.path)
      if(NOZZLE_ITEMS.test(pageAfterApply(decoded(row.path),false)))before.push(row.path)
    }
    expect(checked).toBeGreaterThan(100)
    expect(offenders).toEqual([])
    // the check is live: the imported data carries the error on the products the F1 audit found
    expect(before.length).toBeGreaterThanOrEqual(7)
  },600000)
})
