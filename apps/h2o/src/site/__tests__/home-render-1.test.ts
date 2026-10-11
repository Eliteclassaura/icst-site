/**
 * HOME-RENDER-1 (CT 2026-10-09): the home render was O(links x routes): every link resolved with linear scans over the whole ledger (a
 * decodeURIComponent on both sides of each comparison), in the release adaptation of a document and again in the site chrome. These tests pin
 * that the lookup tables answer exactly as the scans did (first match, decoded paths, trailing slashes, locale paths, malformed paths), and the
 * bounds and invalidation of the per-generation memos that go with it.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {routeTable} from '../../content/ledger-index'

const APP=process.cwd()
const env0={...process.env}
const O='https://h2ocooling.com'
type Row={path:string;routeId:string;state:string;canonical:string;indexable:boolean;redirect:string|null;export?:boolean}
const row=(p:string,extra:Partial<Row>={}):Row=>({path:p,routeId:`T${p}`,state:'PUBLIC',canonical:O+p,indexable:true,redirect:null,export:true,...extra})

/** a promoted release on disk: `<root>/release -> releases/r-<name>.json -> generations/<name>/` with the given files */
function promote(root:string,name:string,files:Record<string,string|Buffer>){
  const gen=path.join(root,'generations',name)
  mkdirSync(gen,{recursive:true})
  for(const [f,body] of Object.entries(files)){mkdirSync(path.dirname(path.join(gen,f)),{recursive:true});writeFileSync(path.join(gen,f),body)}
  mkdirSync(path.join(root,'releases'),{recursive:true})
  writeFileSync(path.join(root,'releases',`r-${name}.json`),JSON.stringify({format:1,id:`r-${name}`,content:name,search:`s-${name}`}))
  const tmp=path.join(root,`release.${name}`)
  symlinkSync(`releases/r-${name}.json`,tmp)
  renameSync(tmp,path.join(root,'release'))
}
const newRoot=()=>{
  const root=mkdtempSync(path.join(tmpdir(),'h2o-hr1-'))
  Object.assign(process.env,{H2O_CONTENT_SOURCE:'payload',CONTENT_SNAPSHOT_DIR:root})
  delete process.env.H2O_PUBLIC_EXPORT
  return root
}
/** replace a fixture file (usually a symlink to a real content file) with other bytes WITHOUT writing through the link */
const breakFile=(file:string)=>{rmSync(file,{force:true});writeFileSync(file,'garbage')}
beforeEach(()=>{vi.resetModules()})
afterEach(()=>{process.env={...env0};vi.resetModules()})

describe('routeTable: the first row for each decoded path, exactly what `find` returned',()=>{
  it('first match wins; encoded and decoded spellings are one key; the trailing slash is part of the path; no match is undefined',()=>{
    const rows=[row('/a/'),row('/a/',{state:'REVIEW_HOLD',routeId:'dup'}),row('/%E0%B8%9E%E0%B8%B1%E0%B8%94/'),row('/b'),row('/b/'),row('/x%2Fy/')]
    const table=routeTable(rows)!
    expect(table.get('/a/')!.routeId).toBe('T/a/')
    expect(table.get(decodeURIComponent('/%E0%B8%9E%E0%B8%B1%E0%B8%94/'))).toBe(rows[2])
    expect(table.get('/พัด/')).toBe(rows[2])
    expect(table.get('/b')).toBe(rows[3])
    expect(table.get('/b/')).toBe(rows[4])
    expect(table.get('/x/y/')).toBe(rows[5]) // %2F decodes to "/", as the old comparison did
    expect(table.get('/nope/')).toBeUndefined()
    for(const r of rows)expect(table.get(decodeURIComponent(r.path))).toBe(rows.find(c=>decodeURIComponent(c.path)===decodeURIComponent(r.path)))
  })
  it('is built once per ledger array, and a ledger with an undecodable path has no table (the caller scans as before)',()=>{
    const rows=[row('/a/')]
    expect(routeTable(rows)).toBe(routeTable(rows))
    expect(routeTable([row('/a/'),row('/%E0%A4%A/')])).toBeNull()
    expect(routeTable([])!.size).toBe(0)
  })
})

describe('link adaptation (release-document): the tables give the old scans\' answers on every case',()=>{
  const REDIRECTS=[{source:'/old/',destination:'/a/'},{source:'/old2/',destination:'/b/'},{source:'/%E0%B8%9E%E0%B8%B1%E0%B8%94-old/',destination:'/พัด/'},{source:'/old/',destination:'/c/'}]
  const ROWS=[
    row('/a/'),row('/a/',{state:'REVIEW_HOLD',routeId:'dup'}),row('/b/',{state:'REVIEW_HOLD'}),row('/c/',{state:'WITHDRAWN',redirect:'/a/'}),row('/d/',{state:'PRIVATE_ARCHIVE'}),
    row('/พัด/'),row('/%E0%B8%9E%E0%B8%B1%E0%B8%94-old/',{state:'REVIEW_HOLD'}),row('/e'),row('/ja/e/'),row('/doc.pdf',{state:'REVIEW_HOLD'}),
  ]
  const HREFS=[
    `${O}/a/`,`${O}/a`,`${O}/a/?x=1#top`,'https://www.h2ocooling.com/a/','https://salmon-rhinoceros-754457.hostingersite.com/a/',
    `${O}/old/`,`${O}/old2/`,`${O}/b/`,`${O}/c/`,`${O}/d/`,`${O}/missing/`,`${O}/e`,`${O}/e/`,`${O}/ja/e/`,
    `${O}/%E0%B8%9E%E0%B8%B1%E0%B8%94/`,`${O}/พัด/`,`${O}/%E0%B8%9E%E0%B8%B1%E0%B8%94-old/`,`${O}/doc.pdf`,
    `${O}/wp-content/uploads/x.pdf`,'#frag','/a/','/a/?q=1','a/','https://other.example/a/','mailto:sales@h2ocooling.com','tel:+6626617723',
    `${O}/%zz/`,`${O}/%E0%A4%A/`,`${O}/a%2Fb/`,`${O}/A/`,
  ]
  /** the pre-HOME-RENDER-1 logic, verbatim: two linear scans per link */
  const legacyHref=(href:string,sourceUrl:string,routes:Row[],redirects:Array<{source:string;destination:string}>):string|undefined=>{
    const attrs:Record<string,string|undefined>={href}
    if(attrs.href&&!attrs.href.startsWith('#')){
      try{
        const url=new URL(attrs.href,sourceUrl)
        if(['h2ocooling.com','www.h2ocooling.com','salmon-rhinoceros-754457.hostingersite.com'].includes(url.hostname)&&!url.pathname.startsWith('/wp-content/')){
          const target=routes.find(candidate=>decodeURIComponent(candidate.path)===decodeURIComponent(url.pathname))
          const redirect=redirects.find(candidate=>decodeURIComponent(candidate.source)===decodeURIComponent(url.pathname))
          if(redirect&&routes.some(candidate=>candidate.path===redirect.destination&&candidate.state==='PUBLIC'))attrs.href=redirect.destination+url.search+url.hash
          else if(target?.state==='PUBLIC')attrs.href=target.path+url.search+url.hash
          else if(target?.redirect)attrs.href=target.redirect+url.search+url.hash
          else delete attrs.href
        }
      }catch{/* kept */}
    }
    return attrs.href
  }
  const baseDoc=()=>JSON.parse(readFileSync(path.join(APP,'content/salmon/documents/SALMON-product-4869.json'),'utf8')) as {routeId:string;sourceUrl:string;targetPath:string;children:unknown[];seo:{canonical:string[];meta:unknown[];schema:string[]}}
  const run=async(rows:Row[],redirects:typeof REDIRECTS,targetPath:string)=>{
    const root=newRoot()
    promote(root,'g',{'ledger.json':JSON.stringify({origin:O,routes:rows,redirects})})
    const {publicReleaseDocument}=await import('../release-document')
    const doc=baseDoc()
    doc.targetPath=targetPath
    doc.children=[{tag:'div',attrs:{},children:HREFS.map(h=>({tag:'a',attrs:{href:h},children:['x']}))}]
    const out=publicReleaseDocument(doc as never) as unknown as {targetPath:string;children:Array<{children:Array<{attrs:{href?:string}}>}>;seo:{canonical:string[]}}
    rmSync(root,{recursive:true,force:true})
    return {out,doc}
  }
  it('every link on a page resolves exactly as the old scans did (public, held, redirected, duplicate rows, encoded and locale paths, malformed paths)',async()=>{
    const {out,doc}=await run(ROWS,REDIRECTS,'/a/')
    const got=out.children[0]!.children.map(a=>a.attrs.href)
    const want=HREFS.map(h=>legacyHref(h,doc.sourceUrl,ROWS,REDIRECTS))
    expect(got).toEqual(want)
    // the cases are not all the same answer: the table is not trivially passing
    expect(new Set(want.map(w=>w===undefined?'DELETED':w.startsWith('/')?'LOCAL':'KEPT')).size).toBe(3)
    expect(want).toContain('/a/?x=1#top')
    expect(want).toContain('/a/') // /old/ -> first redirect row -> /a/ (public), not the second /old/ row
  })
  it('the page\'s own row is the first row for its path, whatever its spelling', async()=>{
    for(const target of ['/a/','/พัด/','/%E0%B8%9E%E0%B8%B1%E0%B8%94/']){
      const {out}=await run(ROWS,REDIRECTS,target)
      const first=ROWS.find(c=>decodeURIComponent(c.path)===decodeURIComponent(target))!
      expect(out.targetPath,target).toBe(first.path)
      expect(out.seo.canonical[0],target).toBe(first.canonical)
    }
  })
  it('a ledger with an undecodable path falls back to the scans (same answers as the old code, including the swallowed error)',async()=>{
    const rows=[...ROWS,row('/%E0%A4%A/',{state:'REVIEW_HOLD'})]
    const {out,doc}=await run(rows,REDIRECTS,'/a/')
    const got=out.children[0]!.children.map(a=>a.attrs.href)
    const want=HREFS.map(h=>{try{return legacyHref(h,doc.sourceUrl,rows,REDIRECTS)}catch{return h}})
    expect(got).toEqual(want)
  })
})

describe('chrome links (linkRenderable): the table answers as the scan did',()=>{
  it('internal targets are kept unless the ledger holds the path and it is not PUBLIC; external, tel and fragment-less hrefs pass',async()=>{
    const rows=[row('/a/'),row('/a/',{state:'REVIEW_HOLD'}),row('/b/',{state:'REVIEW_HOLD'}),row('/พัด/'),row('/c/',{state:'WITHDRAWN'}),row('/q/',{state:'REVIEW_HOLD'})]
    const root=newRoot()
    promote(root,'g',{'ledger.json':JSON.stringify({origin:O,routes:rows,redirects:[]})})
    const {linkRenderable}=await import('../site-chrome-content')
    const legacy=(href:string)=>{
      if(!href.startsWith('/'))return true
      try{const target=decodeURIComponent(href.split(/[?#]/)[0]!);const r=rows.find(x=>decodeURIComponent(x.path)===target);return !r||r.state==='PUBLIC'}catch{return true}
    }
    const hrefs=['/a/','/b/','/c/','/q/?x=1','/q/#h','/พัด/','/%E0%B8%9E%E0%B8%B1%E0%B8%94/','/missing/','/','https://example.org/b/','tel:+6626617723','mailto:a@b.c','#x','/%zz/']
    for(const h of hrefs)expect(linkRenderable(h),h).toBe(legacy(h))
    expect(linkRenderable('/a/')).toBe(true) // first /a/ row is PUBLIC
    expect(linkRenderable('/b/')).toBe(false)
    expect(linkRenderable('/q/?x=1')).toBe(false)
    rmSync(root,{recursive:true,force:true})
  })
})

describe('the product card memo (salmonDocumentCard, payload mode)',()=>{
  const PRODUCTS=['SALMON-product-4869','SALMON-product-4865','SALMON-product-4872']
  const active=JSON.parse(readFileSync(path.join(APP,'content/salmon/active-routes.json'),'utf8')) as Array<{routeId:string;sourceUrl:string;targetPath:string;file:string;sha256:string}>
  const ledger=readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')
  const fixture=(name:string,root:string,ids=PRODUCTS,copy=true)=>{
    const rows=active.filter(r=>ids.includes(r.routeId))
    const files:Record<string,Buffer|string>={'ledger.json':ledger,'routes.salmon.json':JSON.stringify(rows)}
    if(copy)for(const r of rows)files[r.file]=readFileSync(path.join(APP,'content/salmon',r.file))
    promote(root,name,files)
    if(!copy){mkdirSync(path.join(root,'generations',name,'documents'),{recursive:true});for(const r of rows)symlinkSync(path.join(APP,'content/salmon',r.file),path.join(root,'generations',name,r.file))}
    return rows
  }
  it('the card carries the identity the quote gate and the mount read (route, source URL, path, title, source hash), not the body',async()=>{
    const root=newRoot()
    fixture('g1',root)
    const {salmonDocument,salmonDocumentCard,salmonRoutes}=await import('../salmon')
    for(const id of PRODUCTS){
      const route=salmonRoutes().find(r=>r.routeId===id)!
      const full=salmonDocument(route),card=salmonDocumentCard(route)
      for(const k of ['routeId','sourceUrl','targetPath','title','type'] as const)expect(card[k],`${id} ${k}`).toBe(full[k])
      expect(card.sourceIdentity).toEqual(full.sourceIdentity)
      expect(card.seo.h1).toEqual(full.seo.h1)
      expect(card.seo.canonical).toEqual(full.seo.canonical)
      expect(card.children).toEqual([])
      expect(card.text).toBe('')
    }
    rmSync(root,{recursive:true,force:true})
  })
  it('a second card read does not touch the file; each caller gets its own copy',async()=>{
    const root=newRoot()
    const rows=fixture('g1',root)
    const {salmonDocumentCard,salmonRoutes}=await import('../salmon')
    const route=salmonRoutes().find(r=>r.routeId===PRODUCTS[0])!
    const first=salmonDocumentCard(route)
    writeFileSync(path.join(root,'generations','g1',rows[0]!.file),'garbage') // a re-read would fail the identity check
    const second=salmonDocumentCard(route)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    second.seo.h1.length=0
    expect(salmonDocumentCard(route).seo.h1).toEqual(first.seo.h1)
    rmSync(root,{recursive:true,force:true})
  })
  it('a new generation (a publish) is read again: the cards are dropped with the old ledger',async()=>{
    const root=newRoot()
    const rows=fixture('g1',root)
    const mod=await import('../salmon')
    mod.salmonDocumentCard(mod.salmonRoutes().find(r=>r.routeId===PRODUCTS[0])!)
    expect(mod.salmonDocumentCardStats().cards).toBe(1)
    const files:Record<string,Buffer|string>={'ledger.json':ledger,'routes.salmon.json':JSON.stringify(rows),[rows[0]!.file]:'changed after publish'}
    for(const r of rows.slice(1))files[r.file]=readFileSync(path.join(APP,'content/salmon',r.file))
    promote(root,'g2',files)
    // g2's file for the first product no longer matches its source hash: a fresh read says so, a memo hit would have hidden it
    expect(()=>mod.salmonDocumentCard(mod.salmonRoutes().find(r=>r.routeId===PRODUCTS[0])!)).toThrow(/identity mismatch/)
    expect(mod.salmonDocumentCard(mod.salmonRoutes().find(r=>r.routeId===PRODUCTS[1])!).routeId).toBe(PRODUCTS[1])
    expect(mod.salmonDocumentCardStats().cards).toBe(1) // only g2's card; g1's is gone
    rmSync(root,{recursive:true,force:true})
  })
  it('is bounded (a count, and a card is a few hundred bytes), and the page being rendered is never served from it',async()=>{
    const root=newRoot()
    const ids=active.filter(r=>/^SALMON-product-/.test(r.routeId)).map(r=>r.routeId)
    fixture('g1',root,ids,false)
    const mod=await import('../salmon')
    for(const r of mod.salmonRoutes().filter(x=>ids.includes(x.routeId)))mod.salmonDocumentCard(r)
    const {cards}=mod.salmonDocumentCardStats()
    expect(cards).toBeGreaterThan(150)
    expect(cards).toBeLessThanOrEqual(mod.CARD_MAX_DOCS)
    expect(mod.CARD_MAX_DOCS).toBeLessThanOrEqual(600)
    rmSync(root,{recursive:true,force:true})
  },120000)
  it('repository mode (tests, static build) returns the full document and keeps nothing',async()=>{
    delete process.env.H2O_CONTENT_SOURCE
    const mod=await import('../salmon')
    const route=mod.salmonRoutes().find(r=>r.routeId===PRODUCTS[0])!
    const doc=mod.salmonDocumentCard(route)
    expect(doc.children.length).toBeGreaterThan(0)
    expect(mod.salmonDocumentCardStats().cards).toBe(0)
  })
})

describe('the home catalog memo (homePartCatalogData, payload mode)',()=>{
  it('equals a fresh build, is built once per ledger, hands out copies, and is rebuilt on a new generation',async()=>{
    const active=JSON.parse(readFileSync(path.join(APP,'content/salmon/active-routes.json'),'utf8')) as Array<{routeId:string;sourceUrl:string;targetPath:string;file:string;sha256:string}>
    const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Row[]}
    const root=newRoot()
    const paths=new Set<string>(['SALMON-pages-48'])
    const cats=['/product-category/cooling-tower-fan-stacks/','/product-category/drive-shafts-assemblies/','/product-category/fill-media/','/product-category/frp-members/','/product-category/fans/','/product-category/gearboxes/','/product-category/motors/','/product-category/nozzles/','/product-category/tower-hardware/']
    for(const r of ledger.routes)if(r.state==='PUBLIC'&&r.export&&(cats.some(c=>r.path===c||r.path.startsWith(`${c}page/`))))paths.add(r.routeId)
    const rows=active.filter(r=>paths.has(r.routeId)||/^SALMON-product-/.test(r.routeId))
    const gen=path.join(root,'generations','g1')
    promote(root,'g1',{'ledger.json':JSON.stringify(ledger),'routes.salmon.json':JSON.stringify(rows)})
    mkdirSync(path.join(gen,'documents'),{recursive:true})
    for(const r of rows)symlinkSync(path.join(APP,'content/salmon',r.file),path.join(gen,r.file))
    // a fresh build in its own module graph is the reference (what every request computed before the memo)
    const fresh=(await import('../HomePartsData')).homePartCatalogData()
    expect(fresh.records.length).toBeGreaterThan(180)
    vi.resetModules()
    const mod=await import('../HomePartsData')
    const first=mod.homePartCatalogData()
    expect(JSON.stringify(first)).toBe(JSON.stringify(fresh))
    // the second call must not read a document: break every product file, it still answers
    const broken=rows.find(r=>r.routeId===fresh.records.at(-1)!.sourceId)!
    rmSync(path.join(gen,broken.file));writeFileSync(path.join(gen,broken.file),'garbage')
    const second=mod.homePartCatalogData()
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(second).not.toBe(first)
    second.records.length=0
    expect(mod.homePartCatalogData().records).toHaveLength(first.records.length)
    // a publish (new generation) is a new ledger object: the catalog is rebuilt, and now sees the broken file
    const files:Record<string,string>={'ledger.json':JSON.stringify(ledger),'routes.salmon.json':JSON.stringify(rows)}
    promote(root,'g2',files)
    const gen2=path.join(root,'generations','g2')
    for(const r of rows){mkdirSync(path.dirname(path.join(gen2,r.file)),{recursive:true});symlinkSync(path.join(gen,r.file),path.join(gen2,r.file))}
    expect(()=>mod.homePartCatalogData()).toThrow()
    rmSync(root,{recursive:true,force:true})
  },240000)
})
describe('the parts hub records (productIndexRecords, payload mode)',()=>{
  const active=JSON.parse(readFileSync(path.join(APP,'content/salmon/active-routes.json'),'utf8')) as Array<{routeId:string;sourceUrl:string;targetPath:string;file:string;sha256:string}>
  const ledger=readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')
  const products=active.filter(r=>/^SALMON-product-\d+$/.test(r.routeId))
  const snapshot=(root:string,name:string,broken?:string)=>{
    const files:Record<string,string>={'ledger.json':ledger,'routes.salmon.json':JSON.stringify(products)}
    promote(root,name,files)
    mkdirSync(path.join(root,'generations',name,'documents'),{recursive:true})
    for(const r of products){
      const target=path.join(root,'generations',name,r.file)
      if(r.routeId===broken)writeFileSync(target,'changed after publish')
      else symlinkSync(path.join(APP,'content/salmon',r.file),target)
    }
  }
  it('a slim record reads exactly what the full document reads for everything the hub renders: name, short description, first image, identity',async()=>{
    const root=newRoot()
    snapshot(root,'g1')
    const {productIndexRecords,productSummary,productPrimaryMedia,activeProductRoutes}=await import('../Wave3Products')
    const {nameFor}=await import('../Wave3Presentation')
    const {salmonDocument}=await import('../salmon')
    const records=productIndexRecords()
    expect(records.map(r=>r.route.routeId)).toEqual(activeProductRoutes().map(r=>r.routeId))
    expect(records.length).toBeGreaterThan(150)
    for(const {route,doc} of records){
      const full=salmonDocument(route)
      expect(nameFor(doc),route.routeId).toBe(nameFor(full))
      expect(productSummary(doc),route.routeId).toEqual(productSummary(full))
      expect(productPrimaryMedia(doc),route.routeId).toEqual(productPrimaryMedia(full))
      for(const k of ['routeId','sourceUrl','targetPath','title','type'] as const)expect(doc[k]).toBe(full[k])
      expect(doc.sourceIdentity).toEqual(full.sourceIdentity)
      expect(doc.children.length).toBeLessThanOrEqual(1) // the short description at most, never the body
    }
    rmSync(root,{recursive:true,force:true})
  },240000)
  it('is built once per ledger, hands out copies, and is rebuilt on a new generation',async()=>{
    const root=newRoot()
    snapshot(root,'g1')
    const mod=await import('../Wave3Products')
    const first=mod.productIndexRecords()
    // break one product file: a second call must not read it, a copy mutation must not leak
    const victim=products[5]!
    breakFile(path.join(root,'generations','g1',victim.file))
    const second=mod.productIndexRecords()
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(second).not.toBe(first)
    second.length=0
    expect(mod.productIndexRecords()).toHaveLength(first.length)
    // a publish is a new ledger object: rebuilt, and the broken file is now noticed
    snapshot(root,'g2',victim.routeId)
    expect(()=>mod.productIndexRecords()).toThrow(/identity mismatch|JSON/)
    rmSync(root,{recursive:true,force:true})
  },240000)
  it('repository mode returns the full documents, as before',async()=>{
    delete process.env.H2O_CONTENT_SOURCE
    const {productIndexRecords}=await import('../Wave3Products')
    const [first]=productIndexRecords()
    expect(first!.doc.children.length).toBeGreaterThan(1)
  })
})

describe('the article directory (Wave4ArticleIndex, payload mode)',()=>{
  const active=JSON.parse(readFileSync(path.join(APP,'content/salmon/active-routes.json'),'utf8')) as Array<{routeId:string;sourceUrl:string;targetPath:string;file:string;sha256:string}>
  const live=[...JSON.parse(readFileSync(path.join(APP,'content/salmon/r2-live-routes.json'),'utf8')),...JSON.parse(readFileSync(path.join(APP,'content/salmon/r3-locale-routes.json'),'utf8'))] as typeof active
  const ledger=readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')
  const wanted=(r:{routeId:string})=>/^(?:SALMON|LIVE)-posts-/.test(r.routeId)||r.routeId==='SALMON-pages-1875'
  const snapshot=(root:string,name:string,broken=false)=>{
    const salmon=active.filter(wanted),lv=live.filter(wanted)
    promote(root,name,{'ledger.json':ledger,'routes.salmon.json':JSON.stringify(salmon),'routes.live.json':JSON.stringify(lv)})
    mkdirSync(path.join(root,'generations',name,'documents'),{recursive:true})
    for(const r of [...salmon,...lv]){
      const target=path.join(root,'generations',name,r.file)
      if(broken&&/-posts-/.test(r.routeId))writeFileSync(target,'changed after publish')
      else symlinkSync(path.join(APP,'content/salmon',r.file),target)
    }
    return salmon
  }
  const render=async()=>{
    const {renderToStaticMarkup}=await import('react-dom/server')
    const {Wave4ArticleIndex}=await import('../Wave4Presentation')
    const {salmonDocument,salmonRoutes}=await import('../salmon')
    const doc=salmonDocument(salmonRoutes().find(r=>r.routeId==='SALMON-pages-1875')!)
    return renderToStaticMarkup(Wave4ArticleIndex({doc}))
  }
  it('the index is built once per ledger (the directory is not re-read per request), identical to a fresh build, and rebuilt on a new generation',async()=>{
    const root=newRoot()
    const salmon=snapshot(root,'g1')
    const first=await render()
    expect(first).toContain('wave4-article-grid')
    expect((first.match(/<li\b/g)??[]).length).toBeGreaterThan(100)
    // every article file is now unreadable: a re-read of the directory would fail the identity check
    for(const r of salmon.filter(x=>/-posts-/.test(x.routeId)))breakFile(path.join(root,'generations','g1',r.file))
    expect(await render()).toBe(first)
    // a fresh module graph (what every request built before the memo) gives the same page
    vi.resetModules()
    const root2=newRoot()
    snapshot(root2,'g1')
    expect(await render()).toBe(first)
    // a publish (new generation) is read again and the changed article is noticed
    vi.resetModules()
    const root3=newRoot()
    snapshot(root3,'g1')
    const mod=await import('../Wave4Presentation')
    void mod
    expect(await render()).toBe(first)
    snapshot(root3,'g2',true)
    await expect(render()).rejects.toThrow()
    for(const r of [root,root2,root3])rmSync(r,{recursive:true,force:true})
  },240000)
})
void copyFileSync
