import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {salmonDocument,releaseRouteFor,salmonRoutes} from '../../../site/salmon'
import {SalmonCanonical} from '../../../site/SalmonCanonical'
import {LuxuryCanonical,luxuryIds} from '../../../site/LuxuryCanonical'
import {PartsIndex,ProductDetail} from '../../../site/Wave3Presentation'
import {LiveEnglishDetail,Wave4ArticleDetail,Wave4ArticleIndex,Wave4Library} from '../../../site/Wave4Presentation'
import {matchedWave4Article} from '../../../site/wave4'
import {EnglishServicePage,englishServiceForPath,englishServicePages} from '../../../site/EnglishServices'
import {articleMetadataTitle} from '../../../site/article-metadata'
// The manifest lookup remains fail-closed. Runtime lookup accepts Salmon's original
// lowercase percent escapes as well as Next's equivalent uppercase encoded form.
export const dynamicParams=true
export function generateStaticParams():Array<{slug:string[]}> {
  return [...salmonRoutes().map(r=>({slug:r.targetPath.split('/').filter(Boolean).map(decodeURIComponent)})),...englishServicePages().map(service=>({slug:service.path.split('/').filter(Boolean)})),{slug:['resources']}]
}
type Params={params:Promise<{slug?:string[]}>;searchParams?:Promise<{q?:string;page?:string}>}
export async function generateMetadata({params}:Params):Promise<Metadata>{
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
  const slug=(await params).slug
  const service=englishServiceForPath('/'+(slug??[]).join('/')+((slug??[]).length?'/':''))
  if(service)return <EnglishServicePage service={service}/>
  if(slug?.length===1&&slug[0]==='resources'){
    const source=salmonRoutes().find(route=>route.routeId==='SALMON-pages-1761')
    if(!source)notFound()
    return <Wave4Library doc={salmonDocument(source)}/>
  }
  const row=releaseRouteFor(slug)
  if(!row)notFound()
  const doc=salmonDocument(row)
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
