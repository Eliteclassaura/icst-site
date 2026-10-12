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
  it('a public row is never a redirect source (R2.5: the R2 shop remnants and /contact/ are withdrawn to their 301s)',()=>{
    const redirected=ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&redirectSources.has(decode(row.path)))
    expect(redirected.map(row=>row.path).sort()).toEqual([])
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
    // SEO-CONTENT-1 retires one more: the algae hold 301 to /tech-articles/ (the article is released at its own URL).
    expect(data('redirects-retired.tsv').map(r=>[r.source,r.was_destination])).toEqual([['/cooling-tower-algae-prevention/','/tech-articles/']])
    // R2.4 creates one: /new-cooling-tower-page/ → /new-cooling-towers/ (CT ruling 2026-10-05).
    // R2.5 created the eleven live-chain middle addresses (CT approved). Design R3 is a delta on the R2.5 batch: it creates
    // only /about-us/ → /about-ics-industrial-cooling-solutions/ (CT ruling 2026-10-06); CLAIMS-R2 is a delta on that batch and
    // writes no redirect: everything is in place
    // SEO-CONTENT-1 (CT 2026-10-07) is the next delta: seven HOLD 301s created and two evidence paths repointed to the final page.
    expect(data('redirects.tsv').filter(r=>r.action!=='UNCHANGED').map(r=>`${r.action} ${r.source} ${r.destination}`)).toEqual([
      'UPDATE /blog/hvac-cooling-tower/ /guide-about-cooling-tower/',
      'UPDATE /blog/commercial-cooling-towers/ /legionella-control-in-industrial-cooling-towers/',
      // SEO-CONTENT-2.1 (CT 2026-10-08, TC-001..004): the legacy locale sources go straight to the guide twins
      'UPDATE /ja/blog/thap-giai-nhiet-hvac-la-gi-vai-tro-cua-thap-giai-nhiet-trong-he-thong-hvac/ /ja/%e5%86%b7%e5%8d%b4%e5%a1%94%e3%81%a8%e3%81%af%e4%bd%95%e3%81%a7%e3%81%99%e3%81%8b/',
      'UPDATE /blog/thap-giai-nhiet-hvac-la-gi-vai-tro-cua-thap-giai-nhiet-trong-he-thong-hvac/ /ja/%e5%86%b7%e5%8d%b4%e5%a1%94%e3%81%a8%e3%81%af%e4%bd%95%e3%81%a7%e3%81%99%e3%81%8b/',
      'UPDATE /id/blog/apa-itu-menara-pendingin-hvac-peran-menara-pendingin-dalam-sistem-hvac/ /id/apa-itu-menara-pendinginan/',
      'UPDATE /th/blog/%E0%B8%AB%E0%B8%AD%E0%B8%84%E0%B8%AD%E0%B8%A2%E0%B8%97%E0%B8%B3%E0%B8%84%E0%B8%A7%E0%B8%B2%E0%B8%A1%E0%B9%80%E0%B8%A2%E0%B9%87%E0%B8%99-hvac-%E0%B8%84%E0%B8%B7%E0%B8%AD%E0%B8%AD%E0%B8%B0%E0%B9%84/ /th/%e0%b8%ab%e0%b8%ad%e0%b8%97%e0%b8%b3%e0%b8%84%e0%b8%a7%e0%b8%b2%e0%b8%a1%e0%b9%80%e0%b8%a2%e0%b9%87%e0%b8%99%e0%b8%84%e0%b8%b7%e0%b8%ad%e0%b8%ad%e0%b8%b0%e0%b9%84%e0%b8%a3/',
      'CREATE /product/abb-motor-example/ /motors/',
      'CREATE /product/teco-westinghouse-motor-example/ /motors/',
      'CREATE /hvac-cooling-tower/ /guide-about-cooling-tower/',
      'CREATE /hvac-cooling-tower-systems/ /guide-about-cooling-tower/',
      'CREATE /cooling-tower-free-cooling-mode-cut-chiller-costs-now/ /energy-efficient-cooling-tower/',
      'CREATE /commercial-building-cooling-tower/ /cooling-tower/',
      'CREATE /commercial-cooling-towers/ /legionella-control-in-industrial-cooling-towers/',
      'CREATE /hospital-cooling-systems/ /cooling-tower/',
      'CREATE /product/vibration-switch-example/ /tower-hardware/',
      'CREATE /product-category/uncategorized/ /cooling-tower-parts-online/',
      // SEO-CONTENT-2.1: the four held locale twins
      'CREATE /id/apa-itu-menara-pendingin-hvac-peran-menara-pendingin-dalam-sistem-hvac/ /id/apa-itu-menara-pendinginan/',
      'CREATE /ja/thap-giai-nhiet-hvac-la-gi-vai-tro-cua-thap-giai-nhiet-trong-he-thong-hvac/ /ja/%e5%86%b7%e5%8d%b4%e5%a1%94%e3%81%a8%e3%81%af%e4%bd%95%e3%81%a7%e3%81%99%e3%81%8b/',
      'CREATE /th/%e0%b8%ab%e0%b8%ad%e0%b8%84%e0%b8%ad%e0%b8%a2%e0%b8%97%e0%b8%b3%e0%b8%84%e0%b8%a7%e0%b8%b2%e0%b8%a1%e0%b9%80%e0%b8%a2%e0%b9%87%e0%b8%99-hvac-%e0%b8%84%e0%b8%b7%e0%b8%ad%e0%b8%ad%e0%b8%b0%e0%b9%84/ /th/%e0%b8%ab%e0%b8%ad%e0%b8%97%e0%b8%b3%e0%b8%84%e0%b8%a7%e0%b8%b2%e0%b8%a1%e0%b9%80%e0%b8%a2%e0%b9%87%e0%b8%99%e0%b8%84%e0%b8%b7%e0%b8%ad%e0%b8%ad%e0%b8%b0%e0%b9%84%e0%b8%a3/',
      'CREATE /vi/thap-giai-nhiet-hvac-la-gi-vai-tro-cua-thap-giai-nhiet-trong-he-thong-hvac/ /vi/thap-giai-nhiet-la-gi/',
      // REDIRECTS-ADD-1 (CT 2026-10-09, QA R18): live catch-alls that went to the home page go to their best real page
      'CREATE /about/ /about-ics-industrial-cooling-solutions/',
      'CREATE /services/ /cooling-tower-maintenance-repair-upgrade/',
      'CREATE /cooling-towers/ /cooling-tower/',
      'CREATE /fan-stacks/ /cooling-tower-fan-stacks/',
      'CREATE /index.php /',
      // PROJECT-IMAGES-1 R2 (OGCS ruling on the PTT duplicates) and COUNTRY-PAGES (OGCS country-page ruling): the duplicate pages go to their curated pages
      'CREATE /rt-portfolios/ptt-gsp3-fan-upgrade/ /all-projects/ptt-csp3/',
      'CREATE /rt-portfolios/ptt-gsp6-96-fan-ache-performance-upgrade/ /all-projects/pttcsp/',
      'CREATE /thailand-cooling-tower/ /cooling-tower-thailand/',
      // STAGING-AUDIT-REDIRECTS-1 (owner decisions 2026-10-11, OGCS rule 2): Singapore duplicate, /blog/, /tools/, six nested repair URLs
      'CREATE /cooling-tower-singapore/ /cooling-tower-construction-repair-in-singapore/',
      'CREATE /blog/ /tech-articles/',
      'CREATE /tools/ /resources/tools/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/crossflow-cooling-tower-repair-maintenance/ /crossflow-cooling-tower-repair-maintenance/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/counterflow-cooling-tower-repair-maintenance/ /counterflow-cooling-tower-repair-maintenance/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/wet-hybrid-dry-cooling-tower-repair/ /wet-hybrid-dry-cooling-tower-repair/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/low-drift-cooling-tower-solutions/ /low-drift-cooling-tower-solutions/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/emergency-cooling-tower-repair/ /emergency-cooling-tower-repair/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/cooling-tower-rebuilds-new-towers/ /cooling-tower-rebuilds-new-towers/',
      // OGCS Part 2: zero-click paginated /blog/ category archives
      'CREATE /blog/category/cooling-tower-fans/page/2/ /category/cooling-tower-fans/',
      'CREATE /blog/category/cooling-tower-fans/page/3/ /category/cooling-tower-fans/',
      'CREATE /blog/category/cooling-tower-fans/page/4/ /category/cooling-tower-fans/',
      'CREATE /blog/category/cooling-tower-fans/page/5/ /category/cooling-tower-fans/',
      'CREATE /blog/category/cooling-tower-fans/page/7/ /category/cooling-tower-fans/',
      'CREATE /blog/category/cooling-tower-fans/page/8/ /category/cooling-tower-fans/',
      // REDIRECTS-2 (owner decisions 2026-10-11, what ranks): the zero-click duplicates
      'CREATE /cooling-tower-resources/tools/ /resources/tools/',
      'CREATE /cooling-tower-brochures/ /resources/cooling-tower-brochures/',
      'CREATE /dry-soda-blasting/ /dry-soda-blast-cleaning-services-2/',
      'CREATE /cooling-tower-parts-2/ /cooling-tower-parts-online/',
      'CREATE /cooling-tower-usa/ /cooling-tower-construction-repair-in-united-states/',
      // HYBRID-RESTORE-1 (OGCS audit-workbook Part 3 + FBG-12): four more nested repair URLs and the old slug of the restored article
      'CREATE /cooling-tower-maintenance-repair-upgrade/crossflow-cooling-tower-repair/ /crossflow-cooling-tower-repair-maintenance/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/counterflow-cooling-tower-repair/ /counterflow-cooling-tower-repair-maintenance/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/low-drift-solutions/ /low-drift-cooling-tower-solutions/',
      'CREATE /cooling-tower-maintenance-repair-upgrade/cooling-tower-rebuild/ /cooling-tower-rebuilds-new-towers/',
      'CREATE /hybrid-cooling-tower-repair/ /hybrid-cooling-tower/',
    ])
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
    for(const r of seo){expect(r.meta,r.path).not.toMatch(/…$|\.\.\.$/);expect(r.meta.length,r.path).toBeGreaterThanOrEqual(70);expect(r.meta.length,r.path).toBeLessThanOrEqual(160)}
    expect(seo.filter(r=>r.meta_origin.includes('CT_COMPLETE_SENTENCE'))).toHaveLength(21) // COUNTRY-PAGES: - /thailand-cooling-tower/ (a 301 now)
    expect(new Set(seo.map(r=>r.meta.toLowerCase())).size).toBe(seo.length)
    expect(JSON.stringify(seo)).not.toMatch(/Japan Cooling Tower Institute/)
  })
  it('applies the R1.2 titles (Formula, Amarillo Gearbox, fan suffix) and writes the decided H1s to their heading slots',()=>{
    const seo=new Map(data('seo-fields.tsv').map(r=>[r.path,r.title]))
    expect(seo.get('/cooling-tower-efficiency-calculation/')).toBe('Cooling Tower Efficiency Calculation: Formula & Steps')
    expect(seo.get('/cooling-tower-blowdown-calculation/')).toBe('Cooling Tower Blowdown Calculation: Formula & Guide')
    expect(seo.get('/product-category/gearboxes/')).toBe('Amarillo Gearbox Replacement | Cooling Tower Gearbox Parts')
    expect(seo.get('/product/tuf-lite-iii-5000k-series-hub-fan-assemblies/')).toBe('TUF-LITE III - 5000K Series Hub Fan Assemblies | Cooling Tower Fans') // SEO-CONTENT-2.2 trimmed the fan suffix; the OGCS staging-audit copy rows (CP-08, 2026-10-11) restore it (GSC ranking terms)
    expect(data('h1-fields.tsv').map(r=>[r.path,r.via,r.h1]).slice(0,3)).toEqual([['/cooling-tower/','slot','New Cooling Tower Engineering & Construction'],['/product-category/gearboxes/','slot','Amarillo Cooling Tower Gearboxes'],['/product-category/drive-shafts-assemblies/','slot','Cooling Tower Couplings & Drive Shafts']])
    // Restored live bodies bring their live H1 (the record title article templates render); Round 5 adds the CT-ruled heading
    // of /cooling-tower-repair-service/ (claims-seo field h1).
    expect(data('h1-fields.tsv').filter(r=>r.via==='title').map(r=>r.path).sort()).toEqual(['/all-projects/pertonas-rapid/','/chiller-and-cooling-tower/','/cooling-tower-approach/','/cooling-tower-construction-repair-in-singapore/','/cooling-tower-construction-repair-in-united-states/','/cooling-tower-fill-media-replacement/','/cooling-tower-inspection-guide/','/cooling-tower-ph-control/','/cooling-tower-repair-service/','/dry-soda-blast-cleaning-services-2/'])
    // R5b adds the two OGCS-ruled location H1s (USA, Singapore; via=title, UPDATE until the batch writes them).
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
