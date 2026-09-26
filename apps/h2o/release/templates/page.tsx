import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import AcceptedPage from '../../../accepted-page'
import {salmonDocument,releaseRoutes} from '../../../site/salmon'

type Row={path:string;routeId:string;export:boolean;state:string;indexable:boolean;canonical:string}
const rows=()=>JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')).routes as Row[]
export const dynamicParams=false
export const dynamic='error'
export function generateStaticParams(){return rows().filter(row=>row.export&&row.path!=='/search/').map(row=>({slug:row.path.split('/').filter(Boolean).map(decodeURIComponent)}))}
type Props={params:Promise<{slug?:string[]}>}
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const slug=(await params).slug??[]
  const key='/'+slug.join('/')+(slug.length?'/':'')
  const row=rows().find(candidate=>decodeURIComponent(candidate.path)===decodeURIComponent(key))
  if(!row)notFound()
  const source=releaseRoutes().find(candidate=>candidate.routeId===row.routeId)
  if(!source)notFound()
  const doc=salmonDocument(source)
  return {title:{absolute:doc.seo.title},description:doc.seo.meta.find(meta=>meta.name==='description')?.value,alternates:{canonical:row.canonical},robots:{index:row.indexable,follow:row.indexable}}
}
export default async function Page({params}:Props){
  const value=await params
  const requested='/'+(value.slug??[]).join('/')+((value.slug??[]).length?'/':'')
  const row=rows().find(candidate=>decodeURIComponent(candidate.path)===decodeURIComponent(requested))
  if(!row?.export)notFound()
  const source=releaseRoutes().find(candidate=>candidate.routeId===row.routeId)
  const sourceParams=source?{slug:source.targetPath.split('/').filter(Boolean).map(decodeURIComponent)}:value
  return <AcceptedPage params={Promise.resolve(sourceParams)} searchParams={Promise.resolve({})}/>
}
