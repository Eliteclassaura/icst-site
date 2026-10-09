import {readFileSync} from 'node:fs'
import path from 'node:path'
import {activeProductRoutes,productPrimaryMedia} from './Wave3Products'
import {salmonDocument,salmonRoutes,type SalmonDocument,type SalmonNode} from './salmon'
import {isPayloadContent} from '../content/runtime-read'
import {releaseLedger} from '../content/runtime-read'
import {deliverySrc} from './media-delivery'

export const homePartCategoryAuthority=[
  {key:'fan-stack',label:'Fan Stack',route:'/product-category/cooling-tower-fan-stacks/'},
  {key:'drive-shafts',label:'Drive Shafts',route:'/product-category/drive-shafts-assemblies/'},
  {key:'fill-media',label:'Fill Media',route:'/product-category/fill-media/'},
  {key:'frp-members',label:'FRP Members',route:'/product-category/frp-members/'},
  {key:'fan',label:'Fan',route:'/product-category/fans/'},
  {key:'gearbox',label:'Gearbox',route:'/product-category/gearboxes/'},
  {key:'motor',label:'Motor',route:'/product-category/motors/'},
  {key:'nozzle',label:'Nozzle',route:'/product-category/nozzles/'},
  {key:'tower-hardware',label:'Tower Hardware',route:'/product-category/tower-hardware/'},
] as const

export type HomePartCategoryKey=typeof homePartCategoryAuthority[number]['key']
export type HomePartRecord={route:string;sourceId:string;title:string;categories:HomePartCategoryKey[];featured:boolean;image:{src:string;alt:string;width:number;height:number}|null}
export type HomePartCatalogData={records:HomePartRecord[];categories:Array<{key:HomePartCategoryKey;label:string;route:string;count:number;sources:Array<{routeId:string;sha256:string}>}>}
type HomeLayoutNode={id:number;tag:string;src?:string;alt?:string;ref?:string;children?:HomeLayoutNode[]}

const sourceAt=(doc:SalmonDocument,ref:string):Array<SalmonNode>=>{
  const parts=ref.split('.')
  if(parts[0]!=='body')throw new Error(`Unrecognized homepage source ref: ${ref}`)
  const parents:SalmonNode[]=[]
  let nodes=doc.children
  for(const part of parts.slice(1)){
    const node=nodes[Number(part)]
    if(node===undefined)throw new Error(`Missing homepage source ref: ${ref}`)
    parents.push(node)
    nodes=typeof node==='string'?[]:node.children
  }
  return parents
}

const featuredFromModel=():Map<string,{src:string;alt:string}>=>{
  const home=salmonDocument(salmonRoutes().find(route=>route.routeId==='SALMON-pages-48')!)
  const model=JSON.parse(readFileSync(path.join(process.cwd(),'content/luxury/48.json'),'utf8')) as {tree:HomeLayoutNode[]}
  const grid=model.tree.find(node=>node.id===52)?.children?.find(node=>node.id===67)
  if(!grid?.children||grid.children.length!==8)throw new Error('Accepted homepage featured-part cohort changed')
  const featured=new Map<string,{src:string;alt:string}>()
  for(const card of grid.children){
    const image=card.children?.find(node=>node.tag==='img')
    const title=card.children?.find(node=>node.ref)
    if(!image?.src||!title?.ref)throw new Error(`Incomplete featured part ${card.id}`)
    const sourceProduct=sourceAt(home,title.ref).flatMap(node=>typeof node==='string'?[]:[node.attrs.class??'']).map(classes=>classes.match(/\be-loop-item-(\d+)\b/)?.[1]).find(Boolean)
    if(!sourceProduct)throw new Error(`Featured part ${card.id} has no source product ID`)
    featured.set(`SALMON-product-${sourceProduct}`,{src:image.src,alt:image.alt??''})
  }
  return featured
}

export function homePartCatalogData():HomePartCatalogData{
  const publicRoutes=activeProductRoutes()
  const byPath=new Map(publicRoutes.map(route=>[route.targetPath,route]))
  const byId=new Map(publicRoutes.map(route=>[route.routeId,route]))
  const release=releaseLedger() as {routes:Array<{path:string;routeId:string;state:string;export:boolean}>}
  const sourceRoutes=new Map(salmonRoutes().map(route=>[route.routeId,route]))
  const membership=new Map<string,Set<HomePartCategoryKey>>()
  const categories=homePartCategoryAuthority.map(category=>{
    const pages=release.routes.filter(row=>row.state==='PUBLIC'&&row.export&&(row.path===category.route||row.path.startsWith(`${category.route}page/`)))
    if(!pages.length||!pages.some(row=>row.path===category.route))throw new Error(`Missing public category authority: ${category.route}`)
    const members=new Set<string>()
    const sources=[]
    for(const page of pages){
      const route=sourceRoutes.get(page.routeId)
      if(!route)throw new Error(`Missing category source ${page.routeId}`)
      const doc=salmonDocument(route)
      sources.push({routeId:page.routeId,sha256:doc.sourceIdentity.sha256})
      for(const link of (doc as SalmonDocument & {links:Array<{href:string}>}).links){
        let target:string
        try{target=new URL(link.href,doc.sourceUrl).pathname}catch{continue}
        const product=byPath.get(target)
        if(!product)continue
        members.add(product.routeId)
        const tags=membership.get(product.routeId)??new Set<HomePartCategoryKey>()
        tags.add(category.key);membership.set(product.routeId,tags)
      }
    }
    return {key:category.key,label:category.label,route:category.route,count:members.size,sources}
  })
  const featured=featuredFromModel()
  // Payload runtime (R1B): a withdrawn featured product drops out; repository mode keeps the frozen gate.
  if(isPayloadContent())for(const id of [...featured.keys()])if(!byId.has(id))featured.delete(id)
  for(const id of featured.keys())if(!byId.has(id))throw new Error(`Featured part outside public product cohort: ${id}`)
  const ordered=[...featured.keys(),...publicRoutes.map(route=>route.routeId).filter(id=>!featured.has(id))]
  const records=ordered.map(id=>{
    const route=byId.get(id)!
    const doc=salmonDocument(route)
    const chosen=featured.get(id)
    const sourceMedia=chosen?null:productPrimaryMedia(doc)
    const image=chosen?{src:deliverySrc(chosen.src),alt:chosen.alt,width:600,height:600}:sourceMedia?{src:deliverySrc(sourceMedia.src),alt:sourceMedia.image.alt??'',width:sourceMedia.media.width!,height:sourceMedia.media.height!}:null
    return {route:route.targetPath,sourceId:id,title:doc.seo.h1[0]||doc.title,categories:[...(membership.get(id)??[])],featured:!!chosen,image}
  })
  if(isPayloadContent()){if(new Set(records.map(record=>record.route)).size!==records.length)throw new Error('Homepage parts catalog routes are not unique')}
  else if(records.length!==184||new Set(records.map(record=>record.route)).size!==184)throw new Error('Homepage parts catalog is not the 184-product public cohort') // CATALOG-FANS-1: 183 + the TUF-LITE IV family record
  return {records,categories}
}
