import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {salmonDocument,salmonRouteFor,salmonRoutes} from '../../../site/salmon'
import {SalmonCanonical} from '../../../site/SalmonCanonical'
import {LuxuryCanonical,luxuryIds} from '../../../site/LuxuryCanonical'
// The manifest lookup remains fail-closed. Runtime lookup accepts Salmon's original
// lowercase percent escapes as well as Next's equivalent uppercase encoded form.
export const dynamicParams=true
export function generateStaticParams():Array<{slug:string[]}> {
  return salmonRoutes().map(r=>({slug:r.targetPath.split('/').filter(Boolean).map(decodeURIComponent)}))
}
type Params={params:Promise<{slug?:string[]}>}
export async function generateMetadata({params}:Params):Promise<Metadata>{
  const row=salmonRouteFor((await params).slug)
  if(!row)return {robots:{index:false,follow:false}}
  const doc=salmonDocument(row)
  return {title:{absolute:doc.seo.title},alternates:{canonical:doc.seo.canonical[0]},robots:{index:false,follow:false}}
}
export default async function Page({params}:Params){
  const row=salmonRouteFor((await params).slug)
  if(!row)notFound()
  const doc=salmonDocument(row)
  return luxuryIds.has(doc.routeId)?<LuxuryCanonical doc={doc}/>:<SalmonCanonical doc={doc}/>
}
