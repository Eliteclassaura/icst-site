/**
 * R2.4 pre-launch SEO fix pack (Control Tower 2026-10-05; SEO Checker baseline triage §3 a–l): the standard head on every
 * template (a b d f), paginated archives (c), Article scoping (j), recovered and withheld images (g), internal links to final
 * URLs (h), 301 for every redirect (k), link names and reserved image boxes (l), the R2.4 batch data and the noindex rulings.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup as renderMarkup} from 'react-dom/server'
import {physicalHtml,physicalSrc} from './physical-html'
import Page from '../../app/(site)/[[...slug]]/page'
import SearchPage,{generateMetadata as searchGenerateMetadata} from '../../app/(site)/search/page'
const searchMetadata=searchGenerateMetadata()
import {headProblems,jsonLdIds,LEGACY_SUFFIX,metaValues,paginationProblems,ORGANIZATION_ID,WEBSITE_ID} from '../../../ops/seo-pass/head-assertions.mjs'
import {servedDescription,servedTitle} from '../SalmonCanonical'
import {englishServiceForPath} from '../EnglishServices'
import {releaseRouteFor,salmonDocument,salmonMedia,withheldSource} from '../salmon'
import {standardSocialMeta,ogDefault} from '../standard-head'
import {sizeFromHeader} from '../image-size'
import {NON_DESCRIPTIVE} from '../link-context'
import {EMPTY_ARCHIVE_PAGES,EMPTY_ARCHIVE_PATHS} from '../../content/empty-archives'
const renderToStaticMarkup=(...args:Parameters<typeof renderMarkup>)=>physicalHtml(renderMarkup(...args))

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const slugOf=(p:string)=>p.split('/').filter(Boolean).map(decodeURIComponent)
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:slugOf(p)}),searchParams:Promise.resolve({})}))
const docOf=(p:string)=>salmonDocument(releaseRouteFor(slugOf(p))!)
const served=(p:string)=>{const doc=docOf(p);return {title:servedTitle(doc),meta:servedDescription(doc)??''}}
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean;sourceFile?:string;redirect?:string|null}>;redirects:Array<{source:string;destination:string;status:number}>}
const tsv=(f:string)=>{const [h,...l]=readFileSync(path.join(APP,'ops/seo-pass/data',f),'utf8').trimEnd().split('\n');const c=h!.split('\t');return l.map(x=>Object.fromEntries(x.split('\t').map((v,i)=>[c[i]!,v])))}

describe('standard head (items a, b, d, f)',()=>{
  it('imported pages of every family: og/twitter mirror the served title and meta; og:url, og:image, twitter:card, Organization and WebSite @ids',async()=>{
    for(const p of ['/','/cooling-tower/','/cooling-tower-basin-heater/','/hello-world-2/','/category/blog/','/category/blog/page/12/','/product-category/fans/','/rt-portfolios/ptt-gsp3-fan-upgrade/','/thank-you/','/all-projects/palinpinon-3/']){
      const html=await render(p)
      // repository mode serves the imported titles; the decided ones (no legacy suffix) are the batch's, checked below
      expect(headProblems(html,served(p),{legacySuffix:false}),p).toEqual([])
      expect(metaValues(html,'og:url'),p).toHaveLength(1)
    }
  },120_000)
  it('no decided title carries a legacy WordPress suffix, and og:site_name is ICS',async()=>{
    expect(tsv('seo-fields.tsv').filter(r=>LEGACY_SUFFIX.test(r.title!)).map(r=>r.path)).toEqual([])
    expect(metaValues(await render('/hello-world-2/'),'og:site_name')).toEqual(['ICS'])
  },120_000)
  it('the six English service pages and /search/ carry the same head (they had none)',async()=>{
    for(const p of ['/cooling-tower-rebuilds-new-towers/','/counterflow-cooling-tower-repair-maintenance/','/crossflow-cooling-tower-repair-maintenance/','/emergency-cooling-tower-repair/','/low-drift-cooling-tower-solutions/','/wet-hybrid-dry-cooling-tower-repair/']){
      const service=englishServiceForPath(p)!
      const html=await render(p)
      expect(headProblems(html,{title:`${service.title} | ICS`,meta:service.lead}),p).toEqual([])
      expect(metaValues(html,'og:url'),p).toEqual([`https://h2ocooling.com${p}`])
    }
    const html=renderToStaticMarkup(await SearchPage({searchParams:Promise.resolve({})} as never))
    expect(headProblems(html,{title:String(searchMetadata.title),meta:String(searchMetadata.description)})).toEqual([])
  },120_000)
  it('a page without a held image takes the site default og:image (1200×630, the verified crop, its bytes as named)',async()=>{
    const d=ogDefault()
    const file=path.join(APP,'public',physicalSrc(d.file))
    const bytes=readFileSync(file)
    expect([d.width,d.height]).toEqual([1200,630])
    expect(sizeFromHeader(bytes)).toEqual({width:1200,height:630})
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(path.basename(physicalSrc(d.file),'.jpg'))
    const html=await render('/category/blog/')
    expect(metaValues(html,'og:image')[0]).toMatch(new RegExp(`${physicalSrc(d.file).replace(/[./]/g,'\\$&')}$`))
    expect(metaValues(html,'og:image:width')).toEqual(['1200'])
  },120_000)
  it('stale imported social values are replaced, not duplicated; a page’s own image stays',()=>{
    const meta=standardSocialMeta([{name:'og:title',value:'Old - H2O Cooling'},{name:'og:image',value:'https://h2ocooling.com/media/salmon/x.jpg'},{name:'og:type',value:'article'}],{title:'New - ICS',description:'Decided meta.',url:'https://h2ocooling.com/a/'})
    expect(meta.filter(m=>m.name==='og:title')).toEqual([{name:'og:title',value:'New - ICS'}])
    expect(meta.filter(m=>m.name==='og:image')).toEqual([{name:'og:image',value:'https://h2ocooling.com/media/salmon/x.jpg'}])
    expect(meta.filter(m=>m.name==='og:type')).toEqual([{name:'og:type',value:'article'}])
    expect(meta.find(m=>m.name==='twitter:card')?.value).toBe('summary_large_image')
  },120_000)
  it('the Organization and WebSite nodes are emitted once (not when the page’s own data already names them)',async()=>{
    const html=await render('/')
    const ids=[...html.matchAll(/"@id":"(https:\/\/h2ocooling\.com\/#(?:organization|website))"/g)].map(m=>m[1])
    expect(new Set(ids)).toEqual(new Set([ORGANIZATION_ID,WEBSITE_ID]))
    expect(html.match(/data-standard-schema/g)?.length??0).toBeLessThanOrEqual(1)
  },120_000)
})

describe('paginated archives (item c)',()=>{
  it('every paginated archive is titled "… - Page N" with a meta derived from its archive (where the archive has one)',()=>{
    const pages=ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&/\/page\/\d+\/$/.test(r.path))
    expect(pages.length).toBeGreaterThan(50)
    const titles=new Set<string>()
    for(const r of pages){
      const s=served(r.path)
      const root=served(/^(.*\/)page\/\d+\/$/.exec(r.path)![1]!)
      expect(paginationProblems(r.path,s).filter(p=>root.meta||p!=='no meta description'),r.path).toEqual([])
      if(root.meta)expect(s.meta,r.path).toMatch(new RegExp(`^Page ${/(\d+)\/$/.exec(r.path)![1]}: `))
      // length limits apply to the indexable archives (tag archives are noindex and keep their term lists)
      if((r as {indexable?:boolean}).indexable){expect(s.title.length,r.path).toBeLessThanOrEqual(69);expect(s.meta.length,r.path).toBeLessThanOrEqual(158)}
      expect(titles.has(s.title),r.path).toBe(false)
      titles.add(s.title)
    }
    expect(served('/product-category/drive-shafts-assemblies/page/2/').meta).toMatch(/^Page 2: /)
    expect(served('/product-category/drive-shafts-assemblies/page/2/').title).toMatch(/ - Page 2(?: - ICS)?$/)
  },120_000)
})

describe('empty archives (R2.4 R2, CT ruling 2026-10-05)',()=>{
  it('page 2+ of an archive that lists nothing public is a 404; its root keeps the noindex,follow empty state',async()=>{
    expect(EMPTY_ARCHIVE_PAGES.size).toBe(37)
    for(const p of EMPTY_ARCHIVE_PAGES)await expect(render(p),p).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
    const html=await render('/category/cooling-tower-fansothers-language/')
    expect(html).toContain('Nothing is listed here yet')
    // no page link anywhere points at a 404 page
    expect([...html.matchAll(/href="([^"]+)"/g)].map(m=>decodeURIComponent(m[1]!)).filter(h=>EMPTY_ARCHIVE_PAGES.has(h))).toEqual([])
    for(const p of EMPTY_ARCHIVE_PATHS.filter(x=>!EMPTY_ARCHIVE_PAGES.has(x)))expect(ledger.routes.find(r=>r.path===p),p).toMatchObject({state:'PUBLIC'})
  },120_000)
  it('the 15 archives whose pages inherit a meta have the OGCS meta (metaMissingPendingOgcs 0)',()=>{
    const seo=new Map(tsv('seo-fields.tsv').map(r=>[r.path,r]))
    const archives=tsv('r24-seo-set.tsv').filter(r=>/^\/(?:category|tag|product-category|product-tag)\//.test(r.path!))
    expect(archives).toHaveLength(15)
    for(const r of archives)expect(seo.get(r.path!)?.meta,r.path).toBe(r.value)
  },120_000)
})

describe('Article scoping (item j)',()=>{
  const graphs=(html:string)=>[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]!)
  const typed=(html:string,type:string)=>{const out:Array<Record<string,unknown>>=[];const walk=(v:unknown)=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){const o=v as Record<string,unknown>;if([o['@type']].flat().includes(type))out.push(o);Object.values(o).forEach(walk)}};graphs(html).forEach(g=>walk(JSON.parse(g)));return out}
  it('a real article keeps Article/BlogPosting with the public author',async()=>{
    const html=await render('/cooling-tower-basin-heater/')
    const articles=[...typed(html,'Article'),...typed(html,'BlogPosting')]
    expect(articles.length).toBeGreaterThan(0)
    for(const a of articles)expect(a.author).toEqual({'@type':'Person',name:'Tim Bozic',url:'https://h2ocooling.com/author/timbozic/'})
  },120_000)
  it('a page that is not an article carries WebPage, never an author-less Article',async()=>{
    for(const p of ['/thank-you/','/thailand-cooling-tower/']){
      const html=await render(p)
      expect([...typed(html,'Article'),...typed(html,'BlogPosting'),...typed(html,'NewsArticle')],p).toEqual([])
      expect(typed(html,'WebPage').length,p).toBeGreaterThan(0)
    }
  },120_000)
})

describe('images (items g, l)',()=>{
  type Row={url:string;sha256:string;bytes:number;file:string;width:number;height:number;referencedBy:string[]}
  const recovered=(JSON.parse(readFileSync(path.join(APP,'content/salmon/r24-recovered-media-identities.json'),'utf8')) as {rows:Row[]}).rows
  it('every recovered image is held under its SHA-256 with its recorded size, and resolves through the media index',()=>{
    expect(recovered).toHaveLength(61)
    for(const r of recovered){
      const bytes=readFileSync(path.join(APP,'public/media/salmon',path.basename(r.file)))
      expect(createHash('sha256').update(bytes).digest('hex'),r.url).toBe(r.sha256)
      expect(bytes.length,r.url).toBe(r.bytes)
      expect(sizeFromHeader(bytes),r.url).toEqual({width:r.width,height:r.height})
      expect(salmonMedia(r.url,r.url)?.sha256,r.url).toBe(r.sha256)
    }
  },120_000)
  it('the images held nowhere are removed from their pages (no placeholder), recorded in media-overrides.json',async()=>{
    const withheld=(JSON.parse(readFileSync(path.join(APP,'content/design/media-overrides.json'),'utf8')) as {withheldSources:Array<{url:string;page:string}>}).withheldSources
    // the checker's 5, 3 of the same class (scan), and R2.4 R2 (CT flag 3): the 11 remaining placeholders on 6 live articles
    expect(withheld).toHaveLength(19)
    for(const w of withheld){
      expect(withheldSource(w.url,w.url)).toBe(true)
      const html=await render(w.page)
      expect(html.replace(/ data-source-src="[^"]*"/g,''),w.page).not.toContain(path.basename(new URL(w.url).pathname))
      expect(html,w.page).not.toContain(`data-source-src="${w.url}"`)
    }
    // the recovered one that was a placeholder now renders its held file
    expect(await render('/environmental-advantage-cooling-towers-vs-cooling-systems/')).toContain('/media/salmon/24c1c152556597cad20796138c2849f5004cbd0f1ddd657cf35651f5eea463f1.jpg')
  },120_000)
  it('no live article shows a "Historical source image unavailable" box (CT flag 3)',async()=>{
    for(const p of ['/guide-about-cooling-tower/','/hybrid-and-dry-cooling-technologies/','/industrial-cooling-tower-automation/','/industrial-cooling-towers/','/rt-portfolios/ptt-gsp6-96-fan-ache-performance-upgrade/','/understanding-cooling-tower-performance-curve/','/hello-world-2/','/dyna-fab-10-height-fan-stack/'])expect(await render(p),p).not.toContain('Historical source image unavailable')
  },120_000)
  it('every image on the three CLS pages reserves its box (width and height)',async()=>{
    for(const p of ['/cooling-tower-efficiency-calculation/','/cooling-tower-maintenance/','/cooling-tower-performance-curve/']){
      const html=await render(p)
      for(const m of html.matchAll(/<img\b[^>]*>/g))expect(/\swidth="\d+"/.test(m[0])&&/\sheight="\d+"/.test(m[0]),`${p} ${m[0].slice(0,120)}`).toBe(true)
    }
  },120_000)
  it('every non-descriptive link on the home and /cooling-tower/ pages has an accessible name from its card',async()=>{
    for(const p of ['/','/cooling-tower/']){
      const html=await render(p)
      const bare=[...html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)].filter(m=>NON_DESCRIPTIVE.test(m[2]!.trim())&&!/\saria-label="[^"]+"/.test(m[1]!))
      expect(bare.map(m=>m[0].slice(0,100)),p).toEqual([])
    }
  },120_000)
})

describe('redirects and the R2.4 batch (items h, k; CT rulings)',()=>{
  it('every ledger redirect is a 301',()=>{
    expect(ledger.redirects.length).toBeGreaterThan(0)
    expect(ledger.redirects.filter(r=>r.status!==301)).toEqual([])
  },120_000)
  it('the batch normalises every imported 308 record to 301 once (R2.4 set the 50; R2.5, a delta on R2.4, expects none)',()=>{
    const rows=tsv('redirect-status.tsv')
    const exp=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/expectations.json'),'utf8')).expect
    expect(rows.every(r=>r.status_now==='308'&&r.status==='301')).toBe(true)
    expect(exp.redirects.normalise).toBe(rows.length)
    expect(rows).toEqual([])
  },120_000)
  it('no fixed page element links to a page that answers 301 (internal links point at final URLs)',()=>{
    const sources=new Set([...tsv('redirects.tsv').map(r=>decodeURIComponent(r.source!)),...ledger.redirects.map(r=>decodeURIComponent(r.source))])
    const fixes=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/slot-fixes.json'),'utf8')) as Record<string,{slots:Array<{after:unknown}>}>
    const links:string[]=[]
    const walk=(v:unknown)=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){const o=v as Record<string,unknown>;if(o.type==='link')links.push(String((o.fields as {url?:string})?.url??''));Object.values(o).forEach(walk)}}
    for(const r of Object.values(fixes))for(const s of r.slots)walk(s.after)
    const own=(u:string)=>{const m=/^(?:https?:\/\/(?:www\.)?h2ocooling\.com)?(\/(?!\/)[^?#]*)/i.exec(u);return m?decodeURIComponent(m[1]!.endsWith('/')||/\.[a-z0-9]{2,5}$/i.test(m[1]!)?m[1]!:m[1]+'/'):null}
    expect(links.length).toBeGreaterThan(300)
    expect(links.filter(u=>{const p=own(u);return p!==null&&sources.has(p)})).toEqual([])
    for(const gone of ['/contact/','/frp-fan-blades-benefits/'])expect(links.some(u=>own(u)===gone),gone).toBe(false)
  },120_000)
  it('/new-cooling-tower-page/ is withdrawn with a 301 to /new-cooling-towers/ (CT ruling) and leaves the sitemap',()=>{
    expect(tsv('route-dispositions.tsv').find(r=>r.path==='/new-cooling-tower-page/')).toMatchObject({action:'WITHDRAW_TO_REDIRECT',redirect:'/new-cooling-towers/'})
    // created by R2.4; R2.5 is a delta on it
    expect(tsv('redirects.tsv').find(r=>r.source==='/new-cooling-tower-page/')).toMatchObject({destination:'/new-cooling-towers/',status:'301',action:'UNCHANGED'})
    expect(ledger.routes.find(r=>r.path==='/new-cooling-tower-page/')).toMatchObject({state:'REDIRECT',export:false,sitemap:false,redirect:'/new-cooling-towers/'})
  },120_000)
  it('the OGCS R2.4 titles and metas are the batch’s values (the withdrawn page’s title dropped; /search/ in code)',()=>{
    const set=tsv('r24-seo-set.tsv')
    const seo=new Map(tsv('seo-fields.tsv').map(r=>[r.path,r]))
    expect(set).toHaveLength(29) // 14 OGCS R2.4 rows + 15 archive metas (OGCS R2.4A)
    expect(set.some(r=>r.path==='/new-cooling-tower-page/'||r.path==='/search/')).toBe(false)
    // SEO-CONTENT-2.2: the OGCS quick-wins titles supersede some R2.4 titles (<= 60 characters)
    const quickWins=new Map(tsv('sc1-seo-set.tsv').filter(r=>r.field==='title'&&/OGCS quick-wins titles/.test(r.reason)).map(r=>[r.path!,r.value!]))
    for(const r of set)expect(seo.get(r.path!)?.[r.field==='title'?'title':'meta'],`${r.path} ${r.field}`).toBe(r.field==='title'?(quickWins.get(r.path!)??r.value):r.value)
    expect(seo.get('/industrial-cooling-towers/')?.meta).not.toContain('90%')
  },120_000)
  it('/search/ is noindex,follow with the OGCS meta; /thank-you/ and /search/ stay out of the sitemap',()=>{
    // SEO-FIX-2 (SC-03): under the default private policy the meta mirrors the header floor (noindex, nofollow); production keeps noindex,follow
    expect(searchMetadata.robots).toEqual({index:false,follow:false})
    expect(searchMetadata.description).toBe('Search the ICS website for cooling tower parts, services, projects, and technical articles.')
    expect(ledger.routes.find(r=>r.path==='/thank-you/')).toMatchObject({sitemap:false})
    expect(existsSync(path.join(APP,'public/sitemap.xml'))&&readFileSync(path.join(APP,'public/sitemap.xml'),'utf8').includes('/search/')).toBe(false)
  },120_000)
})

describe('head assertions (the conformance checker’s rules)',()=>{
  it('flag a mismatch, a missing tag, a legacy suffix and a paginated title without its page number',()=>{
    const html='<title>A - ICS</title><meta property="og:title" content="B"/><meta name="twitter:title" content="A - ICS"/>'
    expect(headProblems(html,{title:'A - ICS',meta:''})).toEqual(expect.arrayContaining(['og:title "B" ≠ "A - ICS"','0 og:url','0 twitter:card','no og:image','no Organization @id','no WebSite @id']))
    expect(headProblems('',{title:'Thank you - New Cooling Tower Construction, Parts, Maintenance, Upgrades',meta:''}).some(p=>p.startsWith('legacy title suffix'))).toBe(true)
    expect(paginationProblems('/category/blog/page/3/',{title:'Blog - ICS',meta:''})).toEqual(['title does not name Page 3: "Blog - ICS"','no meta description'])
    expect(jsonLdIds('<script type="application/ld+json">{"@graph":[{"@id":"x"}]}</script>')).toEqual(new Set(['x']))
  },120_000)
})
