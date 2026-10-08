import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {salmonDocument,releaseRouteFor,salmonRoutes} from '../../../site/salmon'
import {aliasReleaseDocument} from '../../../site/release-document'
import {SalmonCanonical,publicDescription,pagedDescription,pagedTitle,servedDescription,servedTitle} from '../../../site/SalmonCanonical'
import {SalmonFamilyPage,salmonFamilyFor} from '../../../site/SalmonFamilies'
import {ABOUT_ROUTE_ID,AboutComposition} from '../../../site/AboutComposition'
import {ArchivePage,isArchiveDocument} from '../../../site/ArchivePresentation'
import {LuxuryCanonical,luxuryIds} from '../../../site/LuxuryCanonical'
import {r4Builders} from '../../../site/r4/R4Pages'
import {R4PortfolioPage,R4_PORTFOLIO_ROUTE} from '../../../site/r4/R4Portfolio'
import {PartsIndex,partsHubPage} from '../../../site/Wave3Presentation'
import {R5ProductDetail} from '../../../site/r5/R5Product'
import {R5PartsFamilyPage,R5_PARTS_FAMILIES} from '../../../site/r5/R5PartsPages'
import {R5bLocationPage,r5bLocationHeroes} from '../../../site/r5b/R5bLocation'
import {LiveEnglishDetail,Wave4ArticleDetail,Wave4ArticleIndex,Wave4Library} from '../../../site/Wave4Presentation'
import {matchedWave4Article} from '../../../site/wave4'
import {EnglishServicePage,englishServiceForPath,englishServicePages} from '../../../site/EnglishServices'
import {connection} from 'next/server'
import {isEmptyArchivePage} from '../../../content/empty-archives'
import {isPayloadContent} from '../../../content/runtime-read'
import {LEGAL_PAGES,legalPageForPath} from '../../../site/legal-routes'
import {LegalPage,legalMetadata} from '../../../site/LegalPage'
import {EditorialPage,type EditorialDoc} from '../../../content/EditorialPage'
// Content bridge (payload content mode): the route and its document are resolved from Payload's published
// state per request (or the editor's draft in private preview), then rendered by the accepted dispatch below
// unchanged. Repository mode — tests, static release, plain dev — keeps the accepted behaviour exactly.
// Loaded lazily: the Payload bridge is never imported in repository mode (tests, static release).
const bridge=()=>import('../../../content/page-bridge')
const requestPathOf=(slug?:string[])=>'/'+(slug??[]).join('/')+((slug??[]).length?'/':'')
// The manifest lookup remains fail-closed. Runtime lookup accepts Salmon's original
// lowercase percent escapes as well as Next's equivalent uppercase encoded form.
export const dynamicParams=true
// Rendered per request: in payload content mode the page reads Payload and carries a per-request CSP nonce.
// (The static public release uses release/templates/page.tsx and is unaffected.)
export const dynamic='force-dynamic'
export function generateStaticParams():Array<{slug:string[]}> {
  if(isPayloadContent())return []
  return [...salmonRoutes().map(r=>({slug:r.targetPath.split('/').filter(Boolean).map(decodeURIComponent)})),...englishServicePages().map(service=>({slug:service.path.split('/').filter(Boolean)})),{slug:['resources']},...LEGAL_PAGES.filter(page=>page.path!=='/privacy-policy/').map(page=>({slug:page.path.split('/').filter(Boolean)}))]
}
type Params={params:Promise<{slug?:string[]}>;searchParams?:Promise<{q?:string;page?:string}>}
/**
 * SEO-FIX-1 (Codex staging crawl R1 (b), CT 2026-10-07): the parts hub's ?page=N (N ≥ 2) names its page in the title and
 * meta description, as the paginated archives already do ("… - Page N", "Page N: …"); the canonical stays the hub's own.
 */
export const pagedHubMetadata=(m:Metadata,page:number):Metadata=>{
  if(!(page>=2))return m
  const title=typeof m.title==='object'&&m.title&&'absolute' in m.title?m.title.absolute:typeof m.title==='string'?m.title:undefined
  return {...m,...(title?{title:{absolute:pagedTitle(title,page)}}:{}),...(typeof m.description==='string'?{description:pagedDescription(m.description,page)}:{})}
}
export async function generateMetadata({params,searchParams}:Params):Promise<Metadata>{
  // LEGAL-1: the four legal pages are code routes, answered before any release or Payload lookup
  const legal=legalPageForPath(requestPathOf((await params).slug))
  if(legal)return legalMetadata(legal)
  const base=await baseMetadata({params})
  if(requestPathOf((await params).slug)!=='/cooling-tower-parts-online/')return base
  const search=await searchParams
  return pagedHubMetadata(base,partsHubPage(typeof search?.q==='string'?search.q:'',search?.page))
}
async function baseMetadata({params}:Pick<Params,'params'>):Promise<Metadata>{
  // R2.4 R2: an empty archive's page N is a 404
  if(isEmptyArchivePage(requestPathOf((await params).slug)))return {robots:{index:false,follow:false}}
  if(isPayloadContent()){
    await connection()
    const {canonicalFor,resolvePublicPath,robotsFor}=await bridge()
    const resolved=await resolvePublicPath(requestPathOf((await params).slug))
    if(!resolved)return {robots:{index:false,follow:false}}
    const {record,preview}=resolved
    const robots=robotsFor(record,preview)
    // Locale Part B: the hreflang alternates the production sitemap lists for this page (reciprocal; none outside a served cluster).
    const languages=preview?undefined:(await import('../../../content/sitemap-response')).hreflangAlternatesFor(record.path)
    const alternatesOf=(r:typeof record)=>languages?{canonical:canonicalFor(r),languages}:{canonical:canonicalFor(r)}
    // R1B (Control Tower F2): the editable SEO fields of service and editorial records reach the metadata.
    if(record.family==='editorial'){const seo=(resolved.doc?.seo??{}) as {title?:string;description?:string};return {title:{absolute:(seo.title||record.title)+' | ICS'},description:seo.description||undefined,alternates:alternatesOf(record),robots}}
    if(record.family==='english-service'){const service=englishServiceForPath(record.path);return {title:{absolute:record.seo?.title||((service?.title??record.title)+' | ICS')},description:record.seo?.description||service?.lead,alternates:alternatesOf(record),robots}}
    const source=record.family==='alias'?salmonRoutes().find(route=>route.routeId===record.source?.aliasOf)??null:releaseRouteFor(resolved.dispatchPath.split('/').filter(Boolean).map(decodeURIComponent))
    if(!source)return {robots:{index:false,follow:false}}
    const doc=salmonDocument(source)
    if(record.family==='alias'&&(record.seo?.title||record.seo?.description))return {title:{absolute:record.seo?.title||doc.seo.title},description:record.seo?.description||publicDescription(doc),alternates:alternatesOf(record),robots}
    // R2.4: the served title and description (pagination included); the head's og/twitter tags mirror the same values.
    return {title:{absolute:servedTitle(doc)},description:servedDescription(doc),alternates:alternatesOf(record),robots}
  }
  const slug=(await params).slug
  const service=englishServiceForPath('/'+(slug??[]).join('/')+((slug??[]).length?'/':''))
  if(service)return {title:{absolute:service.title+' | ICS'},description:service.lead,alternates:{canonical:'https://h2ocooling.com'+service.path},robots:{index:false,follow:false}}
  if(slug?.length===1&&slug[0]==='resources'){
    const source=salmonRoutes().find(route=>route.routeId==='SALMON-pages-1761')
    if(!source)throw new Error('Wave 4 Resources source route missing')
    const doc=salmonDocument(source)
    return {title:{absolute:doc.seo.title},description:publicDescription(doc),alternates:{canonical:'https://h2ocooling.com/resources/'},robots:{index:false,follow:false}}
  }
  const row=releaseRouteFor(slug)
  if(!row)return {robots:{index:false,follow:false}}
  const doc=salmonDocument(row)
  return {title:{absolute:servedTitle(doc)},description:servedDescription(doc),alternates:{canonical:doc.seo.canonical[0]},robots:{index:false,follow:false}}
}
export default async function Page({params,searchParams}:Params){
  let slug=(await params).slug
  // R2.4 R2 (CT ruling 2026-10-05): page 2+ of an archive that lists nothing public answers 404, not an empty page
  if(isEmptyArchivePage(requestPathOf(slug)))notFound()
  const legalPage=legalPageForPath(requestPathOf(slug))
  if(legalPage)return <LegalPage page={legalPage}/>
  // An alias record (a second public address of an imported route, e.g. /author/timbozic/) renders its source
  // document at its own address and canonical.
  let alias:{source:string;path:string;canonical:string}|undefined
  let serviceSeo:{title?:string|null;description?:string|null}|undefined
  if(isPayloadContent()){
    await connection()
    const {canonicalFor,resolvePublicPath}=await bridge()
    const resolved=await resolvePublicPath(requestPathOf(slug))
    if(!resolved)notFound()
    if(resolved.record.family==='editorial')return <EditorialPage doc={resolved.doc as unknown as EditorialDoc}/>
    if(resolved.record.family==='english-service')serviceSeo=resolved.record.seo??undefined
    if(resolved.record.family==='alias'&&resolved.record.source?.aliasOf&&resolved.record.path!=='/resources/')alias={source:resolved.record.source.aliasOf,path:resolved.record.path,canonical:canonicalFor(resolved.record)}
    slug=resolved.dispatchPath.split('/').filter(Boolean).map(decodeURIComponent)
  }
  const service=englishServiceForPath('/'+(slug??[]).join('/')+((slug??[]).length?'/':''))
  // R2.4 (item d): the service's head carries the same title and description as its metadata (the record's SEO fields in
  // payload mode, the service defaults otherwise).
  if(service)return <EnglishServicePage service={service} head={{title:serviceSeo?.title||service.title+' | ICS',description:serviceSeo?.description||service.lead}}/>
  if(slug?.length===1&&slug[0]==='resources'){
    const source=salmonRoutes().find(route=>route.routeId==='SALMON-pages-1761')
    if(!source)notFound()
    return <Wave4Library doc={salmonDocument(source)}/>
  }
  const aliasSource=alias?salmonRoutes().find(route=>route.routeId===alias.source):undefined
  const row=aliasSource??releaseRouteFor(slug)
  if(!row)notFound()
  const doc=alias&&aliasSource?aliasReleaseDocument(salmonDocument(aliasSource),alias.path,alias.canonical):salmonDocument(row)
  // Design R3 (CT 2026-10-06): the owner's About design replaces the transitional Salmon about family on this route.
  if(doc.routeId===ABOUT_ROUTE_ID&&!alias)return <AboutComposition doc={doc}/>
  // Design R4 (CT GO 2026-10-07): the owner's 7-OCT designs replace the earlier presentation (incl. the Dry Soda Salmon family).
  if(r4Builders[doc.routeId]&&!alias)return <LuxuryCanonical doc={doc}/>
  // Design R5b (CT 2026-10-07): the location template for the LIVE-family location pages.
  if(r5bLocationHeroes[doc.targetPath]&&!alias)return <R5bLocationPage doc={doc}/>
  if(doc.routeId===R4_PORTFOLIO_ROUTE&&!alias)return <R4PortfolioPage doc={doc}/>
  const family=salmonFamilyFor(doc)
  // Design R5a (CT GO 2026-10-07): the parts category and series families render on the R5 parts system.
  if(family&&R5_PARTS_FAMILIES.has(family.family)&&!alias)return <R5PartsFamilyPage doc={doc}/>
  if(family)return <SalmonFamilyPage doc={doc} config={family}/>
  if(isArchiveDocument(doc))return <ArchivePage doc={doc}/>
  if(doc.routeId.startsWith('LIVE-'))return <LiveEnglishDetail doc={doc}/>
  if(doc.targetPath==='/cooling-tower-parts-online/'){
    const search=await searchParams??{}
    return <PartsIndex doc={doc} query={typeof search.q==='string'?search.q:''} pageNumber={partsHubPage(typeof search.q==='string'?search.q:'',search.page)}/>
  }
  // Design R5a (owner-approved product detail proposal, CT 2026-10-07).
  if(doc.type==='product'&&doc.routeId.startsWith('SALMON-product-'))return <R5ProductDetail doc={doc}/>
  if(['SALMON-pages-1797','SALMON-pages-1870'].includes(doc.routeId))return <Wave4Library doc={doc}/>
  if(doc.routeId==='SALMON-pages-1875')return <Wave4ArticleIndex doc={doc}/>
  if(matchedWave4Article(doc))return <Wave4ArticleDetail doc={doc}/>
  return luxuryIds.has(doc.routeId)?<LuxuryCanonical doc={doc}/>:<SalmonCanonical doc={doc}/>
}
