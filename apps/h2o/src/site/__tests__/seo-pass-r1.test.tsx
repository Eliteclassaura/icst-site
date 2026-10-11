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
  it('publishes exactly the held articles that passed the content check, and the algae article (released, SEO-CONTENT-1); the three that failed stay held',()=>{
    // The three R1 articles, and the daily log (CT sitemap parity ruling 2026-10-05: a live 200 page, content check PASS).
    // Locale Part B: the one preserved Thai page that is a held Salmon record (content check PASS).
    expect(overrides.publish).toEqual(['/closed-loop-vs-open-loop/','/understanding-cooling-tower-parts/','/choosing-cooling-tower-fill-media/','/%e0%b9%82%e0%b8%8b%e0%b8%a5%e0%b8%b9%e0%b8%8a%e0%b8%b1%e0%b9%88%e0%b8%99%e0%b8%81%e0%b8%b2%e0%b8%a3%e0%b8%97%e0%b8%b3%e0%b8%84%e0%b8%a7%e0%b8%b2%e0%b8%a1%e0%b9%80%e0%b8%a2%e0%b9%87%e0%b8%99%e0%b8%aa/','/cooling-tower-daily-log/','/cooling-tower-algae-prevention/']) // SEO-CONTENT-1: algae RELEASED (OGCS addendum B; its one failing sentence is replaced)
    for(const p of overrides.publish)expect(auth.get(p),p).toMatchObject({state:'PUBLIC',export:true,indexable:true,sitemap:true})
    for(const p of ['/cooling-tower-spray-nozzles/','/frp-cooling-tower-advantages/','/cooling-tower-fan-balancing/'])expect(auth.get(p),p).toMatchObject({state:'REVIEW_HOLD',export:false})
  })
  it('self canonicals make the four cross-canonical articles indexable; five ranking archives become indexable',()=>{
    expect(Object.keys(overrides.canonical)).toHaveLength(4)
    for(const [p,canonical] of Object.entries(overrides.canonical))expect(auth.get(p),p).toMatchObject({canonical,indexable:true,sitemap:true})
    expect(overrides.index).toHaveLength(5)
    for(const p of overrides.index){expect(auth.get(p),p).toMatchObject({state:'PUBLIC',indexable:true,sitemap:true});expect(EMPTY_ARCHIVE_PATHS,p).not.toContain(p)}
  })
  it('the 18 consolidated pages (and R2.4’s /new-cooling-tower-page/) become REDIRECT rows pointing at a PUBLIC route; the two designed pages are kept (CT ruling 2026-10-04)',()=>{
    // R2.5: + the five redirect sources that were still PUBLIC (/contact/ and the shop remnants) and the two author aliases
    expect(Object.keys(overrides.redirectSources)).toHaveLength(44) // STAGING-AUDIT-REDIRECTS-1: + /cooling-tower-singapore/ (301 to the ranking Singapore page); PROJECT-IMAGES-1 R2: + the two PTT portfolio pages; COUNTRY-PAGES: + /thailand-cooling-tower/; SEO-CONTENT-2.1: + the four locale twins; SEO-CONTENT-2: + /product-category/uncategorized/; SEO-CONTENT-1: + the two placeholder products and five HVAC/commercial articles (HOLD + 301); round 2: + the hospital article and the vibration-switch placeholder
    expect(overrides.redirectSources['/new-cooling-tower-page/']).toBe('/new-cooling-towers/')
    // Reversed for the designed pages: the live duplicates are withdrawn into them.
    expect(overrides.redirectSources['/cooling-tower-thermal-upgrade/']).toBe('/thermal-upgrade/')
    expect(overrides.redirectSources['/cooling-towers-construction-repair-in-japan/']).toBe('/cooling-tower-japan/')
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
    const {proxy}=await import('../../proxy')
    const {sitemapEntriesFor}=await import('../../content/sitemap-response')
    const sitemap=(sitemapEntriesFor()??[]).map(e=>`<loc>${e.loc}</loc>`).join('\n')
    for(const p of ranking){expect(proxy(new NextRequest(`https://h2ocooling.com${p}`)).headers.get('x-robots-tag'),p).toBeNull();expect(sitemap,p).toContain(`<loc>https://h2ocooling.com${p}</loc>`)}
    for(const p of empty){expect(proxy(new NextRequest(`https://h2ocooling.com${p}`)).headers.get('x-robots-tag'),p).toBe('noindex, follow');expect(sitemap,p).not.toContain(`${p}<`)}
  })
  it('answers 410 Gone for the retired WordPress system URLs (query included) and the Yoast-listed junk pages',async()=>{
    snapshot([])
    const {proxy}=await import('../../proxy')
    const gone=['/canvas/list/','/wp/wp-admin/edit.php','/evercompare/','/gh/','/draft-page/','/locations.kml','/id/draft-page/','/ja/draft-page/','/th/draft-page/','/vi/draft-page/']
    expect([...GONE_PATHS]).toEqual(gone)
    for(const url of ['/canvas/list/','/wp/wp-admin/edit.php?post_type=product','/evercompare/','/locations.kml']){const res=proxy(new NextRequest(`https://h2ocooling.com${url}`));expect(res.status,url).toBe(410);expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')}
    expect(tsv('gone.tsv').map(row=>row.path)).toEqual(gone)
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
    // 473 decided 200 pages minus /author/tbozic/, the 4 failed held articles and the 2 withdrawn duplicates, plus the
    // un-consolidated /cooling-tower-vs-chiller/ (OGCS R1.2), plus the published daily log (CT 2026-10-05).
    // Locale Part B: the published Thai Salmon page (its own title, the live meta).
    // R2.2: + the D3 portfolio row (CT-ruled meta and title). R2.4: + 12 rows of the OGCS R2.4 titles/metas (13 pages; the
    // /industrial-cooling-towers/ row existed). R2.4 R2: + the 15 archive metas (OGCS R2.4A).
    expect(seo).toHaveLength(490) // STAGING-AUDIT CP-19: + /cooling-tower-certified-parts/ (meta row, OEM/warranty wording removed); PROJECT-IMAGES-1 R2: - the two PTT portfolio rows (301s now); COUNTRY-PAGES: the Thailand row moves to /cooling-tower-thailand/; R2.5: + the /cooling-tower-construction/ title row (OGCS R2.5); SEO-CONTENT-1: - the five held pages' rows (their decided titles are dropped)
    const titles=seo.map(row=>row.title!)
    expect(new Set(titles).size).toBe(titles.length)
    // a meta-only row keeps the page's current title (two noindex tag archives keep their term-list titles)
    const kept=(row:Record<string,string>)=>row.meta_origin!.startsWith('SOURCE')&&row.title===row.title_now&&!row.meta_origin!.includes('OGCS_R2_4_TITLE')
    for(const row of seo.filter(r=>!kept(r))){expect(row.title!.length,row.title).toBeLessThanOrEqual(69);expect(row.title,row.title).not.toMatch(FORBIDDEN)}
  })
  it('metas written: 70-158 characters, unique across the full set, quote-only; OGCS R1.2 leaves none pending',()=>{
    const written=seo.filter(row=>!row.meta_origin!.includes('PENDING_OGCS'))
    expect(seo.length-written.length).toBe(0)
    expect(seo.filter(row=>row.meta_origin==='OGCS_SUPPLEMENT')).toHaveLength(35) // SEO-CONTENT-1: one of the five held pages carried a supplement meta
    // The wrong-model meta is corrected to the product's own model (CT parity audit risk 6).
    const fan=seo.find(row=>row.path==='/product/tuf-lite-ii-5000h-series-hub-fan-assemblies/')!
    expect(fan.title).toBe('TUF-LITE II - 5000H Series Hub Fan Assemblies | Cooling Tower Fans') // SEO-CONTENT-2.2 trimmed the suffix; OGCS staging-audit CP-07 (2026-10-11) restores it
    expect(fan.meta).toContain('5000H');expect(fan.meta).not.toContain('6000H')
    expect(new Set(written.map(row=>row.meta)).size).toBe(written.length)
    for(const row of written){expect(row.meta!.length,row.path).toBeGreaterThanOrEqual(70);expect(row.meta!.length,row.path).toBeLessThanOrEqual(160);expect(row.meta,row.path).not.toMatch(FORBIDDEN)}
    expect(seo.find(row=>row.path==='/category/blog/')?.meta).toBe('Cooling tower articles from ICS on replacement planning, free cooling, water management plans, noise limits, retrofits and lifecycle asset management.')
    expect(seo.find(row=>row.path==='/category/cooling-tower-cost/')?.meta).toBe('ICS articles on cooling tower cost: replacement budgeting, ROI and hidden expenses, plus risk management strategies for industrial cooling towers.') // OGCS staging-audit CP-16 (industrial-only)
    expect(EMPTY_ARCHIVE_PATHS).toContain('/category/cooling-tower-cost/')
  })
  it('redirects: unique sources, single hop to a 200 target, no loops or self-redirects; author aliases owned by the batch',()=>{
    // 474, plus the 13 translated posts outside the Part A universe (CT sitemap parity ruling 2026-10-05).
    // Locale Part B: 98 R1 locale→English redirects retire (the locale page is preserved), 4 locale redirects are new.
    // R2.4: + /new-cooling-tower-page/ → /new-cooling-towers/ (CT ruling 2026-10-05).
    // R2.5: + the two author aliases (the batch owns them; fresh production DB) and the eleven live-chain middle addresses.
    expect(redirects).toHaveLength(444) // STAGING-AUDIT-REDIRECTS-1: + fifteen 301s (/cooling-tower-singapore/, /blog/, /tools/, six nested repair URLs, six /blog/category/cooling-tower-fans/page/N/); PROJECT-IMAGES-1 R2 / COUNTRY-PAGES: + three portfolio/country 301s; REDIRECTS-ADD-1: + five catch-all redirects; SEO-CONTENT-2.1: + four locale-twin HOLD 301s; // Design R3: + /about-us/; SEO-CONTENT-1: + seven HOLD 301s, - the algae hold 301 (released)
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
    // R2.5 (CT ruling, fresh production DB): the two author aliases are no longer pre-existing Payload records; the batch owns
    // their single-hop 301 to the public author archive.
    for(const p of ['/author/tbozic/','/author/faizasyed-ai/'])expect(redirects.find(row=>row.source===p),p).toMatchObject({destination:'/author/timbozic/',status:'301'})
    expect(redirects.find(row=>row.source==='/aluminum-vs-frp-fan-blades/https:/www.tcf.com/wp-content/uploads/2021/12/High-Temperature-Fans-FE-32/')?.destination).toBe('/aluminum-vs-frp-fan-blades/')
    // Redirects that pointed at a held article that failed the content check follow its fallback.
    expect(redirects.find(row=>row.source==='/cooling-tower-nozzle-clogging/')?.destination).toBe('/nozzles/')
    // Repointed to the final destination: the reversal cannot leave a chain.
    expect(redirects.find(row=>row.source==='/thermal-upgrades-for-cooling-tower-efficiency/')?.destination).toBe('/thermal-upgrade/')
  })
  it('conformance contract: 1,125 rows (the OGCS and CT rulings, OGCS Locale Part A deciding every locale URL, the R2.2 D3 row and R2.4), none held',()=>{
    // R2.4: + 10 pages of the OGCS R2.4 titles/metas (the two designed pages had rows) and the /new-cooling-tower-page/ 301;
    // R2.4 R2: + the 15 archives with an OGCS meta.
    // R2.5: + 13 redirect rows and the /cooling-tower-construction/ title row.
    expect(conformance).toHaveLength(1143) // SEO-CONTENT-2: + the /product-category/uncategorized/ 301 row // Design R3: + /about-us/; SEO-CONTENT-1: + two 301 rows (the five held pages with a 200 row become 301 rows; algae 301 → 200)
    expect(conformance.filter(row=>row.kind==='locale')).toHaveLength(162) // SEO-CONTENT-2.1: the four twins are 301 rows now;
    const count=(kind:string)=>conformance.filter(row=>row.expect===kind).length
    expect([count('200'),count('301'),count('410'),count('HELD_FOR_CT_RULING')]).toEqual([709,424,10,0]) // PROJECT-IMAGES-1 R2 / COUNTRY-PAGES: three 200 rows are 301 rows; R2.2: + the D3 portfolio (200); Design R3: + /about-us/ (301); SEO-CONTENT-1: 200 −5 +1 (algae), 301 +6
    for(const p of ['/thermal-upgrade/','/cooling-tower-japan/'])expect(conformance.find(row=>row.url===p),p).toMatchObject({expect:'200',kind:'html'})
    expect(expectations.problems).toEqual([])
    // CLAIMS-R2 (CT 2026-10-06) is ONE delta on the state Design R3 (Round 11) leaves on staging: one hygiene route (the Home's ten
    // reworded elements) and nothing else. (Design R3 was the delta on R2.5: it created /about-us/, 301 to the About page.) (R2.5 was the delta on R2.4 R2: 7 withdrawals, 11 created middle addresses, 5 SEO fields and 14
    // hygiene routes; those are now in place, and the fresh-database replay applies them from expectations.fresh-db.json.)
    // SEO-CONTENT-1 (CT 2026-10-07) is ONE delta on the state Design R4 + phase 2 (Round 16) leaves: publish 1 (algae), withdraw 7 (two
    // placeholder products, five HVAC/commercial articles), redirects create 7 / update 2 / retire 1, 8 SEO fields (seven product
    // titles, BacMan), 23 H1 rows, restored 1 (the approach table cell), slot fixes on 10 written routes and 109 hygiene routes.
    expect(expectations.expect.routes).toEqual({publish:1,withdraw:17,index:0,canonical:0}) // + the two PTT portfolio pages and /thailand-cooling-tower/
    expect(expectations.expect.redirects).toEqual({create:22,update:6,unchanged:401,retire:1,normalise:0}) // round 2: + the hospital article and vibration-switch 301s
    expect(expectations.expect.seoFields).toMatchObject({update:72,pendingOgcs:0}) // CONTENT-FIX-3: + 1 (UP2-02 category meta); SEO-CONTENT-2.2: + 56; round 2: + the seminar and maintenance-checklist metas
    expect((expectations.expect as Record<string,unknown>).slotFixes).toEqual({routes:57}) // SEO-CONTENT-2.2: +31; SEO-CONTENT-2.1: +4 (the held locale twins); piece C: +3 routes; // round 2 (rehearsed on the writable mock)
    // Design R4 (CT 2026-10-07) is ONE delta on the state CLAIMS-R2 leaves: two hygiene routes (parts hub R4C-01…06, Dry Soda R4C-07),
    // and /air-coolers/ (R4C-08…10 page text with R4C-11, its restored-section heading): restored 1, slot fixes 1.
    expect((expectations.expect as Record<string,unknown>).hygiene).toEqual({routes:272}) // SEO-CONTENT-2.2: +25; SEO-CONTENT-2.1: +6; piece C: +66
    expect(expectations.expect.h1).toEqual({update:27}) // COUNTRY-PAGES: - the old Thailand H1 row; SEO-CONTENT-1 23 (22 project H1s + /fans/) + R5b 2 (USA, Singapore)
    expect((expectations.expect as Record<string,unknown>).restored).toEqual({update:4}) // SEO-CONTENT-2 piece B: + /chiller-and-cooling-tower/ (two paragraphs). SEO-CONTENT-1: the /cooling-tower-approach/ table cell (R4C-11's /air-coolers/ heading is in place by then)
    expect(existsSync(path.join(APP,'ops/seo-pass/data/expectations.case-b.json'))).toBe(false)
    // The two translated posts that pointed at the English final page of a then-pending locale page now point at it (one hop).
    const repoint=tsv('locale-b-repoint.tsv')
    expect(repoint.map(row=>row.source)).toEqual(['/วิธีป้องกันแบคทีเรีย-legionella/','/逆流-vs-クロスフロー/'])
    for(const row of repoint)expect(decode(redirects.find(r=>decode(r.source!)===decode(row.source!))!.destination!),row.source).toBe(row.destination_after_locale_b)
    expect(dispositions.filter(row=>row.action==='WITHDRAW_TO_REDIRECT')).toHaveLength(44) // STAGING-AUDIT-REDIRECTS-1: + /cooling-tower-singapore/; + the two PTT portfolio pages and /thailand-cooling-tower/ (301s)
    expect(dispositions.filter(row=>row.action==='WITHDRAW_TO_REDIRECT').map(row=>[row.path,row.redirect])).toEqual(Object.entries(overrides.redirectSources))
  })
  it('restored files are byte-identical to the verified backup copies in the ledger',()=>{
    const restore=JSON.parse(readFileSync(path.join(DATA,'file-restore-ledger.json'),'utf8')) as {restored:Array<{served_path:string;sha256:string}>}
    expect(restore.restored).toHaveLength(22)
    for(const file of restore.restored)expect(createHash('sha256').update(readFileSync(path.join(APP,'public',file.served_path))).digest('hex'),file.served_path).toBe(file.sha256)
  })
})
