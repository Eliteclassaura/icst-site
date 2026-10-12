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
import {PartsIndex} from '../Wave3Presentation'
import {R5PartsFamilyPage,R5_PARTS_FAMILIES} from '../r5/R5PartsPages'
import {R5ProductDetail} from '../r5/R5Product'
import {SalmonFamilyPage,salmonFamilyFor} from '../SalmonFamilies'
import {LuxuryCanonical,luxuryIds} from '../LuxuryCanonical'
import {SalmonCanonical} from '../SalmonCanonical'
import {r4Builders} from '../r4/R4Pages'
import {R4PortfolioPage,R4_PORTFOLIO_ROUTE} from '../r4/R4Portfolio'
import {R5bLocationPage,r5bLocationHeroes} from '../r5b/R5bLocation'

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
// SEO-CONTENT-1: the decided H1 headings (h1-fields.tsv, via=slot) are written by the same apply, so the composed page carries them.
const h1Slots=readFileSync(path.join(APP,'ops/seo-pass/data/h1-fields.tsv'),'utf8').trimEnd().split('\n').slice(1).map(l=>l.split('\t')).filter(c=>c[2]==='slot').map(c=>({path:decoded(c[0]!),h1:c[4]!}))
const rowFor=(p:string)=>ledger.routes.find(r=>decoded(r.path)===p&&r.sourceFile&&/^(?:SALMON|LIVE)-/.test(r.routeId))
const valueOf=<T,>(table:Record<string,T>,p:string)=>Object.entries(table).find(([k])=>decoded(k)===p)?.[1]

/** R5b: the one seo-fields row this batch writes (the /cooling-tower/ meta description, OGCS commercial row 2); the apply's seo phase puts it on the record. */
const seoRows=readFileSync(path.join(APP,'ops/seo-pass/data/seo-fields.tsv'),'utf8').split('\n').map(l=>l.split('\t'))
const seoHead=seoRows[0]!
const seoWritten=(p:string)=>{const row=seoRows.find(c=>decoded(c[0]!)===p&&String(c[seoHead.indexOf('meta_origin')]).includes('OGCS_R5B_COMMERCIAL'));return row?{description:row[seoHead.indexOf('meta')]}:null}

/** The page as Payload composes it after the R2.2 apply (or, with `batch` false, before it), rendered by the catch-all's template dispatch. */
const cache=new Map<string,string>()
const pageAfterApply=(p:string,batch=true):string=>{
  const hit=cache.get(p+batch);if(hit!==undefined)return hit
  const row=rowFor(p)!
  const document=storedDocument(row as never)
  const slots=(extractSlots(document,{productIds:products}) as ContentSlot[]).map(s=>({...s}))
  if(batch)for(const f of valueOf(fixes,p)?.slots??[])(slots.find(s=>s.key===f.key) as unknown as Record<string,unknown>)[f.field]=f.after
  const h1=batch?h1Slots.find(x=>x.path===p):undefined
  if(h1){const slot=slots.find(s=>s.kind==='heading'&&s.tag==='h1');if(slot)slot.heading=h1.h1}
  const r=batch?valueOf(restored,p):undefined
  const record={routeId:row.routeId,path:row.path,family:row.routeId.startsWith('LIVE-')?'live':'salmon',title:r?.h1??String(document.title??''),document,slots,restoredSections:r?.groups??null,seo:batch?seoWritten(p):null} as RouteRecord
  const doc=repairDocumentText(composePublicDocument(record) as unknown as SalmonDocument)
  const family=salmonFamilyFor(doc)
  // The catch-all's dispatch order: Design R4 compositions first (they supersede the Salmon families on their routes), then the
  // Design R5a parts families and product detail.
  const el=r4Builders[doc.routeId]?<LuxuryCanonical doc={doc}/>:doc.routeId===R4_PORTFOLIO_ROUTE?<R4PortfolioPage doc={doc}/>:r5bLocationHeroes[doc.targetPath]?<R5bLocationPage doc={doc}/>:family&&R5_PARTS_FAMILIES.has(family.family)?<R5PartsFamilyPage doc={doc}/>:family?<SalmonFamilyPage doc={doc} config={family}/>:isArchiveDocument(doc)?<ArchivePage doc={doc}/>:doc.routeId.startsWith('LIVE-')?<LiveEnglishDetail doc={doc}/>:doc.targetPath==='/cooling-tower-parts-online/'?<PartsIndex doc={doc}/>:doc.type==='product'&&doc.routeId.startsWith('SALMON-product-')?<R5ProductDetail doc={doc}/>:matchedWave4Article(doc)?<Wave4ArticleDetail doc={doc}/>:luxuryIds.has(doc.routeId)?<LuxuryCanonical doc={doc}/>:<SalmonCanonical doc={doc}/>
  const text=pageText(renderToStaticMarkup(el))
  cache.set(p+batch,text)
  return text
}

describe('R2.2 conformance on the composed pages (mock apply)',()=>{
  it('every page in the list is a public imported record',()=>{
    for(const c of [...conformance.absent,...conformance.present])expect(rowFor(c.path),c.path).toBeDefined()
    expect(conformance.absent.length).toBeGreaterThan(200)
    // 11 owner-restored strings, the 10 CLAIMS-R2 Home wordings (CT 2026-10-06), the 11 R4 wordings (R4C-01…11, CT 2026-10-07) and the All Projects R4 lead line (CS093)
    // R5b adds 40 (the OGCS R5b wordings: location, Disaster Recovery, Thailand and the four FAQ answers); SEO-CONTENT-1 adds 15: the ruled replacement wordings (mixed product lines, ALU, PETRONAS and BacMan cards, the approach table cell, the algae CTA)
    expect(conformance.present).toHaveLength(403) // PROJECT-IMAGES-1 R2: - 1 (SC1-PT-pttcsp-title quoted the full title that only the historical portfolio page's directory entry carried; the project card shows its curated short title "PTT GSP", project-titles.json); POSTLAUNCH-WEB-1: + 1 (CF2-03); CATALOG-FANS-2: + 4 (Howden HWD-01/02, HWS-01/02); CLIENT-FIX-1: + 7 (OGCS rows CF1-01..03, 05..08; the heading CF1-04 is pinned by client-fix-1.test); SEO-CONTENT-2.3: pre-launch rows; SEO-CONTENT-2.2: + 102 windows (team audit, OEM, project cards; excerpt-truncated windows dropped); SEO-CONTENT-2.1: + 21 windows (tranche C addendum); // round 3 piece C: +46 windows (HVAC tranche C; 83 archive/tag-excerpt and non-segmenting windows dropped: excerpts are truncated by the templates, the absent checks stay); piece B adds 41 (tranche B, approach range); SC1-A-032's present row is superseded by AR-03 // round 2 adds 88 (tranche A/B, OEM/stock, BacMan paragraph)
  })
  it('the check is live: before the batch, the ruled strings are on their pages',()=>{
    // SEO-CONTENT-1: the SC1-P2-ACCEPT rows assert "no HVAC" on every product page; they hold before the batch on the pages that never had any.
    const acceptRows=conformance.absent.filter(c=>c.row==='SC1-P2-ACCEPT')
    expect(acceptRows).toHaveLength(181)
    expect(acceptRows.filter(c=>pageAfterApply(c.path,false).includes(c.text)).length).toBeGreaterThanOrEqual(100)
    const notBefore=conformance.absent.filter(c=>c.row!=='SC1-P2-ACCEPT').filter(c=>!pageAfterApply(c.path,false).includes(c.text)).map(c=>c.row)
    // The four registry strings are already corrected by R2.1 (compose); five sweep strings are produced by an earlier edit on
    // the same element (the Locale Part B removal next to them), so they do not exist in the imported text either. CLAIMS-R2 rows
    // 05, 08 and 09 reword text that exists only after an earlier edit ("Our global team" → "Our team", CS088, CS089).
    // R4C-11 rewords a restored-section heading, which exists only once the batch writes the restored sections.
    // R5B-L35b and R5B-L38 are registry overrides, already corrected by compose (the Institutional Facilities card text and the Thailand phone).
    // HYBRID-RESTORE-1.1: SC1-B-051 ("Large HVAC plants" on the restored /hybrid-cooling-tower/ article) joins this list: the alias address renders the repository article, and the row's find text is not on that page before the batch
    // ARTICLE-LAYOUT-1: the article deck and cards now show the page's description, so D4-4's string is on its page before the batch too.
    expect(notBefore.sort()).toEqual(["C4", "C4", "CS050", "CS061", "CS062", "CS065", "CS068", "CS072", "CS077+CS077+CS077", "CS084", "CS098", "D3-12", "D3-13", "D3-14", "D4-1", "D4-10", "D4-11", "D4-2", "D4-3", "D4-5", "D4-6", "D4-7", "D4-8", "D4-9", "R2L10-05", "R2L10-08", "R2L10-09", "R4C-11", "R5B-L35b", "R5B-L38", "SC1-A-001", "SC1-A-001", "SC1-A-001", "SC1-A-001", "SC1-A-003", "SC1-A-039", "SC1-A-040", "SC1-A-045", "SC1-A-HVAC-CLASS10000", "SC1-B-012", "SC1-B-013", "SC1-B-028", "SC1-B-051", "SC1-B-AR-03", "SC1-B-AR-05", "SC1-C-010", "SC1-C-011", "SC1-C-018", "SC1-C-018", "SC1-C-020", "SC1-C-021", "SC1-C-022", "SC1-C-023", "SC1-C-025", "SC1-C-025", "SC1-C-026", "SC1-C-026", "SC1-C-027", "SC1-C-029", "SC1-C-030", "SC1-C-031", "SC1-C-032", "SC1-C-033", "SC1-C-033", "SC1-C-034", "SC1-C-034", "SC1-C-035", "SC1-C-036", "SC1-C-037", "SC1-C-038", "SC1-C-039", "SC1-C-040", "SC1-C-041", "SC1-C-042", "SC1-C-043", "SC1-C-044", "SC1-C-045", "SC1-C-046", "SC1-C-046", "SC1-C-047", "SC1-C-047", "SC1-C-048", "SC1-C-049", "SC1-C-050", "SC1-C-051", "SC1-C-052", "SC1-C-053", "SC1-C-054", "SC1-C-055", "SC1-C-056", "SC1-C-057", "SC1-C-058", "SC1-C-059", "SC1-C-086", "SC1-C-086", "SC1-C-089", "SC1-C-089", "SC1-C-103", "SC1-C-279", "SC1-C-280", "SC1-C-281", "SC1-C-282", "SC1-C-283", "SC1-C-284", "SC1-C-285", "SC1-C-286", "SC1-C-287", "SC1-C-288", "SC1-C-289", "SC1-C-289", "SC1-C-290", "SC1-C-290", "SC1-C-291", "SC1-C-292", "SC1-C-293", "SC1-C-294", "SC1-C-295", "SC1-C-296", "SC1-C-297", "SC1-C-297", "SC1-C-298", "SC1-C-298", "SC1-C-299", "SC1-C-300", "SC1-CA-04", "SC1-CA-15", "SC1-CA-16", "SC1-CA-17", "SC1-L-01", "SC1-P2-APPROACH", "SC1-P2-X", "SC1-PT-bacman-1-2-title", "SC1-PT-cawayan-bacman-3-title", "SC1-PT-cooling-tower-disaster-recovery-title", "SC1-PT-cooling-tower-replacement-title", "SC1-PT-edc-n2n-relocation-project-title", "SC1-PT-edc-title", "SC1-PT-empire-farms-title", "SC1-PT-kbr-title", "SC1-PT-lanxess-title", "SC1-PT-mak-ban-6-title", "SC1-PT-patuha-title", "SC1-PT-ptt-csp3-title", "SC1-PT-pttcsp-title", "SC1-PT-pvc-plant-freeport-texas-title", "SC1-PT-thailand-projects-meta", "SC1-PT-thailand-projects-title", "SC1-TA-004", "SC1-TA-022", "SC1-TA-044", "SC1-TA-069"])
    // Round 3 piece C: the archive, tag and locale excerpt rows (SC1-C-0xx archive/tag cards, 2xx/3xx locale cards) hold windows the excerpt templates truncate, so they do not exist verbatim before the batch either; the absent check after the batch is unchanged
    // Round 2: SC1-A-001 (four strings) and SC1-A-003 and SC1-A-HVAC-CLASS10000 are registry overrides, already applied by compose; SC1-A-039/040/045 are
    // restored-section text (exist only once the batch writes the restored sections); SC1-L-01's second row asserts "OEM part distribution" absent from the Malaysia page.
    // SC1-P2-APPROACH is a restored-section table cell (exists only once the batch writes the restored sections, like R4C-11); the one SC1-P2-X row
    // is the high-efficiency-fill bullet "Commercial HVAC cooling towers", which the import renders as "Product compatibility: commercial HVAC cooling towers"
    // (src/site/public-text.ts) until the batch empties the element.
    // QA-FIX-1 (OGCS rows QF1-01, 06-21): the SC1-PT-*-title/meta rows and SC1-TA-004 quote the lowercase /all-projects/ card titles and the "Boa Thank" spelling, which the card view now corrects at render time, so those strings are not on the page before the batch either (16 + 1 rows).
    // QUICK-WINS-1 (CT 2026-10-08): the rows below that quote raw markup (WPBakery shortcodes on the brochures/tools pages: CS061, CS062, D3-12…14;
    // LaTeX on the thermography and performance-curve articles: D4-1…11) no longer print it, so those literal strings are not on the page before the batch either.
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

/** CLIENT-FIX-1 (client feedback, OGCS rows CF1-01..08): the corrected claims never reappear on any public page. A page is checked when its source
 * document holds any banned phrase; each must be clean after the batch, and the check is live (the same pages carry it before the batch). */
describe('CLIENT-FIX-1 banned phrases',()=>{
  const BANNED:RegExp[]=[
    /blower wheel/i,
    /chiller plant and pumps/i,
    /variable speed drives, drift eliminators,? and optimized airflow/i,
    // stainless steel offered as a tower structure material (basins, hubs and fasteners are not)
    /\bFRP, stainless steel, (?:concrete|and HDPE)/i,
    /(?:concrete|wood), or stainless steel based on service conditions/i,
    /Stainless steel cooling towers are widely used/i,
  ]
  const candidates=ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export&&r.sourceFile&&/^(?:SALMON|LIVE)-/.test(r.routeId)).filter(r=>{
    const doc=JSON.parse(readFileSync(path.join(APP,'content/salmon',r.sourceFile!),'utf8')) as {text?:string}
    return BANNED.some(re=>re.test(String(doc.text??'')))
  })
  it('are found on the four corrected pages before the batch and on no public page after it',()=>{
    const paths=candidates.map(r=>decoded(r.path))
    for(const must of ['/cooling-tower-replacement/','/cooling-tower/','/new-cooling-towers/','/build-new-cooling-tower/'])expect(paths,must).toContain(must)
    for(const p of paths){
      expect(BANNED.some(re=>re.test(pageAfterApply(p,false))),`${p} carries a banned phrase before the batch`).toBe(true)
      expect(BANNED.filter(re=>re.test(pageAfterApply(p))).map(String),p).toEqual([])
    }
  },600000)
  it('the /cooling-tower/ structure-material card is Wood, not Stainless Steel',()=>{
    const page=pageAfterApply('/cooling-tower/')
    expect(page).toContain('Wood cooling towers are widely used')
    expect(page).not.toMatch(/Stainless Steel\s+Stainless steel cooling towers/)
  },300000)
})
