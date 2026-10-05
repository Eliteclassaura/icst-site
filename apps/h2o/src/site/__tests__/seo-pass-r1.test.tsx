/**
 * Master SEO Pass R1 (Control Tower brief 2026-10-04; OGCS decisions + R1.1 metas). The release authority, the index rules,
 * the 410s, one public description per page, and the batch data that Commander's scripted Payload run applies.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {NextRequest} from 'next/server'
import {releaseAuthority} from '../../../release/authority.mjs'
import {generateMetadata} from '../../app/(site)/[[...slug]]/page'
import {SalmonSeo,publicDescription} from '../SalmonCanonical'
import {composePublicDocument,type RouteRecord} from '../../content/compose'
import {EMPTY_ARCHIVE_PATHS} from '../../content/empty-archives'
import {GONE_PATHS} from '../../content/config'
import {publicReleaseRoutes,salmonDocument,salmonRoutes} from '../salmon'

const APP=process.cwd()
const DATA=path.join(APP,'ops/seo-pass/data')
type Row={path:string;routeId:string;state:string;export:boolean;indexable:boolean;sitemap:boolean;searchable:boolean;canonical:string;redirect:string|null}
const overrides=JSON.parse(readFileSync(path.join(APP,'content/release/seo-pass-r1.json'),'utf8')) as {publish:string[];canonical:Record<string,string>;index:string[];redirectSources:Record<string,string>}
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Row[]}
const byPath=new Map(ledger.routes.map(row=>[row.path,row]))
function tsv(file:string):Array<Record<string,string>>{
  const [head,...lines]=readFileSync(path.join(DATA,file),'utf8').trimEnd().split('\n')
  const cols=head!.split('\t')
  return lines.map(line=>Object.fromEntries(line.split('\t').map((v,i)=>[cols[i]!,v])))
}
const decode=(v:string)=>{try{return decodeURIComponent(v)}catch{return v}}
const env={...process.env}
afterEach(()=>{process.env={...env}})

describe('release authority and route ledger',()=>{
  const authority=releaseAuthority(APP) as {routes:Row[]}
  const auth=new Map(authority.routes.map(row=>[row.path,row]))
  it('publishes exactly the three held articles that passed the content check; the four that failed stay held',()=>{
    expect(overrides.publish).toEqual(['/closed-loop-vs-open-loop/','/understanding-cooling-tower-parts/','/choosing-cooling-tower-fill-media/'])
    for(const p of overrides.publish)expect(auth.get(p),p).toMatchObject({state:'PUBLIC',export:true,indexable:true,sitemap:true})
    for(const p of ['/cooling-tower-algae-prevention/','/cooling-tower-spray-nozzles/','/frp-cooling-tower-advantages/','/cooling-tower-fan-balancing/'])expect(auth.get(p),p).toMatchObject({state:'REVIEW_HOLD',export:false})
  })
  it('self canonicals make the four cross-canonical articles indexable; five ranking archives become indexable',()=>{
    expect(Object.keys(overrides.canonical)).toHaveLength(4)
    for(const [p,canonical] of Object.entries(overrides.canonical))expect(auth.get(p),p).toMatchObject({canonical,indexable:true,sitemap:true})
    expect(overrides.index).toHaveLength(5)
    for(const p of overrides.index){expect(auth.get(p),p).toMatchObject({state:'PUBLIC',indexable:true,sitemap:true});expect(EMPTY_ARCHIVE_PATHS,p).not.toContain(p)}
  })
  it('the 17 consolidated pages become REDIRECT rows pointing at a PUBLIC route; the two designed pages held for a ruling are untouched',()=>{
    expect(Object.keys(overrides.redirectSources)).toHaveLength(17)
    for(const [p,target] of Object.entries(overrides.redirectSources)){
      expect(auth.get(p),p).toMatchObject({state:'REDIRECT',export:false,indexable:false,sitemap:false,searchable:false,redirect:target})
      expect(auth.get(target)?.state,target).toBe('PUBLIC')
    }
    for(const p of ['/thermal-upgrade/','/cooling-tower-japan/'])expect(auth.get(p),p).toMatchObject({state:'PUBLIC',export:true})
  })
  it('the committed ledger carries the authority rows for every SEO pass path',()=>{
    for(const p of [...overrides.publish,...Object.keys(overrides.canonical),...overrides.index,...Object.keys(overrides.redirectSources)])expect(byPath.get(p),p).toEqual(auth.get(p))
  })
})

describe('index rules, 410 and sitemap under the production policy',()=>{
  const snapshot=(routes:Row[],redirects:Array<{source:string;destination:string;status:number}>=[])=>{
    const root=mkdtempSync(path.join(tmpdir(),'h2o-seo-'))
    mkdirSync(path.join(root,'generations','g'),{recursive:true})
    writeFileSync(path.join(root,'generations','g','ledger.json'),JSON.stringify({routes,redirects}))
    mkdirSync(path.join(root,'releases'),{recursive:true})
    writeFileSync(path.join(root,'releases','r-g.json'),JSON.stringify({format:1,id:'r-g',content:'g',search:'s-g'}))
    symlinkSync('releases/r-g.json',path.join(root,'release.tmp'));renameSync(path.join(root,'release.tmp'),path.join(root,'release'))
    process.env.H2O_CONTENT_SOURCE='payload';process.env.CONTENT_SNAPSHOT_DIR=root;process.env.H2O_INDEXING_POLICY='production'
  }
  it('the seven ranking pages that list public items are indexable and in the sitemap; truly empty archives stay noindex,follow',async()=>{
    const ranking=[...overrides.index,'/cooling-tower-fill-media-replacement/','/cooling-tower-maintenance-and-repair/']
    const empty=EMPTY_ARCHIVE_PATHS.slice(0,5)
    snapshot(ledger.routes.filter(row=>ranking.includes(row.path)||empty.includes(row.path)))
    const {proxy,sitemapResponse}=await import('../../proxy')
    const sitemap=await sitemapResponse().text()
    for(const p of ranking){expect(proxy(new NextRequest(`https://h2ocooling.com${p}`)).headers.get('x-robots-tag'),p).toBeNull();expect(sitemap,p).toContain(`<loc>https://h2ocooling.com${p}</loc>`)}
    for(const p of empty){expect(proxy(new NextRequest(`https://h2ocooling.com${p}`)).headers.get('x-robots-tag'),p).toBe('noindex, follow');expect(sitemap,p).not.toContain(`${p}<`)}
  })
  it('answers 410 Gone for the two retired WordPress system URLs, query included',async()=>{
    snapshot([])
    const {proxy}=await import('../../proxy')
    expect([...GONE_PATHS]).toEqual(['/canvas/list/','/wp/wp-admin/edit.php'])
    for(const url of ['/canvas/list/','/wp/wp-admin/edit.php?post_type=product']){const res=proxy(new NextRequest(`https://h2ocooling.com${url}`));expect(res.status,url).toBe(410);expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')}
    expect(tsv('gone.tsv').map(row=>row.path)).toEqual(['/canvas/list/','/wp/wp-admin/edit.php'])
  })
})

describe('one public description per page',()=>{
  const product=salmonDocument(salmonRoutes().find(route=>route.targetPath==='/product/howden-pro-d-series-26-36-7-93m-10-98m-fans/')!)
  it('page metadata carries the quote-only description and SalmonSeo no longer renders a second one',async()=>{
    expect(product.seo.meta.find(meta=>meta.name==='description')?.value).toMatch(/^Buy /)
    expect(publicDescription(product)).toMatch(/^Request a quote for the Howden PRO D Series/)
    const meta=await generateMetadata({params:Promise.resolve({slug:['product','howden-pro-d-series-26-36-7-93m-10-98m-fans']})})
    expect(meta.description).toBe(publicDescription(product))
    const html=renderToStaticMarkup(<SalmonSeo doc={product}/>)
    expect(html).not.toMatch(/name="description"/)
    expect(html).toMatch(/property="og:description" content="Request a quote for/)
  })
  it('an edited SEO title and description also update the social tags the source carries',()=>{
    const document=JSON.parse(readFileSync(path.join(APP,'content/salmon',salmonRoutes().find(route=>route.targetPath==='/cooling-tower-efficiency-calculation/')!.file),'utf8')) as Record<string,unknown>
    const record={routeId:String(document.routeId),path:'/cooling-tower-efficiency-calculation/',family:'salmon',title:String(document.title),seo:{title:'T',description:'D'},document} as RouteRecord
    const out=composePublicDocument(record) as {seo:{title:string;meta:Array<{name:string;value:string}>}}
    const value=(name:string)=>out.seo.meta.find(meta=>meta.name===name)?.value
    expect(out.seo.title).toBe('T')
    expect([value('description'),value('og:title'),value('og:description')]).toEqual(['D','T','D'])
  })
})

describe('published held articles',()=>{
  it('render with one H1, the linked Tim Bozic byline and the decided title pattern, without the dummy author',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const {default:Page}=await import('../../app/(site)/[[...slug]]/page')
    for(const p of overrides.publish){
      const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
      expect(html.match(/<h1\b/g),p).toHaveLength(1)
      expect(html,p).toContain('<p class="wave4-byline"><span>By <a href="/author/timbozic/">Tim Bozic</a></span>')
      expect(html,p).not.toMatch(/faizasyed|ICS Editorial Team/)
    }
  },60000)
})

describe('listings leave consolidated routes',()=>{
  it('public release routes exclude every REDIRECT and held row',()=>{
    const listed=new Set(publicReleaseRoutes().map(route=>route.targetPath))
    for(const p of Object.keys(overrides.redirectSources))expect(listed.has(p),p).toBe(false)
    for(const p of overrides.publish)expect(listed.has(p),p).toBe(true)
  })
})

describe('batch data (ops/seo-pass/data) meets the brief',()=>{
  const seo=tsv('seo-fields.tsv'),redirects=tsv('redirects.tsv'),conformance=tsv('conformance.tsv'),dispositions=tsv('route-dispositions.tsv')
  const expectations=JSON.parse(readFileSync(path.join(DATA,'expectations.json'),'utf8')) as {rows:number;redirects:number;seoFields:number;expect:Record<string,Record<string,number>>;problems:string[]}
  const FORBIDDEN=/\b(buy|shop|shopping|price[sd]?|pricing|cheap|for sale|order now|add to cart|purchase)\b|\$|@|\+?\d[\d\s().-]{8,}\d/i
  it('titles: at most 69 characters, unique, no price/contact/commerce words',()=>{
    expect(seo).toHaveLength(468)
    const titles=seo.map(row=>row.title!)
    expect(new Set(titles).size).toBe(titles.length)
    for(const t of titles){expect(t.length,t).toBeLessThanOrEqual(69);expect(t,t).not.toMatch(FORBIDDEN)}
  })
  it('metas written: 70-158 characters, unique, quote-only; pending OGCS metas are not written',()=>{
    const written=seo.filter(row=>!row.meta_origin!.includes('PENDING_OGCS'))
    expect(seo.length-written.length).toBe(27)
    expect(new Set(written.map(row=>row.meta)).size).toBe(written.length)
    for(const row of written){expect(row.meta!.length,row.path).toBeGreaterThanOrEqual(70);expect(row.meta!.length,row.path).toBeLessThanOrEqual(158);expect(row.meta,row.path).not.toMatch(FORBIDDEN)}
    expect(seo.find(row=>row.path==='/category/blog/')?.meta).toBe('Cooling tower articles from ICS on replacement planning, free cooling, water management plans, noise limits, retrofits and lifecycle asset management.')
    expect(seo.find(row=>row.path==='/category/cooling-tower-cost/')?.meta).toBe('ICS articles on cooling tower cost: replacement budgeting, ROI and hidden expenses, plus risk management strategies for commercial cooling towers.')
    expect(EMPTY_ARCHIVE_PATHS).toContain('/category/cooling-tower-cost/')
  })
  it('redirects: unique sources, single hop to a 200 target, no loops or self-redirects; author rows dropped',()=>{
    expect(redirects).toHaveLength(473)
    const sources=new Set(redirects.map(row=>decode(row.source!)))
    expect(sources.size).toBe(redirects.length)
    const served=new Set([...conformance.filter(row=>row.expect==='200').map(row=>decode(row.url!)),...ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export).map(row=>decode(row.path))])
    for(const row of redirects){
      const target=decode(row.destination!)
      expect(row.status).toBe('301')
      expect(sources.has(target),`chain ${row.source}`).toBe(false)
      expect(target).not.toBe(decode(row.source!))
      expect(served.has(target)||existsSync(path.join(APP,'public',target)),`${row.source} -> ${target}`).toBe(true)
      expect(row.source,row.source).toMatch(/^\/[^\s<>"]*$/)
    }
    for(const p of ['/author/tbozic/','/author/faizasyed-ai/'])expect(sources.has(p),p).toBe(false)
    expect(redirects.find(row=>row.source==='/aluminum-vs-frp-fan-blades/https:/www.tcf.com/wp-content/uploads/2021/12/High-Temperature-Fans-FE-32/')?.destination).toBe('/aluminum-vs-frp-fan-blades/')
    // Redirects that pointed at a held article that failed the content check follow its fallback.
    expect(redirects.find(row=>row.source==='/cooling-tower-nozzle-clogging/')?.destination).toBe('/nozzles/')
  })
  it('conformance contract: 1,003 rows (1,005 minus the two author rows), two held for a ruling',()=>{
    expect(conformance).toHaveLength(1003)
    const count=(kind:string)=>conformance.filter(row=>row.expect===kind).length
    expect([count('200'),count('301'),count('410'),count('HELD_FOR_CT_RULING')]).toEqual([526,473,2,2])
    expect(expectations.problems).toEqual([])
    expect(expectations.expect.routes).toEqual({publish:3,withdraw:17,index:5,canonical:4})
    expect(dispositions.filter(row=>row.action==='WITHDRAW_TO_REDIRECT').map(row=>[row.path,row.redirect])).toEqual(Object.entries(overrides.redirectSources))
  })
  it('restored files are byte-identical to the verified backup copies in the ledger',()=>{
    const restore=JSON.parse(readFileSync(path.join(DATA,'file-restore-ledger.json'),'utf8')) as {restored:Array<{served_path:string;sha256:string}>}
    expect(restore.restored).toHaveLength(22)
    for(const file of restore.restored)expect(createHash('sha256').update(readFileSync(path.join(APP,'public',file.served_path))).digest('hex'),file.served_path).toBe(file.sha256)
  })
})
