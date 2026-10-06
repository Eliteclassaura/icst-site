/**
 * SEO parity follow-up R1, Part 2 (Control Tower brief 2026-10-04; live vs staging parity audit): no canonical resolves to a
 * redirect, one BreadcrumbList per page from the rendered trail, held alt text, the mojibake repair, and the production
 * robots policy in both the response header and the page metadata.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {mkdirSync,mkdtempSync,readFileSync,renameSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {NextRequest} from 'next/server'
import Page,{generateMetadata} from '../../app/(site)/[[...slug]]/page'
import {repairMojibake} from '../text-repair'
import {breadcrumbList} from '../breadcrumb-schema'
import {heldImageAlt} from '../salmon'
import {publicRobots} from '../../content/config'
import {EMPTY_ARCHIVE_PATHS} from '../../content/empty-archives'

const APP=process.cwd()
type Row={path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean;searchable:boolean;canonical:string;redirect:string|null}
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {origin:string;routes:Row[];redirects:Array<{source:string;destination:string;status:number}>}
const overrides=JSON.parse(readFileSync(path.join(APP,'content/release/seo-pass-r1.json'),'utf8')) as {redirectSources:Record<string,string>}
const decode=(v:string)=>{try{return decodeURIComponent(v)}catch{return v}}
const batchRedirects=readFileSync(path.join(APP,'ops/seo-pass/data/redirects.tsv'),'utf8').trimEnd().split('\n').slice(1).map(line=>line.split('\t')[0]!)
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const breadcrumbs=(html:string)=>[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]!) as Record<string,unknown>).flatMap(node=>[node,...((node['@graph'] as Record<string,unknown>[]|undefined)??[])]).filter(node=>node['@type']==='BreadcrumbList') as Array<{'@id':string;itemListElement:Array<{position:number;name:string;item:string}>}>
const mainOf=(html:string)=>html.slice(html.indexOf('<main'),html.lastIndexOf('</main>'))

describe('canonicals never resolve to a redirect',()=>{
  const redirectSources=new Set([...ledger.redirects.map(r=>decode(r.source)),...Object.keys(overrides.redirectSources).map(decode),...batchRedirects.map(decode)])
  const publicPaths=new Set(ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export).map(row=>decode(row.path)))
  it('every indexable route is canonical to a public route on the production origin, never to a redirect source',()=>{
    for(const row of ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&r.indexable)){
      const url=new URL(row.canonical)
      expect(url.origin,row.path).toBe('https://h2ocooling.com')
      expect(redirectSources.has(decode(url.pathname)),`${row.path} -> ${row.canonical}`).toBe(false)
      expect(publicPaths.has(decode(url.pathname)),`${row.path} -> ${row.canonical}`).toBe(true)
    }
  })
  it('a public row that is itself a redirect source is never indexable, in the sitemap or in search (R2 shop remnants only)',()=>{
    const redirected=ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&redirectSources.has(decode(row.path)))
    expect(redirected.map(row=>row.path).sort()).toEqual(['/cart/','/checkout/','/contact/','/my-account/','/my-account/lost-password/'])
    for(const row of redirected)expect(row,row.path).toMatchObject({indexable:false,sitemap:false,searchable:false})
  })
  it('the three audited canonical/redirect loops are self-canonical in the ledger and the rendered metadata',async()=>{
    for(const p of ['/cooling-tower-fill-media-replacement/','/cooling-tower-maintenance-and-repair/','/cooling-tower-manufacturer-selection/']){
      expect(ledger.routes.find(row=>row.path===p)?.canonical,p).toBe(`https://h2ocooling.com${p}`)
      const meta=await generateMetadata({params:Promise.resolve({slug:p.split('/').filter(Boolean)})})
      expect(meta.alternates?.canonical,p).toBe(`https://h2ocooling.com${p}`)
    }
  })
})

describe('OGCS Part 1 (R1.2) delta in the batch',()=>{
  const data=(file:string)=>{const [head,...lines]=readFileSync(path.join(APP,'ops/seo-pass/data',file),'utf8').trimEnd().split('\n');const cols=head!.split('\t');return lines.map(line=>Object.fromEntries(line.split('\t').map((v,i)=>[cols[i]!,v])))}
  it('un-consolidates the false chiller duplicate and restores the Legionella article at its own URL (no fallback, 0 chains)',()=>{
    const row=(p:string)=>ledger.routes.find(r=>r.path===p)!
    expect(row('/cooling-tower-vs-chiller/')).toMatchObject({state:'PUBLIC',export:true,redirect:null})
    expect(row('/chiller-and-cooling-tower/')).toMatchObject({state:'PUBLIC',export:true,redirect:null})
    // Retired by Part 2 R3 (active:false) and not again. Locale Part B retired the 98 R1 locale→English redirects of preserved
    // locale pages; R2.2 is a delta on the Locale B batch, so it retires nothing and none of those sources is a redirect again.
    expect(data('redirects-retired.tsv').some(r=>r.source==='/cooling-tower-vs-chiller/')).toBe(false)
    expect(data('redirects-retired.tsv')).toHaveLength(0)
    // R2.4 creates one: /new-cooling-tower-page/ → /new-cooling-towers/ (CT ruling 2026-10-05).
    expect(data('redirects.tsv').filter(r=>r.action!=='UNCHANGED').map(r=>[r.source,r.action])).toEqual([['/new-cooling-tower-page/','CREATE']])
    const redirects=data('redirects.tsv')
    expect(redirects.some(r=>r.source==='/cooling-tower-vs-chiller/')).toBe(false)
    // Locale Part B: the locale and blog variants now go one hop to their preserved locale pages (and the locale URLs serve
    // 200); only the English blog alias still points here.
    expect(redirects.filter(r=>r.destination==='/chiller-and-cooling-tower/').map(r=>r.source)).toEqual(['/blog/chiller-and-cooling-tower/'])
    const seo=new Map(data('seo-fields.tsv').map(r=>[r.path,r]))
    expect(seo.get('/cooling-tower-vs-chiller/')?.title).toBe('Cooling Tower vs. Chiller: The 2026 Guide - ICS')
    expect(seo.get('/chiller-and-cooling-tower/')?.title).toBe('How to Prevent Legionella in Chiller and Cooling Tower?')
    expect(seo.get('/chiller-and-cooling-tower/')?.meta).toMatch(/^Discover how to control legionella in chillers and cooling towers/)
  })
  it('completes every truncated meta as a sentence and carries no unsupported standards claim (CT ruling 2026-10-05)',()=>{
    const seo=data('seo-fields.tsv')
    for(const r of seo){expect(r.meta,r.path).not.toMatch(/…$|\.\.\.$/);expect(r.meta.length,r.path).toBeGreaterThanOrEqual(70);expect(r.meta.length,r.path).toBeLessThanOrEqual(158)}
    expect(seo.filter(r=>r.meta_origin.includes('CT_COMPLETE_SENTENCE'))).toHaveLength(22)
    expect(new Set(seo.map(r=>r.meta.toLowerCase())).size).toBe(seo.length)
    expect(JSON.stringify(seo)).not.toMatch(/Japan Cooling Tower Institute/)
  })
  it('applies the R1.2 titles (Formula, Amarillo Gearbox, fan suffix) and writes the decided H1s to their heading slots',()=>{
    const seo=new Map(data('seo-fields.tsv').map(r=>[r.path,r.title]))
    expect(seo.get('/cooling-tower-efficiency-calculation/')).toBe('Cooling Tower Efficiency Calculation: Formula & Steps')
    expect(seo.get('/cooling-tower-blowdown-calculation/')).toBe('Cooling Tower Blowdown Calculation: Formula & Guide')
    expect(seo.get('/product-category/gearboxes/')).toBe('Amarillo Gearbox Replacement | Cooling Tower Gearbox Parts')
    expect(seo.get('/product/tuf-lite-iii-5000k-series-hub-fan-assemblies/')).toBe('TUF-LITE III 5000K Series Hub Fan Assemblies | Cooling Tower Fans')
    expect(data('h1-fields.tsv').map(r=>[r.path,r.via,r.h1]).slice(0,3)).toEqual([['/cooling-tower/','slot','New Cooling Tower Engineering & Construction'],['/product-category/gearboxes/','slot','Amarillo Cooling Tower Gearboxes'],['/product-category/drive-shafts-assemblies/','slot','Cooling Tower Couplings & Drive Shafts']])
    // Restored live bodies bring their live H1 (the record title article templates render); Round 5 adds the CT-ruled heading
    // of /cooling-tower-repair-service/ (claims-seo field h1).
    expect(data('h1-fields.tsv').filter(r=>r.via==='title').map(r=>r.path).sort()).toEqual(['/chiller-and-cooling-tower/','/cooling-tower-approach/','/cooling-tower-fill-media-replacement/','/cooling-tower-inspection-guide/','/cooling-tower-ph-control/','/cooling-tower-repair-service/'])
    // Round 5 wrote it; R2.4 is a delta on Round 5, so it is in place (UNCHANGED).
    expect(data('h1-fields.tsv').find(r=>r.path==='/cooling-tower-repair-service/')).toMatchObject({via:'title',action:'UNCHANGED',h1:'Industrial Cooling Tower Repair Service'})
  })
  it('lists every live project card on /all-projects/',async()=>{
    const html=mainOf(await render('/all-projects/'))
    for(const slug of ['vinachem','empire-farms','pvc-plant-freeport-texas','kbr','lanxess','patuha','thailand-projects','pttcsp','ptt-csp3','cooling-tower-replacement','cawayan-bacman-3','palinpinon-3','bacman-1-2','palinpinon-2','edc-n2n-relocation-project','edc','cooling-tower-disaster-recovery','mak-ban-6','pertonas-rapid'])expect(html,slug).toContain(`href="/all-projects/${slug}/"`)
  },60000)
})

describe('BreadcrumbList structured data',()=>{
  const trail=(list:{itemListElement:Array<{name:string;item:string}>})=>list.itemListElement.map(item=>[item.name,new URL(item.item).pathname])
  it('articles, products, archives and live pages carry exactly one, built from the trail they render',async()=>{
    const article=breadcrumbs(await render('/cooling-tower-efficiency-calculation/'))
    expect(article).toHaveLength(1)
    expect(trail(article[0]!).slice(0,2)).toEqual([['Home','/'],['Tech Articles','/tech-articles/']])
    expect(trail(article[0]!).at(-1)?.[1]).toBe('/cooling-tower-efficiency-calculation/')
    expect(article[0]!['@id']).toBe('https://h2ocooling.com/cooling-tower-efficiency-calculation/#breadcrumb')
    const product=breadcrumbs(await render('/product/tuf-lite-ii-5000h-series-hub-fan-assemblies/'))
    expect(product).toHaveLength(1)
    expect(trail(product[0]!)).toEqual([['Home','/'],['Cooling Tower Parts','/cooling-tower-parts-online/'],['TUF-LITE II – 5000H Series Hub Fan Assemblies','/product/tuf-lite-ii-5000h-series-hub-fan-assemblies/']])
    const archive=breadcrumbs(await render('/product-category/gearboxes/'))
    expect(archive).toHaveLength(1)
    expect(trail(archive[0]!)[0]).toEqual(['Home','/'])
    expect(trail(archive[0]!).at(-1)?.[1]).toBe('/product-category/gearboxes/')
    for(const p of ['/thermal-upgrade/','/cooling-tower-japan/','/tech-articles/'])expect(breadcrumbs(await render(p)),p).toHaveLength(1)
  },60000)
  it('the home page carries none, and positions and items are absolute and sequential',async()=>{
    expect(breadcrumbs(await render('/'))).toHaveLength(0)
    const list=breadcrumbList([{name:'Home',path:'/'},{name:'Home again',path:'/'}],{name:'Page',path:'/p/'})
    expect(list.itemListElement).toEqual([{'@type':'ListItem',position:1,name:'Home',item:'https://h2ocooling.com/'},{'@type':'ListItem',position:2,name:'Page',item:'https://h2ocooling.com/p/'}])
  },60000)
})

describe('image alt text',()=>{
  it('an empty alt takes the alt h2ocooling.com serves today for the same upload, whatever its size suffix',()=>{
    const live=JSON.parse(readFileSync(path.join(APP,'content/salmon/live-image-alt.json'),'utf8')) as {alt:Record<string,string>}
    const [key,alt]=Object.entries(live.alt)[0]!
    expect(heldImageAlt(`https://h2ocooling.com/wp-content/uploads/${key.replace(/(\.[a-z0-9]+)$/i,'-300x200$1')}`)).toBe(alt)
    expect(heldImageAlt('https://h2ocooling.com/wp-content/uploads/1999/01/not-held.jpg')).toBeUndefined()
  })
  it('archive cards name their article; listings keep decorative flags empty; a primary article image is never empty',async()=>{
    const archive=mainOf(await render('/category/blog/page/9/'))
    const cards=[...archive.matchAll(/<img\b[^>]*>/g)].map(m=>m[0])
    expect(cards.length).toBeGreaterThan(0)
    for(const img of cards)expect(img).not.toMatch(/ alt=""/)
    const projects=mainOf(await render('/all-projects/'))
    expect(projects).toMatch(/<img\b[^>]*alt=""[^>]*width="22" height="15"/)
    for(const p of ['/closed-loop-vs-open-loop/','/cooling-tower-chemical-safety/']){
      const first=mainOf(await render(p)).match(/<article class="wave4-detail-body">[\s\S]*?(<img\b[^>]*>)/)?.[1]
      if(first)expect(first,p).not.toMatch(/ alt=""/)
    }
  },60000)
})

describe('mojibake repair',()=>{
  it('restores UTF-8 that was mis-decoded as Latin-1 and leaves real accented text alone',()=>{
    expect(repairMojibake('the systemâ\u0080\u0099s fill')).toBe('the system’s fill')
    expect(repairMojibake('40Â°C â\u0080\u0094 range')).toBe('40°C — range')
    for(const text of ['café','Đây là cách','naïve résumé','plain'])expect(repairMojibake(text)).toBe(text)
  })
  it('no audited article renders mis-decoded text any more',async()=>{
    const MOJI=/[Â-ß][\u0080-¿]|[à-ï][\u0080-¿]{2}/g
    for(const p of ['/closed-loop-vs-open-loop/','/choosing-cooling-tower-fill-media/','/cooling-tower-fan-stack-design/','/cooling-tower-structural-loads/','/category/blog/page/18/']){
      const text=(await render(p)).replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ')
      const runs=(text.match(MOJI)??[]).filter(run=>{try{new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(run,c=>c.charCodeAt(0)));return true}catch{return false}})
      expect(runs,p).toEqual([])
    }
  },60000)
})

describe('production robots: header and page metadata',()=>{
  const snapshot=(routes:Row[])=>{
    const root=mkdtempSync(path.join(tmpdir(),'h2o-robots-'))
    mkdirSync(path.join(root,'generations','g'),{recursive:true})
    writeFileSync(path.join(root,'generations','g','ledger.json'),JSON.stringify({routes,redirects:[]}))
    mkdirSync(path.join(root,'releases'),{recursive:true})
    writeFileSync(path.join(root,'releases','r-g.json'),JSON.stringify({format:1,id:'r-g',content:'g',search:'s-g'}))
    symlinkSync('releases/r-g.json',path.join(root,'release.tmp'));renameSync(path.join(root,'release.tmp'),path.join(root,'release'))
    process.env.H2O_CONTENT_SOURCE='payload';process.env.CONTENT_SNAPSHOT_DIR=root
  }
  const record=(row:Row)=>({path:row.path,disposition:{state:row.state,indexable:row.indexable}})
  // The catch-all's metadata takes its robots from page-bridge robotsFor, which is publicRobots.
  const robotsFor=(r:ReturnType<typeof record>,preview:boolean)=>publicRobots(r,preview)
  const indexable=ledger.routes.find(row=>row.path==='/cooling-tower-efficiency-calculation/')!
  const empty=ledger.routes.find(row=>row.path===EMPTY_ARCHIVE_PATHS[0])!
  it('under H2O_INDEXING_POLICY=production an indexable page has neither a noindex header nor a noindex meta; empty archives are noindex,follow',async()=>{
    expect(indexable.indexable).toBe(true)
    snapshot([indexable,empty]);process.env.H2O_INDEXING_POLICY='production'
    const {proxy}=await import('../../proxy')
    expect(proxy(new NextRequest(`https://h2ocooling.com${indexable.path}`)).headers.get('x-robots-tag')).toBeNull()
    expect(robotsFor(record(indexable),false)).toEqual({index:true,follow:true})
    expect(proxy(new NextRequest(`https://h2ocooling.com${empty.path}`)).headers.get('x-robots-tag')).toBe('noindex, follow')
    expect(robotsFor(record(empty),false)).toEqual({index:false,follow:true})
  })
  it('staging (private policy) and previews stay noindex,nofollow in both places',async()=>{
    snapshot([indexable]);process.env.H2O_INDEXING_POLICY='private'
    const {proxy}=await import('../../proxy')
    expect(proxy(new NextRequest(`https://h2ocooling.com${indexable.path}`)).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(robotsFor(record(indexable),false)).toEqual({index:false,follow:false})
    process.env.H2O_INDEXING_POLICY='production'
    expect(robotsFor(record(indexable),true)).toEqual({index:false,follow:false})
  })
})
