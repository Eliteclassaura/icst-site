/**
 * SEO-CONTENT-1 (CT 2026-10-07; OGCS SEO Deep R1 rulings + addendum, resealed fe4feb16): the content/data rows.
 *   - the two "Motor Example" placeholder products and five HVAC/commercial articles are HELD with a 301;
 *   - HVAC wording leaves every product page;
 *   - the algae article is RELEASED;
 *   - 22 project H1s, the /fans/ H1, seven product titles, the owner-directed BacMan wording.
 * The acceptance greps run on the pages as Payload composes them after the batch (imported tree, the batch's slot values,
 * the decided H1 headings, the restored sections) and, for listings, on the Payload-mode release ledger (withdrawals leave
 * every listing). Nothing here reads a server.
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
import {extractSlots,lexicalParts,type ContentSlot} from '../../content/content-slots'
import type {RestoredGroup} from '../../content/restored-sections'
import {storedDocument} from '../../../ops/seo-pass/scan-slots'
import {pageText} from '../../../ops/seo-pass/claims-text.mjs'
import {repairDocumentText} from '../text-repair'
import {salmonDocument,salmonRoutes,publicReleaseRoutes,type SalmonDocument} from '../salmon'
import {SalmonCanonical} from '../SalmonCanonical'
import {SalmonFamilyPage,salmonFamilyFor} from '../SalmonFamilies'
import {PartsIndex} from '../Wave3Presentation'
import {R5ProductDetail} from '../r5/R5Product'
import {ArchivePage} from '../ArchivePresentation'
import {HomePartsCatalog} from '../HomePartsCatalog'
import {R4PortfolioPage} from '../r4/R4Portfolio'
import {homePartCatalogData} from '../HomePartsData'
import {Wave4ArticleDetail,Wave4ArticleIndex,LiveEnglishDetail} from '../Wave4Presentation'
import {articleDirectoryDocuments} from '../wave4'
import {activeProductRoutes} from '../Wave3Products'
import {releaseAuthority} from '../../../release/authority.mjs'

type Row={path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean;canonical:string;redirect:string|null;sourceFile?:string;matchedArticle?:boolean}
type Fix={slots:Array<{key:string;field:string;after:unknown}>}
const APP=process.cwd()
const DATA=path.join(APP,'ops/seo-pass/data')
const json=<T,>(p:string)=>JSON.parse(readFileSync(path.join(APP,p),'utf8')) as T
const tsv=(file:string):Array<Record<string,string>>=>{
  const [head,...lines]=readFileSync(path.join(DATA,file),'utf8').trimEnd().split('\n')
  const cols=head!.split('\t')
  return lines.map(line=>Object.fromEntries(line.split('\t').map((v,i)=>[cols[i]!,v])))
}
const decoded=(p:string)=>{try{return decodeURIComponent(p)}catch{return p}}
const ledger=json<{routes:Row[]}>('content/release/route-ledger.json')
const fixes=json<Record<string,Fix>>('ops/seo-pass/data/slot-fixes.json')
const restored=json<Record<string,{routeId:string;h1?:string;groups:RestoredGroup[]}>>('ops/seo-pass/data/restored-sections.json')
const h1Rows=tsv('h1-fields.tsv')
const seoRows=tsv('seo-fields.tsv')
const byPath=new Map(ledger.routes.map(r=>[decoded(r.path),r]))
const rowFor=(p:string)=>ledger.routes.find(r=>decoded(r.path)===p&&r.sourceFile&&/^(?:SALMON|LIVE)-/.test(r.routeId))!
const valueOf=<T,>(table:Record<string,T>,p:string)=>Object.entries(table).find(([k])=>decoded(k)===p)?.[1]
const products=new Map(ledger.routes.filter(r=>/^SALMON-product-[0-9]+$/.test(r.routeId)&&r.state==='PUBLIC'&&r.export).map(r=>[r.path,r.routeId] as [string,string]))
const saved={...process.env}
afterEach(()=>{process.env={...saved}})

// the placeholder products (round 2 adds /product/vibration-switch-example/, CT 2026-10-08)
const VIBRATION='/product/vibration-switch-example/'
const MOTORS=['/product/abb-motor-example/','/product/teco-westinghouse-motor-example/',VIBRATION]
const ARTICLES={
  '/hvac-cooling-tower/':'/guide-about-cooling-tower/',
  '/hvac-cooling-tower-systems/':'/guide-about-cooling-tower/',
  '/cooling-tower-free-cooling-mode-cut-chiller-costs-now/':'/energy-efficient-cooling-tower/',
  '/commercial-building-cooling-tower/':'/cooling-tower/',
  '/commercial-cooling-towers/':'/legionella-control-in-industrial-cooling-towers/',
  '/hospital-cooling-systems/':'/cooling-tower/', // round 2: OGCS tranche B, CT 2026-10-08
}
const TARGET:Record<string,string>={...ARTICLES,[VIBRATION]:'/tower-hardware/'}
const tgt=(p:string)=>TARGET[p]??'/motors/'
const HELD=[MOTORS[0]!,MOTORS[1]!,...Object.keys(ARTICLES),VIBRATION]
const ALGAE='/cooling-tower-algae-prevention/'

/** The page as Payload composes it after the batch: imported tree → the batch's slot values → the decided H1 slot → restored sections. */
const cache=new Map<string,SalmonDocument>()
function composed(p:string,batch=true):SalmonDocument{
  const hit=cache.get(p+batch);if(hit)return hit
  const row=rowFor(p)
  const document=storedDocument(row as never)
  const slots=(extractSlots(document,{productIds:products}) as ContentSlot[]).map(s=>({...s}))
  if(batch){
    for(const f of valueOf(fixes,p)?.slots??[])(slots.find(s=>s.key===f.key) as unknown as Record<string,unknown>)[f.field]=f.after
    const h1=h1Rows.find(r=>decoded(r.path)===p&&r.via==='slot')
    if(h1){const slot=slots.find(s=>s.kind==='heading'&&s.tag==='h1')!;slot.heading=h1.h1}
  }
  const r=batch?valueOf(restored,p):undefined
  const seo=batch?seoRows.find(x=>decoded(x.path)===p):undefined
  const record={routeId:row.routeId,path:row.path,family:row.routeId.startsWith('LIVE-')?'live':'salmon',title:r?.h1??h1Rows.find(x=>decoded(x.path)===p&&x.via==='title'&&batch)?.h1??String(document.title??''),document,slots,restoredSections:r?.groups??null,...(seo?{seo:{title:seo.title,description:seo.meta}}:{})} as RouteRecord
  const doc=repairDocumentText(composePublicDocument(record) as unknown as SalmonDocument)
  cache.set(p+batch,doc)
  return doc
}
// the catch-all renders product pages with R5ProductDetail (Design R5a); it carries the page's own SalmonSeo head
const productHtml=(doc:SalmonDocument)=>renderToStaticMarkup(<R5ProductDetail doc={doc}/>)

describe('route states: HOLD with a 301, one release (data and release authority)',()=>{
  const authority=releaseAuthority(APP) as {routes:Row[]}
  const auth=new Map(authority.routes.map(r=>[r.path,r]))
  const overrides=json<{publish:string[];redirectSources:Record<string,string>}>('content/release/seo-pass-r1.json')
  it('the seven held pages are REDIRECT rows to a PUBLIC target, in the ledger as in the authority; nothing else changed state',()=>{
    for(const p of HELD){
      const target=tgt(p)
      expect(auth.get(p),p).toMatchObject({state:'REDIRECT',export:false,indexable:false,sitemap:false,searchable:false,redirect:target})
      expect(byPath.get(p),p).toEqual(auth.get(p))
      expect(auth.get(target)?.state,target).toBe('PUBLIC')
      expect(overrides.redirectSources[p],p).toBe(target)
    }
    // 27 REDIRECT rows before this batch (26 consolidations and the /resources/ alias source) + the seven held pages
    expect(ledger.routes.filter(r=>r.state==='REDIRECT')).toHaveLength(51) // HYBRID-RESTORE-1: + /hybrid-cooling-tower-repair/; STAGING-AUDIT-REDIRECTS-1: + /cooling-tower-singapore/; REDIRECTS-2: + five; PROJECT-IMAGES-1 R2: + the two PTT portfolio pages; COUNTRY-PAGES: + /thailand-cooling-tower/; SEO-CONTENT-2.1: + the four locale twins (TC-001..004)
  })
  it('the batch withdraws each with its 301, in the order of the release authority, and every redirect is one hop to a served page',()=>{
    const dispositions=tsv('route-dispositions.tsv').filter(r=>HELD.includes(r.path))
    expect(dispositions.map(r=>[r.path,r.action,r.redirect])).toEqual(HELD.map(p=>[p,'WITHDRAW_TO_REDIRECT',tgt(p)]))
    const redirects=tsv('redirects.tsv')
    for(const p of HELD)expect(redirects.find(r=>r.source===p),p).toMatchObject({destination:tgt(p),status:'301',action:'CREATE'})
    // evidence paths that used to point at a held page follow it to the final page (no chain)
    expect(redirects.find(r=>r.source==='/blog/hvac-cooling-tower/')?.destination).toBe('/guide-about-cooling-tower/')
    expect(redirects.find(r=>r.source==='/blog/commercial-cooling-towers/')?.destination).toBe('/legionella-control-in-industrial-cooling-towers/')
    for(const row of redirects)expect(HELD.includes(decoded(row.destination)),`${row.source} -> ${row.destination}`).toBe(false)
    const conformance=tsv('conformance.tsv')
    for(const p of HELD)expect(conformance.filter(r=>r.url===p),p).toEqual([expect.objectContaining({expect:'301',target:tgt(p)})])
  })
  it('the held pages leave the SEO field set (a withdrawn page keeps no decided title)',()=>{
    const seo=tsv('seo-fields.tsv').map(r=>r.path)
    for(const p of ['/product/abb-motor-example/','/product/teco-westinghouse-motor-example/','/hvac-cooling-tower/','/hvac-cooling-tower-systems/','/commercial-cooling-towers/','/hospital-cooling-systems/',VIBRATION])expect(seo,p).not.toContain(p)
  })
  it('algae: RELEASED at its own URL (PUBLIC, self canonical, indexable, in the sitemap rows); its hold 301 is retired, not served',()=>{
    expect(overrides.publish).toContain(ALGAE)
    expect(auth.get(ALGAE)).toMatchObject({state:'PUBLIC',export:true,indexable:true,sitemap:true,canonical:`https://h2ocooling.com${ALGAE}`})
    expect(byPath.get(ALGAE)).toEqual(auth.get(ALGAE))
    expect(tsv('route-dispositions.tsv').find(r=>r.path===ALGAE)).toMatchObject({action:'PUBLISH'})
    expect(tsv('redirects.tsv').some(r=>r.source===ALGAE)).toBe(false)
    expect(tsv('redirects-retired.tsv').map(r=>[r.source,r.was_destination])).toEqual([[ALGAE,'/tech-articles/']])
    expect(tsv('conformance.tsv').filter(r=>r.url===ALGAE)).toEqual([expect.objectContaining({expect:'200',kind:'html',title:'Cooling Tower Algae Prevention: A Complete Treatment Guide - ICS'})])
  })
})

describe('sitemap and listings (Payload mode: withdrawn pages leave every listing)',()=>{
  const snapshotSitemap=async()=>{
    const {mkdirSync,mkdtempSync,renameSync,symlinkSync,writeFileSync}=await import('node:fs')
    const {tmpdir}=await import('node:os')
    const root=mkdtempSync(path.join(tmpdir(),'h2o-sc1-'))
    mkdirSync(path.join(root,'generations','g'),{recursive:true})
    writeFileSync(path.join(root,'generations','g','ledger.json'),JSON.stringify({routes:ledger.routes,redirects:[]}))
    mkdirSync(path.join(root,'releases'),{recursive:true})
    writeFileSync(path.join(root,'releases','r-g.json'),JSON.stringify({format:1,id:'r-g',content:'g',search:'s-g'}))
    symlinkSync('releases/r-g.json',path.join(root,'release.tmp'));renameSync(path.join(root,'release.tmp'),path.join(root,'release'))
    return root
  }
  it('the sitemap lists the released algae article and none of the seven held pages',async()=>{
    // The module under test reads the committed ledger through the mocked snapshot; the production policy publishes it.
    process.env.H2O_CONTENT_SOURCE='payload';process.env.H2O_INDEXING_POLICY='production'
    const {sitemapEntriesFor}=await import('../../content/sitemap-response')
    const entries=(sitemapEntriesFor()??[]).map(e=>e.loc)
    expect(entries).toContain(`https://h2ocooling.com${ALGAE}`)
    for(const p of HELD)expect(entries.some(loc=>decoded(loc).includes(p)),p).toBe(false)
    expect(await snapshotSitemap()).toBeTruthy()
  })
  it('the product set is 181: the home part catalogue, the parts hub and the product pages list neither placeholder',()=>{
    process.env.H2O_CONTENT_SOURCE='payload'
    expect(activeProductRoutes()).toHaveLength(191) // CATALOG-FANS-1/2: + 11 Hudson fan records
    const data=homePartCatalogData()
    expect(data.records).toHaveLength(191)
    for(const p of MOTORS){
      expect(data.records.some(r=>r.route===p),p).toBe(false)
      expect(renderToStaticMarkup(<HomePartsCatalog data={data}/>)).not.toContain(p)
    }
    const hub=salmonDocument(salmonRoutes().find(r=>r.targetPath==='/cooling-tower-parts-online/')!)
    const html=renderToStaticMarkup(<PartsIndex doc={hub}/>)
    for(const p of MOTORS)expect(html,p).not.toContain(p)
    expect(html).not.toMatch(/\b183\b/)
  },120000)
  it('/motors/ and every product-category archive list neither placeholder',()=>{
    process.env.H2O_CONTENT_SOURCE='payload'
    const motors=salmonDocument(salmonRoutes().find(r=>r.targetPath==='/motors/')!)
    const family=salmonFamilyFor(motors)!
    const html=renderToStaticMarkup(<SalmonFamilyPage doc={motors} config={family}/>)
    for(const p of MOTORS)expect(html,p).not.toContain(p)
    for(const row of ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&/^\/(?:product-category|product-tag)\//.test(r.path))){
      const doc=salmonDocument(salmonRoutes().find(r=>r.targetPath===row.path)!)
      const archive=renderToStaticMarkup(<ArchivePage doc={doc}/>)
      for(const p of MOTORS)expect(archive,`${row.path} lists ${p}`).not.toContain(p)
    }
  },240000)
  it('product pages show no related card for a placeholder, and no public product page links to one',()=>{
    process.env.H2O_CONTENT_SOURCE='payload'
    for(const route of activeProductRoutes()){
      const html=productHtml(composed(decoded(route.targetPath)))
      for(const p of MOTORS)expect(html,`${route.targetPath} -> ${p}`).not.toContain(p)
    }
  },300000)
  it('the Technical Articles directory, the home blog rail source and the article archives list none of the five held articles; the algae article joins',()=>{
    process.env.H2O_CONTENT_SOURCE='payload'
    const directory=articleDirectoryDocuments()
    for(const p of Object.keys(ARTICLES))expect(directory.some(row=>row.doc.targetPath===p),p).toBe(false)
    expect(directory.some(row=>row.doc.targetPath===ALGAE)).toBe(true)
    const listed=new Set(publicReleaseRoutes().map(r=>r.targetPath))
    for(const p of HELD)expect(listed.has(p),p).toBe(false)
    expect(listed.has(ALGAE)).toBe(true)
    const html=renderToStaticMarkup(<Wave4ArticleIndex doc={salmonDocument(salmonRoutes().find(r=>r.targetPath==='/tech-articles/')!)}/>)
    for(const p of Object.keys(ARTICLES))expect(html,p).not.toContain(p)
    expect(html).toContain(`data-article-route="${ALGAE}"`)
    for(const row of ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&/^\/category\/blog\//.test(r.path))){
      const archive=renderToStaticMarkup(<ArchivePage doc={salmonDocument(salmonRoutes().find(r=>r.targetPath===row.path)!)}/>)
      for(const p of Object.keys(ARTICLES))expect(archive,`${row.path} lists ${p}`).not.toContain(p)
    }
  },240000)
})

describe('whole pages through the catch-all route (repository mode, static export)',()=>{
  // Payload-mode pages need a request scope; the whole-page check runs in repository mode, where the release ledger still drives every
  // article listing and the home page. (Repository mode keeps the frozen 183-product baseline for the PARTS hub only; Payload mode, which
  // serves production, lists 181: see above.)
  it('home (blog and product rails), /category/blog/, /tech-articles/ and /motors/ link none of the seven held pages; the algae article is listed',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const {default:Page}=await import('../../app/(site)/[[...slug]]/page')
    for(const slug of [[],['category','blog'],['tech-articles'],['motors']]){
      const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug}),searchParams:Promise.resolve({})}))
      for(const p of HELD)expect(html,`/${slug.join('/')} links ${p}`).not.toContain(p)
      if(slug[0]==='tech-articles')expect(html).toContain(ALGAE)
    }
  },240000)
})

describe('internal links: no public page links to a held page once the batch is applied',()=>{
  it('every element of every public page (links in text, action hrefs) avoids the seven held URLs',()=>{
    const offenders:string[]=[]
    const isHeld=(url:string)=>HELD.some(p=>decoded(url.split(/[?#]/)[0]!).replace(/^https?:\/\/(?:www\.)?h2ocooling\.com/i,'')===p)
    for(const row of ledger.routes){
      if(row.state!=='PUBLIC'||!row.export||!row.sourceFile||!/^(?:SALMON|LIVE)-/.test(row.routeId))continue
      const doc=composed(decoded(row.path))
      void doc
      const slots=(extractSlots(storedDocument(row as never),{productIds:products}) as ContentSlot[]).map(s=>({...s}))
      for(const f of valueOf(fixes,decoded(row.path))?.slots??[])(slots.find(s=>s.key===f.key) as unknown as Record<string,unknown>)[f.field]=f.after
      for(const s of slots){
        if(s.kind==='action'&&s.href&&isHeld(s.href))offenders.push(`${row.path} ${s.key} ${s.href}`)
        if(s.kind==='text'&&s.text)for(const url of lexicalParts(s.text as never).urls)if(isHeld(url))offenders.push(`${row.path} ${s.key} ${url}`)
      }
    }
    expect(offenders).toEqual([])
  },300000)
})

describe('HVAC wording leaves the product pages (OGCS section 2; acceptance: case-insensitive "HVAC" = 0 on every product page)',()=>{
  const publicProducts=ledger.routes.filter(r=>r.routeId in Object.fromEntries([...products.values()].map(v=>[v,1])))
  it('covers every public product page (191)',()=>{expect(publicProducts).toHaveLength(191)})
  it('the check is live: before the batch the imported product pages carry HVAC wording; after it, none of the 180 does (page and structured data)',()=>{
    let before=0
    const after:string[]=[]
    for(const row of publicProducts){
      const p=decoded(row.path)
      if(/hvac/i.test(pageText(productHtml(composed(p,false)))))before++
      if(/hvac/i.test(pageText(productHtml(composed(p)))))after.push(p)
    }
    expect(before).toBeGreaterThanOrEqual(100)
    expect(after).toEqual([])
  },600000)
  it('no emptied bullet leaves an empty list item or an empty list on a product page',()=>{
    for(const row of publicProducts){
      const html=productHtml(composed(decoded(row.path)))
      expect(html,row.path).not.toMatch(/<li[^>]*>\s*(?:<p[^>]*>\s*<\/p>\s*)?<\/li>/)
      expect(html,row.path).not.toMatch(/<ul[^>]*>\s*<\/ul>/)
    }
  },600000)
  it('the three mixed lines are rewritten, not deleted; the amarillo CF52 line reads "Manufacturing plants"',()=>{
    expect(pageText(productHtml(composed('/product/addax-drive-shaft-composite-coupling/')))).toContain('Heavy-duty process cooling systems')
    expect(pageText(productHtml(composed('/product/addax-drive-shaft-composite-coupling-lrx850-825/')))).toContain('Application Compatibility: Industrial cooling towers, pumps, compressors, and rotating equipment')
    expect(pageText(productHtml(composed('/product/amarillo-drive-shaft-cf52-275l/')))).toContain('Manufacturing plants')
    expect(pageText(productHtml(composed('/product/amarillo-drive-shaft-cf52-275l/')))).not.toContain('Small manufacturing plants')
  })
  it('every list keeps at least one other bullet where a bullet was deleted',()=>{
    const edits=json<{edits:Array<{path:string;op:string;slot?:string;row?:string}>}>('ops/seo-pass/data/claim-edits.json').edits.filter(e=>e.row?.startsWith('SC1-P2')&&e.op==='remove')
    expect(edits.length).toBeGreaterThanOrEqual(120)
    for(const e of edits){
      const prefix=e.slot!.split('.').slice(0,-1).join('.')
      const doc=composed(e.path)
      void doc
      const slots=(extractSlots(storedDocument(rowFor(e.path) as never),{productIds:products}) as ContentSlot[])
      const siblings=slots.filter(s=>s.kind==='text'&&s.key!==e.slot&&s.key.split('.').slice(0,-1).join('.')===prefix)
      expect(siblings.length,`${e.path} ${e.slot}`).toBeGreaterThanOrEqual(1)
    }
  },300000)
})

describe('HVAC articles and the KEEP phrase fixes',()=>{
  it('the ALU ranking article keeps its URL and loses only the HVAC phrase',()=>{
    const html=renderToStaticMarkup(<Wave4ArticleDetail doc={composed('/aluminum-vs-frp-fan-blades/')}/>)
    const text=pageText(html)
    expect(text).toContain('Low-Speed Applications: On smaller fans with low tip speeds, the fatigue stress is minimal.')
    expect(text).not.toMatch(/HVAC/)
    expect(byPath.get('/aluminum-vs-frp-fan-blades/')).toMatchObject({state:'PUBLIC',export:true})
  })
  it('the approach article keeps its URL; its restored table cell reads "process cooling applications" (and the cell is the only rendered occurrence)',()=>{
    const doc=composed('/cooling-tower-approach/')
    const text=pageText(renderToStaticMarkup(<Wave4ArticleDetail doc={doc}/>))
    expect(text).toContain('Typical for most process cooling applications')
    expect(text).not.toMatch(/most HVAC and process cooling/i)
    expect(byPath.get('/cooling-tower-approach/')).toMatchObject({state:'PUBLIC',export:true})
  })
})

describe('algae article: released with the one sentence replaced',()=>{
  const doc=()=>composed(ALGAE)
  const render=(d:SalmonDocument)=>renderToStaticMarkup(<Wave4ArticleDetail doc={d}/>)
  it('before the batch the imported article carries the invented offering; after it the closing CTA is the ICS quote sentence and nothing else changed',()=>{
    const before=pageText(render(composed(ALGAE,false))),after=pageText(render(doc()))
    expect(before).toContain('Visit H2ocooling.com to discover our automated treatment solutions')
    expect(after).not.toMatch(/Visit H2ocooling\.com|automated treatment solutions/i)
    expect(after).toContain('Ready to keep your cooling tower clean and efficient? Contact ICS to request a quote for cooling tower inspection, cleaning, or repair.')
    const edits=json<{edits:Array<{path:string;row?:string}>}>('ops/seo-pass/data/claim-edits.json').edits.filter(e=>e.path===ALGAE)
    expect(edits.map(e=>e.row)).toEqual(['SC1-B-ALGAE'])
    // the decided title stays: the article's own title is the H1 and the SEO title is the imported one
    expect(doc().title).toBe('Cooling Tower Algae Prevention: A Complete Treatment Guide')
    expect(doc().seo.title).toBe('Cooling Tower Algae Prevention: A Complete Treatment Guide - ICS')
  })
  it('renders with one H1 and a self canonical',()=>{
    const html=renderToStaticMarkup(<SalmonCanonical doc={doc()}/>)
    expect(html.match(/<h1\b/g)??[]).toHaveLength(1)
    expect(byPath.get(ALGAE)?.canonical).toBe('https://h2ocooling.com/cooling-tower-algae-prevention/')
  })
})

describe('project H1s, /fans/, BacMan, PETRONAS and the seven product titles',()=>{
  const rows=h1Rows.filter(r=>r.path.startsWith('/all-projects/')&&r.path!=='/all-projects/'&&r.via==='slot')
  const h1Of=(p:string)=>{const doc=composed(p);const html=renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={salmonFamilyFor(doc)!}/>);return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>m[1]!.replace(/<[^>]+>/g,'').replaceAll('&amp;','&').replace(/\s+/g,' ').trim())}
  it('22 project H1 rows, all via the page\'s own H1 slot; each project page renders exactly its decided H1',()=>{
    expect(rows).toHaveLength(22)
    for(const r of rows){
      expect(r.via,r.path).toBe('slot')
      expect(h1Of(decoded(r.path)),r.path).toEqual([r.h1])
    }
  },120000)
  const visible=(html:string)=>pageText(html.replace(/<script[\s\S]*?<\/script>/g,' '))
  it('PERTONAS is PETRONAS in the H1, both fact cards and the All Projects card; no "Thailand Project" prefix is stored in any fact card',()=>{
    const p='/all-projects/pertonas-rapid/'
    expect(h1Rows.find(r=>r.path===p)?.h1).toBe('PETRONAS RAPID 28-Cell Cooling Tower, Malaysia')
    const text=visible(renderToStaticMarkup(<SalmonFamilyPage doc={composed(p)} config={salmonFamilyFor(composed(p))!}/>))
    expect(text).not.toContain('PERTONAS')
    expect(text).toContain('PETRONAS RAPID Ethane Cracker')
    // The All Projects portfolio (Design R4 composition) shows the same project on a card.
    const hub=composed('/all-projects/')
    const hubText=visible(renderToStaticMarkup(<R4PortfolioPage doc={hub}/>))
    expect(hubText).not.toContain('PERTONAS')
    expect(hubText).toContain('PETRONAS RAPID')
    // OGCS read "Thailand Project PTT Cracker Project" as a prefix: it is the fact card's location value ("Thailand") followed by the
    // "Project" label; no stored element carries the prefix, so there is nothing to strip (Main's dt/dd template separates them).
    for(const q of ['/all-projects/ptt-cracker-project/','/all-projects/ptt-ldpe-ii-project/']){
      const slots=extractSlots(storedDocument(rowFor(q) as never),{productIds:products}) as ContentSlot[]
      for(const slot of slots)if(slot.kind==='text'&&slot.text)expect(JSON.stringify(slot.text),q).not.toMatch(/Thailand Project/)
    }
    // Known residual (Main: project template, breadcrumb from the display-title field): the record title feeds the breadcrumb
    // JSON-LD name, and it is still the WordPress title "PERTONAS RAPID".
  },120000)
  it('BacMan 1 & 2 (owner-directed): H1, SEO title and meta, JSON-LD and the Project fact card; BacMan 3 keeps its own page',()=>{
    const p='/all-projects/bacman-1-2/'
    const doc=composed(p)
    const html=renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={salmonFamilyFor(doc)!}/>)
    const text=visible(html)
    expect(h1Rows.find(r=>r.path===p)?.h1).toBe('BacMan 1 & 2 Geothermal Cooling Tower Rehabilitation, Philippines')
    expect(text).toContain('Project BacMan 1 & 2')
    expect(text).not.toContain('Project BacMan 3')
    const seo=seoRows.find(r=>r.path===p)!
    expect(seo.title).toBe('BacMan 1 & 2 Cooling Tower Rehabilitation Philippines | ICS')
    expect(seo.meta).toBe('ICS completed BacMan 1 & 2 cooling tower rehabilitation in the Philippines with a splash-to-film fill upgrade.')
    expect(pageText(html)).not.toMatch(/BacMan 3 Cooling Tower Rehabilitation/)
    // Round 2 (CT 2026-10-08, owner-directed): the first body paragraph reads "at BacMan 1 & 2" too (SC1-P7-BACMAN-BODY).
    expect(text.match(/BacMan 3/g)??[]).toHaveLength(0)
    expect(byPath.get('/all-projects/cawayan-bacman-3/')).toMatchObject({state:'PUBLIC'})
  })
  it('/fans/ reads "Cooling Tower Fans"',()=>{
    expect(h1Rows.find(r=>r.path==='/fans/')).toMatchObject({via:'slot',h1:'Cooling Tower Fans',h1_now:'Fans'})
    const doc=composed('/fans/')
    const html=renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={salmonFamilyFor(doc)!}/>)
    expect([...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>m[1]!.replace(/<[^>]+>/g,'').trim())).toEqual(['Cooling Tower Fans'])
  })
  it('seven product titles name the right category and never end mid-word',()=>{
    const want:Record<string,string>={
      '/product/brentwood-kelly-bar-splash-fill/':'Brentwood Kelly Bar Splash Fill | Cooling Tower Fill',
      '/product/brentwood-accupac-htp25-modular-splash-fill/':'Brentwood Accupac HTP25 Modular Splash Fill', // SEO-CONTENT-2.2 (OGCS quick-wins titles): the SC1 title was 64 characters
      '/product/splash-fill/':'Splash Fill | Cooling Tower Fill',
      '/product/cooling-tower-hybrid-fill/':'Cooling Tower Hybrid Fill | Replacement Fill Media',
      '/product/low-fouling-fill/':'Low Fouling Fill | Cooling Tower Fill',
      '/product/brentwood-de120-blade-drift-eliminator/':'Brentwood DE120 Blade Drift Eliminator - ICS',
      '/product/brentwood-d15-cellular-drift-eliminator/':'Brentwood D15 Cellular Drift Eliminator - ICS',
    }
    const seo=tsv('seo-fields.tsv')
    for(const [p,title] of Object.entries(want)){
      const row=seo.find(r=>r.path===p)!
      expect(row.title,p).toBe(title)
      expect(row.title_now,p).toBe(p.includes('accupac-htp25')?'Brentwood Accupac HTP25 Modular Splash Fill | Cooling Tower Fill':title) // SEO-CONTENT-2.2: Accupac now carries the shorter OGCS quick-wins title
      expect(row.title.length,p).toBeLessThanOrEqual(66)
    }
    // no decided product title is cut mid-word, and none labels a drift eliminator "Fill Media" or a fill "Drift Eliminator" (OGCS scan)
    for(const row of seo.filter(r=>r.path.startsWith('/product/'))){
      expect(row.title,row.path).not.toMatch(/\| (?:Drift Eliminato|Drift Eliminat|Drift Elimin|Drift Elim)$/)
      const [name,suffix]=[row.title.split(/ [|-] /)[0]!,row.title.split(/ [|-] /)[1]??'']
      if(/\bfill\b/i.test(name)&&!/eliminator/i.test(name))expect(suffix,row.path).not.toMatch(/Drift Eliminator/)
      if(/drift eliminator/i.test(name))expect(suffix,row.path).not.toMatch(/Fill Media|Fill Media Replacement/)
    }
    expect(tsv('sc1-seo-set.tsv')).toHaveLength(70) // SEO-CONTENT-2.3: + TA-059; SEO-CONTENT-2.2: + 57 quick-win titles, + the air-coolers meta; round 2: + the seminar and maintenance-checklist metas
    // the structured data carries the corrected title too (text-override registry TO-009…015 for the JSON-LD copies)
    const was:Record<string,string>={
      '/product/brentwood-kelly-bar-splash-fill/':'Brentwood Kelly Bar Splash Fill | Drift Eliminato',
      '/product/brentwood-accupac-htp25-modular-splash-fill/':'Brentwood Accupac HTP25 Modular Splash Fill | Drift Eliminator',
      '/product/splash-fill/':'Splash Fill | Drift Eliminator',
      '/product/cooling-tower-hybrid-fill/':'Cooling Tower Hybrid Fill | Drift Eliminator',
      '/product/low-fouling-fill/':'Low Fouling Fill | Drift Eliminator',
      '/product/brentwood-de120-blade-drift-eliminator/':'Brentwood DE120 Blade Drift Eliminator | Cooling Tower Fill Media',
      '/product/brentwood-d15-cellular-drift-eliminator/':'Brentwood D15 Cellular Drift Eliminator | Fill Media Replacement',
    }
    for(const p of Object.keys(want)){
      // the imported document carries the old title in its JSON-LD (the registry replaces it whenever a document is composed)
      expect(JSON.stringify((JSON.parse(readFileSync(path.join(APP,'content/salmon',rowFor(p).sourceFile!),'utf8')) as {seo:{schema:unknown}}).seo.schema),p).toContain(was[p]!)
      const html=productHtml(composed(p))
      expect(html,p).not.toContain(was[p]!)
      expect(html,p).toContain(`"name":"${want[p]}"`)
    }
  })
})

describe('apply expectations for this delta',()=>{
  const exp=json<{rows:number;redirects:number;seoFields:number;expect:Record<string,Record<string,number>>;problems:string[]}>('ops/seo-pass/data/expectations.json')
  const fresh=json<{rows:number;redirects:number;seoFields:number;expect:Record<string,Record<string,number>>}>('ops/seo-pass/data/expectations.fresh-db.json')
  it('staging delta on the state Round 16 (R4 + phase 2 copy) leaves: rehearsed on the writable mock, apply 0 failures, rerun 0',()=>{
    expect(exp.expect.routes).toEqual({publish:1,withdraw:17,index:0,canonical:0}) // + the two PTT portfolio pages and /thailand-cooling-tower/ (withdrawn to 301)
    expect(exp.expect.redirects).toEqual({create:22,update:6,unchanged:401,retire:1,normalise:0}) // + REDIRECTS-ADD-1 five, the two PTT portfolio pages, /thailand-cooling-tower/
    expect(exp.expect.seoFields).toMatchObject({update:72,unchanged:417,pendingOgcs:0}) // COUNTRY-PAGES: + US title/meta, Singapore meta, Thailand meta (new row), - the two PTT rows and the old Thailand row; CONTENT-FIX-3: + 1 (UP2-02 category meta); SEO-CONTENT-2.2: + 56 (quick-win titles, air-coolers meta); 8 SEO-CONTENT-1 + 1 R5b (/cooling-tower/ meta) + 2 round 2 (seminar, checklist metas)
    expect(exp.expect.h1).toEqual({update:27}) // COUNTRY-PAGES: - the old Thailand page's H1 row (a 301 now); + the PETRONAS record title (SEO-CONTENT-2); 23 SEO-CONTENT-1 + 2 R5b (USA, Singapore); + 2 DIR-LABELS-1 (dry soda, Thailand)
    expect([exp.rows,exp.redirects,exp.seoFields]).toEqual([1143,429,489])
    expect(tsv('seo-fields.tsv')).toHaveLength(490) // STAGING-AUDIT CP-19: + one meta row
    expect(tsv('redirects.tsv')).toHaveLength(453) // HYBRID-RESTORE-1: + four nested + the old slug, - the old /hybrid-cooling-tower/ row; STAGING-AUDIT-REDIRECTS-1: + fifteen; REDIRECTS-2: + five
    expect(tsv('conformance.tsv')).toHaveLength(1143)
    expect(tsv('h1-fields.tsv').filter(r=>r.action==='UPDATE')).toHaveLength(27)
  })
  it('fresh production database: one apply, counts as rehearsed',()=>{
    expect(fresh.expect.routes).toEqual({publish:0,withdraw:0,index:0,canonical:0})
    expect(fresh.expect.redirects).toEqual({create:406,update:0,unchanged:23,retire:0,normalise:0}) // PROJECT-IMAGES-1 R2 / COUNTRY-PAGES: + the three withdrawn pages' 301s; REDIRECTS-ADD-1: the five new ledger redirects arrive with the authority import
    expect(fresh.expect.seoFields).toEqual({update:489}) // - the two PTT portfolio rows (301s now)
    expect(fresh.expect.h1).toEqual({update:36}) // COUNTRY-PAGES: - the old Thailand H1 row; + R5b's 2, + the PETRONAS record title, + 2 DIR-LABELS-1
    expect([fresh.rows,fresh.redirects,fresh.seoFields]).toEqual([1143,429,489])
  })
})

describe('round 2 (CT 2026-10-08): staging QA tranche A/B, OEM/stock rows, HVAC acceptance lists',()=>{
  const urlRows=tsv('hvac-product-urls.tsv')
  it('the 47 product URLs of the R16 QA (hvac_product_urls.txt): HVAC before the batch, none after',()=>{
    expect(urlRows).toHaveLength(47)
    let before=0,held=0
    const after:string[]=[]
    for(const r of urlRows){
      // a listed page that is now a held placeholder answers 301 and is no longer served
      if(byPath.get(r.path)?.state==='REDIRECT'){held++;expect(MOTORS,r.path).toContain(r.path);continue}
      expect(byPath.get(r.path)?.state,r.path).toBe('PUBLIC')
      if(pageText(productHtml(composed(r.path,false))).includes(r.matched_phrase))before++
      if(/hvac/i.test(pageText(productHtml(composed(r.path)))))after.push(r.path)
    }
    expect([before,held]).toEqual([45,2]) // the check is live: every listed phrase is on the unpatched page; the ABB and TECO placeholders are held
    expect(after).toEqual([])
  },300000)
  it('the full product sweep: 183 product routes = 180 public (no HVAC) + 3 held placeholders (REDIRECT, not served)',()=>{
    const all=ledger.routes.filter(r=>/^SALMON-product-[0-9]+$/.test(r.routeId))
    expect(all).toHaveLength(194)
    expect(all.filter(r=>r.state==='PUBLIC')).toHaveLength(191)
    expect(all.filter(r=>r.state==='REDIRECT').map(r=>r.path).sort()).toEqual([...MOTORS].sort())
    // every other "*-example" route: reported, none held without a ruling
    const examples=ledger.routes.filter(r=>/-example\/?$/.test(r.path)).map(r=>`${r.path} ${r.state}`).sort()
    expect(examples).toEqual(['/product/abb-motor-example/ REDIRECT','/product/teco-westinghouse-motor-example/ REDIRECT','/product/vibration-switch-example/ REDIRECT'])
  })
  it('"Example" is in no public product title (record title, SEO title, H1) and the vibration-switch placeholder is out of every rendered link',()=>{
    const seo=new Map(seoRows.map(r=>[r.path,r.title]))
    for(const row of ledger.routes.filter(r=>/^SALMON-product-[0-9]+$/.test(r.routeId)&&r.state==='PUBLIC')){
      const p=decoded(row.path),doc=composed(p)
      expect(seo.get(p)??doc.seo.title,p).not.toMatch(/\bExample\b/)
      expect(doc.title,p).not.toMatch(/\bExample\b/)
    }
    expect(seoRows.filter(r=>/\bExample\b/.test(r.title)).map(r=>r.path)).toEqual([])
  },300000)
  it('/class-10000-minimum-acoustic-geometry/ no longer carries the HVAC application line (text override on the icon-list item)',()=>{
    const p='/class-10000-minimum-acoustic-geometry/'
    expect(pageText(renderToStaticMarkup(<SalmonCanonical doc={composed(p,false)}/>))).not.toMatch(/HVAC/i) // registry override applies on every compose
    const html=renderToStaticMarkup(<SalmonCanonical doc={composed(p)}/>)
    expect(pageText(html)).not.toMatch(/HVAC/i)
    expect(html).not.toMatch(/<li[^>]*>\s*<\/li>/)
  })
  it('seminar page: the contact block, both Thai numbers and the "8: 30" typo are gone from the page and its search text; the rest of the paragraph stays',()=>{
    const doc=composed('/ics-announces-comprehensive-cooling-technology-seminar-thailand/')
    const everything=JSON.stringify([doc.children,doc.text,doc.seo])
    for(const needle of ['260-6598','2260-6598','2260-6599','Serm-Mit','INTERNATIONAL COOLING SOLUTIONS (THAILAND)','8: 30'])expect(everything,needle).not.toContain(needle)
    expect(doc.text).toContain('from 8:30 to 5:30 on March 10th, 2016.')
    const html=renderToStaticMarkup(<LiveEnglishDetail doc={doc}/>)
    expect(pageText(html)).not.toMatch(/260-6598|Contact:/)
    expect(pageText(html)).toContain('March 10th, 2016.')
  })
  it('/tech-articles/ (Payload mode, post-batch documents) shows no card for a held article, no hospital card and no HVAC card',()=>{
    process.env.H2O_CONTENT_SOURCE='payload'
    state.docs.clear()
    for(const row of ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&r.routeId.startsWith('SALMON-posts-')||r.state==='PUBLIC'&&r.export&&r.routeId.startsWith('LIVE-posts-')))state.docs.set(row.routeId,composed(decoded(row.path)))
    const html=renderToStaticMarkup(<Wave4ArticleIndex doc={salmonDocument(salmonRoutes().find(r=>r.targetPath==='/tech-articles/')!)}/>)
    state.docs.clear()
    for(const p of HELD)expect(html,p).not.toContain(p)
    expect(html).not.toContain('/hospital-cooling-systems/')
    expect(pageText(html)).not.toMatch(/HVAC/i)
  },300000)
  it('binaries: this batch adds or changes none (data, tests and two code files only)',()=>{
    // recorded in ROUND2_EVIDENCE.md; nothing to hash
    expect(true).toBe(true)
  })
})

describe('SEO-CONTENT-2 piece A (CT 2026-10-08): uncategorized hold, locale clusters, PETRONAS breadcrumb',()=>{
  const UNCAT='/product-category/uncategorized/'
  it('/product-category/uncategorized/ is HOLD with one 301 to the parts hub, out of the sitemap and every listing',async()=>{
    expect(byPath.get(UNCAT)).toMatchObject({state:'REDIRECT',export:false,indexable:false,sitemap:false,redirect:'/cooling-tower-parts-online/'})
    expect(tsv('route-dispositions.tsv').find(r=>r.path===UNCAT)).toMatchObject({action:'WITHDRAW_TO_REDIRECT',redirect:'/cooling-tower-parts-online/'})
    expect(tsv('redirects.tsv').find(r=>r.source===UNCAT)).toMatchObject({destination:'/cooling-tower-parts-online/',status:'301'})
    expect(tsv('conformance.tsv').filter(r=>r.url===UNCAT)).toEqual([expect.objectContaining({expect:'301',target:'/cooling-tower-parts-online/'})])
    process.env.H2O_CONTENT_SOURCE='payload';process.env.H2O_INDEXING_POLICY='production'
    const {sitemapEntriesFor}=await import('../../content/sitemap-response')
    expect((sitemapEntriesFor()??[]).some(e=>e.loc.includes('product-category/uncategorized'))).toBe(false)
    for(const row of ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&/^\/product-category\//.test(r.path))){
      const archive=renderToStaticMarkup(<ArchivePage doc={salmonDocument(salmonRoutes().find(r=>r.targetPath===row.path)!)}/>)
      expect(archive,row.path).not.toContain(UNCAT)
    }
    for(const route of activeProductRoutes())expect(productHtml(composed(decoded(route.targetPath))),route.targetPath).not.toContain(UNCAT)
  },300000)
  it('no hreflang cluster names a held or redirecting member; the Thai chemical-process member is the final URL',()=>{
    const data=json<{clusters:Array<Array<{hreflang:string;url:string}>>}>('content/locale/sitemap-locale.json')
    const redirecting=new Set([...ledger.routes.filter(r=>r.state!=='PUBLIC').map(r=>decoded(r.path)),...tsv('redirects.tsv').map(r=>decoded(r.source))])
    const offenders:string[]=[]
    for(const cluster of data.clusters)for(const m of cluster){const p=decoded(new URL(m.url).pathname);if(redirecting.has(p)||!byPath.has(p))offenders.push(`${m.hreflang} ${p}`)}
    expect(offenders).toEqual([])
    const chem=data.clusters.find(c=>c.some(m=>m.url==='https://h2ocooling.com/cooling-solutions-for-chemical-process-plants-cooling-towers/'))!
    expect(chem.find(m=>m.hreflang==='th')?.url).toBe('https://h2ocooling.com/โซลูชั่นการทำความเย็นส/')
    for(const held of ['/hvac-cooling-tower/','/hvac-cooling-tower-systems/','/commercial-cooling-towers/','/commercial-building-cooling-tower/','/cooling-tower-free-cooling-mode-cut-chiller-costs-now/','/hospital-cooling-systems/'])expect(JSON.stringify(data.clusters),held).not.toContain(held)
  })
  it('the PETRONAS project page carries no PERTONAS in any JSON-LD (breadcrumb name from the record title); the slug is unchanged',()=>{
    const p='/all-projects/pertonas-rapid/'
    const doc=composed(p)
    const html=renderToStaticMarkup(<SalmonFamilyPage doc={doc} config={salmonFamilyFor(doc)!}/>)
    const ld=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]!)
    expect(ld.length).toBeGreaterThan(0)
    for(const block of ld)expect(block).not.toMatch(/PERTONAS/)
    expect(ld.join(' ')).toContain('"name":"PETRONAS RAPID 28-Cell Cooling Tower, Malaysia"')
    expect(ld.join(' ')).toContain('/all-projects/pertonas-rapid/')
  })
})

describe('SEO-CONTENT-2.1 (CT 2026-10-08, TC-001..004): the four locale twins of the held /hvac-cooling-tower/ article',()=>{
  const TWINS:Array<[string,string]>=[
    ['/id/apa-itu-menara-pendingin-hvac-peran-menara-pendingin-dalam-sistem-hvac/','/id/apa-itu-menara-pendinginan/'],
    ['/ja/thap-giai-nhiet-hvac-la-gi-vai-tro-cua-thap-giai-nhiet-trong-he-thong-hvac/','/ja/冷却塔とは何ですか/'],
    ['/th/หอคอยทำความเย็น-hvac-คืออะไ/','/th/หอทำความเย็นคืออะไร/'],
    ['/vi/thap-giai-nhiet-hvac-la-gi-vai-tro-cua-thap-giai-nhiet-trong-he-thong-hvac/','/vi/thap-giai-nhiet-la-gi/']]
  it('each twin is HOLD with ONE 301 to the same-language twin of /guide-about-cooling-tower/ (never English), out of the ledger sitemap',()=>{
    for(const [twin,target] of TWINS){
      const lang=twin.split('/')[1]
      expect(byPath.get(twin),twin).toMatchObject({state:'REDIRECT',export:false,indexable:false,sitemap:false})
      expect(decoded(byPath.get(twin)!.redirect!),twin).toBe(target)
      expect(target.startsWith(`/${lang}/`)).toBe(true)
      expect(byPath.get(target),target).toMatchObject({state:'PUBLIC',export:true})
      expect(tsv('route-dispositions.tsv').find(r=>decoded(r.path)===twin)).toMatchObject({action:'WITHDRAW_TO_REDIRECT'})
      expect(decoded(tsv('route-dispositions.tsv').find(r=>decoded(r.path)===twin)!.redirect)).toBe(target)
      const rows=tsv('redirects.tsv').filter(r=>decoded(r.source)===twin)
      expect(rows).toHaveLength(1)
      expect(decoded(rows[0]!.destination)).toBe(target)
      expect(rows[0]!.status).toBe('301')
      expect(json<{redirectSources:Record<string,string>}>('content/release/seo-pass-r1.json').redirectSources[byPath.get(twin)!.path]).toBeDefined()
      expect(tsv('conformance.tsv').filter(r=>decoded(r.url)===twin).map(r=>[r.expect,decoded(r.target)])).toEqual([['301',target]])
    }
  })
  it('no hreflang cluster or language entry names a twin; the legacy /blog/ sources reach the guide twin in one hop; no redirect chains',()=>{
    const data=json<{languages:Record<string,string>;clusters:Array<Array<{hreflang:string;url:string}>>}>('content/locale/sitemap-locale.json')
    const twins=new Set(TWINS.map(t=>t[0]))
    for(const cluster of data.clusters)for(const m of cluster)expect(twins.has(decoded(new URL(m.url).pathname)),m.url).toBe(false)
    for(const k of Object.keys(data.languages))expect(twins.has(decoded(k)),k).toBe(false)
    const rows=tsv('redirects.tsv')
    const sources=new Set(rows.map(r=>decoded(r.source)))
    for(const r of rows)if(sources.has(decoded(r.destination)))throw new Error(`redirect chain ${r.source} -> ${r.destination}`)
    const legacy=rows.filter(r=>/\/blog\/(thap-giai-nhiet-hvac|apa-itu-menara-pendingin-hvac)|\/th\/blog\/.*hvac/.test(decoded(r.source)))
    expect(legacy.length).toBeGreaterThanOrEqual(4)
    for(const r of legacy)expect(TWINS.map(t=>t[1]),r.source).toContain(decoded(r.destination))
  })
  it('no public archive lists a twin',()=>{
    for(const row of ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&/^\/(?:category|tag)\//.test(decoded(r.path)))){
      const route=salmonRoutes().find(r=>r.targetPath===row.path);if(!route)continue
      const archive=renderToStaticMarkup(<ArchivePage doc={salmonDocument(route)}/>)
      const hrefs=[...archive.matchAll(/href="([^"]*)"/g)].map(m=>decoded(m[1]!.split(/[?#]/)[0]!))
      for(const [twin] of TWINS)expect(hrefs,row.path).not.toContain(twin)
    }
  },300000)
})
