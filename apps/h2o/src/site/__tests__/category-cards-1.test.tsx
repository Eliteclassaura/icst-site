/**
 * CATEGORY-CARDS-1 (DD-B1, CT 2026-10-09): every /product-category/* page rendered its product cards with an empty title link and
 * "Image not available" on a database the batch had written. Cause: saving a public-routes record stores a product relation's own path
 * in the action slot's href, so the slot counts as edited, and composition then rewrote the card link's text to its label, flattening
 * the image and the heading out of the link. These tests render every category and tag route as Payload composes it from a SAVED record
 * and fail on an empty title or a missing image. The harness (mock of the release reads, record composition) follows seo-content-1.
 */
import {afterEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import type * as RuntimeReadModule from '../../content/runtime-read'

const state=vi.hoisted(()=>({docs:new Map<string,unknown>()}))
vi.mock('../../content/runtime-read',async importOriginal=>{
  const original=await importOriginal<typeof RuntimeReadModule>()
  const json=(file:string)=>JSON.parse(readFileSync(path.join(process.cwd(),file),'utf8'))
  const salmonFixture=json('content/salmon/active-routes.json') as Array<{targetPath:string;file:string}>
  const liveFixture=[...json('content/salmon/r2-live-routes.json'),...json('content/salmon/r3-locale-routes.json')] as Array<{targetPath:string;file:string}>
  const documentFiles=new Set([...salmonFixture,...liveFixture].map(row=>row.file))
  const ledgerJson=json('content/release/route-ledger.json')
  const fixtureRoutes=<T extends {targetPath:string}>(rows:T[]):T[]=>{
    const publicPaths=new Set((ledgerJson.routes as Array<{path:string;state:string;export:boolean}>).filter(row=>row.state==='PUBLIC'&&row.export).map(row=>row.path))
    return rows.filter(row=>publicPaths.has(row.targetPath))
  }
  return {...original,
    releaseLedger:()=>ledgerJson,
    requestDocuments:()=>state.docs, // round 2: composed (post-batch) documents can be injected, as Payload does per request
    snapshotJson:(file:string)=>{
      if(file==='ledger.json')return ledgerJson
      if(file==='routes.salmon.json')return fixtureRoutes(salmonFixture)
      if(file==='routes.live.json')return fixtureRoutes(liveFixture)
      if(file==='english-services.json')return json('content/english-completion/service-pages.json')
      throw new Error(`Unexpected snapshot read: ${file}`)
    },
    snapshotFile:(file:string)=>{
      if(!documentFiles.has(file))throw new Error(`Unexpected snapshot file: ${file}`)
      return readFileSync(path.join(process.cwd(),'content/salmon',file))
    },
  }
})
import {composePublicDocument,type RouteRecord} from '../../content/compose'
import {applyContentSlots,extractSlots,type ContentSlot} from '../../content/content-slots'
import {storedDocument} from '../../../ops/seo-pass/scan-slots'
import {repairDocumentText} from '../text-repair'
import type {SalmonDocument} from '../salmon'

type Row={path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean;canonical:string;redirect:string|null;sourceFile?:string;matchedArticle?:boolean}
const APP=process.cwd()
const json=<T,>(p:string)=>JSON.parse(readFileSync(path.join(APP,p),'utf8')) as T
import {ArchivePage} from '../ArchivePresentation'

const tsv_=null
void tsv_
const decoded=(p:string)=>{try{return decodeURIComponent(p)}catch{return p}}
const ledger=json<{routes:Row[]}>('content/release/route-ledger.json')
const rowFor=(p:string)=>ledger.routes.find(r=>decoded(r.path)===p&&r.sourceFile&&/^(?:SALMON|LIVE)-/.test(r.routeId))!
const products=new Map(ledger.routes.filter(r=>/^SALMON-product-[0-9]+$/.test(r.routeId)&&r.state==='PUBLIC'&&r.export).map(r=>[r.path,r.routeId] as [string,string]))
const productPath=new Map([...products].map(([p,id])=>[id,p]))
const saved={...process.env}
afterEach(()=>{process.env={...saved}})

/**
 * The page as Payload composes it from a record that has been SAVED (the batch writes every decided route): the save hook stores a
 * product relation's own path in the action slot's href, so those slots count as edited. `hookEffect=false` is the page as imported.
 */
function compose(p:string,hookEffect:boolean):SalmonDocument{
  const row=rowFor(p)
  const document=storedDocument(row as never)
  const slots=(extractSlots(document,{productIds:products}) as ContentSlot[]).map(s=>({...s}))
  if(hookEffect)for(const s of slots)if(s.kind==='action'&&s.productRouteId&&productPath.get(s.productRouteId))s.href=productPath.get(s.productRouteId)!
  const record={routeId:row.routeId,path:row.path,family:'salmon',title:String(document.title??''),document,slots,restoredSections:null} as RouteRecord
  return repairDocumentText(composePublicDocument(record) as unknown as SalmonDocument)
}
const titleLinks=(html:string)=>[...html.matchAll(/<h3 class="sp-product-title">(.*?)<\/h3>/gs)].map(m=>m[1]!.replace(/<[^>]+>/g,'').trim())
const cardCount=(html:string)=>(html.match(/class="sp-product"/g)??[]).length
const mediaCount=(html:string)=>(html.match(/class="sp-product-media"/g)??[]).length

describe('CATEGORY-CARDS-1: a saved record keeps its product cards (DD-B1)',()=>{
  const el=(tag:string,attrs:Record<string,string>,...children:unknown[])=>({tag,attrs,children})
  it('an action slot whose href changed but whose label did not leaves the link\'s image and heading alone',()=>{
    const card=el('a',{href:'https://salmon.example/product/x/'},el('img',{src:'/a.jpg',alt:'A'}),el('h2',{},'Fill pack'))
    const doc={children:[el('div',{},card)]}
    const slots=extractSlots(doc as never,{productIds:new Map([['/product/x/','SALMON-product-1']])}) as ContentSlot[]
    const action=slots.find(s=>s.kind==='action')!
    expect(action.label).toBe('Fill pack')
    action.href='/product/x/' // what the save hook stores for a product relation
    const out=applyContentSlots(doc as never,slots) as unknown as {children:Array<{children:Array<{attrs:Record<string,string>;children:unknown[]}>}>}
    const a=out.children[0]!.children[0]!
    expect(a.attrs.href).toBe('/product/x/')
    expect(JSON.stringify(a.children)).toContain('"img"')
    expect(JSON.stringify(a.children)).toContain('Fill pack')
    expect(JSON.stringify(a.children)).toContain('"h2"')
  })
  it('a label an editor really changes is still applied',()=>{
    const doc={children:[el('div',{},el('a',{href:'/contact-us/',class:'elementor-button'},el('span',{},'Contact')))]}
    const slots=extractSlots(doc as never) as ContentSlot[]
    slots.find(s=>s.kind==='action')!.label='Contact sales'
    const out=applyContentSlots(doc as never,slots)
    expect(JSON.stringify(out)).toContain('Contact sales')
    expect(JSON.stringify(out)).not.toContain('"Contact"')
  })

  const routes=ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&/^\/product-(?:category|tag)\//.test(decoded(r.path))&&rowFor(decoded(r.path)))
  it('covers the category and tag routes',()=>{expect(routes.length).toBeGreaterThan(40)})
  it('every category and tag route with products renders each card with a title and its image, after a save as after the import',()=>{
    process.env.H2O_CONTENT_SOURCE='payload'
    let withProducts=0
    for(const r of routes){
      const p=decoded(r.path)
      const imported=renderToStaticMarkup(<ArchivePage doc={compose(p,false)}/>)
      if(!cardCount(imported))continue
      withProducts++
      const saved_=renderToStaticMarkup(<ArchivePage doc={compose(p,true)}/>)
      expect(cardCount(saved_),`${p}: cards`).toBe(cardCount(imported))
      const titles=titleLinks(saved_)
      expect(titles.length,`${p}: titles`).toBe(cardCount(saved_))
      expect(titles.filter(t=>!t),`${p}: empty titles`).toEqual([])
      expect(saved_,`${p}: a card says its image is not available`).not.toContain('Image not available')
      expect(mediaCount(saved_),`${p}: images`).toBe(mediaCount(imported))
      expect(titleLinks(imported),`${p}: same titles as the import`).toEqual(titles)
    }
    expect(withProducts).toBeGreaterThan(30)
  },600000)
})
