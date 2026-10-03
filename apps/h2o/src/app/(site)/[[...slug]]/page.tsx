import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {salmonDocument,releaseRouteFor,salmonRoutes} from '../../../site/salmon'
import {aliasReleaseDocument} from '../../../site/release-document'
import {SalmonCanonical} from '../../../site/SalmonCanonical'
import {SalmonFamilyPage,salmonFamilyFor} from '../../../site/SalmonFamilies'
import {ArchivePage,isArchiveDocument} from '../../../site/ArchivePresentation'
import {LuxuryCanonical,luxuryIds} from '../../../site/LuxuryCanonical'
import {PartsIndex,ProductDetail} from '../../../site/Wave3Presentation'
import {LiveEnglishDetail,Wave4ArticleDetail,Wave4ArticleIndex,Wave4Library} from '../../../site/Wave4Presentation'
import {matchedWave4Article} from '../../../site/wave4'
import {EnglishServicePage,englishServiceForPath,englishServicePages} from '../../../site/EnglishServices'
import {articleMetadataTitle} from '../../../site/article-metadata'
import {connection} from 'next/server'
import {isPayloadContent} from '../../../content/runtime-read'
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
  return [...salmonRoutes().map(r=>({slug:r.targetPath.split('/').filter(Boolean).map(decodeURIComponent)})),...englishServicePages().map(service=>({slug:service.path.split('/').filter(Boolean)})),{slug:['resources']}]
}
type Params={params:Promise<{slug?:string[]}>;searchParams?:Promise<{q?:string;page?:string}>}
export async function generateMetadata({params}:Params):Promise<Metadata>{
  if(isPayloadContent()){
    await connection()
    const {canonicalFor,resolvePublicPath,robotsFor}=await bridge()
    const resolved=await resolvePublicPath(requestPathOf((await params).slug))
    if(!resolved)return {robots:{index:false,follow:false}}
    const {record,preview}=resolved
    const robots=robotsFor(record,preview)
    // R1B (Control Tower F2): the editable SEO fields of service and editorial records reach the metadata.
    if(record.family==='editorial'){const seo=(resolved.doc?.seo??{}) as {title?:string;description?:string};return {title:{absolute:(seo.title||record.title)+' | ICS'},description:seo.description||undefined,alternates:{canonical:canonicalFor(record)},robots}}
    if(record.family==='english-service'){const service=englishServiceForPath(record.path);return {title:{absolute:record.seo?.title||((service?.title??record.title)+' | ICS')},description:record.seo?.description||service?.lead,alternates:{canonical:canonicalFor(record)},robots}}
    const source=record.family==='alias'?salmonRoutes().find(route=>route.routeId===record.source?.aliasOf)??null:releaseRouteFor(resolved.dispatchPath.split('/').filter(Boolean).map(decodeURIComponent))
    if(!source)return {robots:{index:false,follow:false}}
    const doc=salmonDocument(source)
    if(record.family==='alias'&&(record.seo?.title||record.seo?.description))return {title:{absolute:record.seo?.title||doc.seo.title},description:record.seo?.description||doc.seo.meta.find(meta=>meta.name==='description')?.value,alternates:{canonical:canonicalFor(record)},robots}
    return {title:{absolute:articleMetadataTitle(doc)},description:doc.seo.meta.find(meta=>meta.name==='description')?.value,alternates:{canonical:canonicalFor(record)},robots}
  }
  const slug=(await params).slug
  const service=englishServiceForPath('/'+(slug??[]).join('/')+((slug??[]).length?'/':''))
  if(service)return {title:{absolute:service.title+' | ICS'},description:service.lead,alternates:{canonical:'https://h2ocooling.com'+service.path},robots:{index:false,follow:false}}
  if(slug?.length===1&&slug[0]==='resources'){
    const source=salmonRoutes().find(route=>route.routeId==='SALMON-pages-1761')
    if(!source)throw new Error('Wave 4 Resources source route missing')
    const doc=salmonDocument(source)
    return {title:{absolute:doc.seo.title},description:doc.seo.meta.find(meta=>meta.name==='description')?.value,alternates:{canonical:'https://h2ocooling.com/resources/'},robots:{index:false,follow:false}}
  }
  const row=releaseRouteFor(slug)
  if(!row)return {robots:{index:false,follow:false}}
  const doc=salmonDocument(row)
  return {title:{absolute:articleMetadataTitle(doc)},alternates:{canonical:doc.seo.canonical[0]},robots:{index:false,follow:false}}
}
export default async function Page({params,searchParams}:Params){
  let slug=(await params).slug
  // An alias record (a second public address of an imported route, e.g. /author/timbozic/) renders its source
  // document at its own address and canonical.
  let alias:{source:string;path:string;canonical:string}|undefined
  if(isPayloadContent()){
    await connection()
    const {canonicalFor,resolvePublicPath}=await bridge()
    const resolved=await resolvePublicPath(requestPathOf(slug))
    if(!resolved)notFound()
    if(resolved.record.family==='editorial')return <EditorialPage doc={resolved.doc as unknown as EditorialDoc}/>
    if(resolved.record.family==='alias'&&resolved.record.source?.aliasOf&&resolved.record.path!=='/resources/')alias={source:resolved.record.source.aliasOf,path:resolved.record.path,canonical:canonicalFor(resolved.record)}
    slug=resolved.dispatchPath.split('/').filter(Boolean).map(decodeURIComponent)
  }
  const service=englishServiceForPath('/'+(slug??[]).join('/')+((slug??[]).length?'/':''))
  if(service)return <EnglishServicePage service={service}/>
  if(slug?.length===1&&slug[0]==='resources'){
    const source=salmonRoutes().find(route=>route.routeId==='SALMON-pages-1761')
    if(!source)notFound()
    return <Wave4Library doc={salmonDocument(source)}/>
  }
  const aliasSource=alias?salmonRoutes().find(route=>route.routeId===alias.source):undefined
  const row=aliasSource??releaseRouteFor(slug)
  if(!row)notFound()
  const doc=alias&&aliasSource?aliasReleaseDocument(salmonDocument(aliasSource),alias.path,alias.canonical):salmonDocument(row)
  const family=salmonFamilyFor(doc)
  if(family)return <SalmonFamilyPage doc={doc} config={family}/>
  if(isArchiveDocument(doc))return <ArchivePage doc={doc}/>
  if(doc.routeId.startsWith('LIVE-'))return <LiveEnglishDetail doc={doc}/>
  if(doc.targetPath==='/cooling-tower-parts-online/'){
    const search=await searchParams??{}
    return <PartsIndex doc={doc} query={typeof search.q==='string'?search.q:''} pageNumber={Number(search.page)||1}/>
  }
  if(doc.type==='product'&&doc.routeId.startsWith('SALMON-product-'))return <ProductDetail doc={doc}/>
  if(['SALMON-pages-1797','SALMON-pages-1870'].includes(doc.routeId))return <Wave4Library doc={doc}/>
  if(doc.routeId==='SALMON-pages-1875')return <Wave4ArticleIndex doc={doc}/>
  if(matchedWave4Article(doc))return <Wave4ArticleDetail doc={doc}/>
  return luxuryIds.has(doc.routeId)?<LuxuryCanonical doc={doc}/>:<SalmonCanonical doc={doc}/>
}
