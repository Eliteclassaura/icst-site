import {salmonDocument,salmonMedia,salmonMediaPath,salmonNodeText,salmonRoutes,type SalmonDocument,type SalmonNode,type SalmonRoute} from './salmon'
import {isPayloadContent,releaseLedger} from '../content/runtime-read'

let activeCache:SalmonRoute[]|undefined
const identityCache=new Map<string,string>()
export const activeProductRoutes=():SalmonRoute[]=>{
  // Payload runtime (R1B): the active cohort is the currently PUBLIC product set of the release (withdrawals
  // allowed); identity/uniqueness still hold. Repository mode keeps the frozen 183-product baseline gate.
  if(isPayloadContent()){
    const ledger=releaseLedger() as {routes:Array<{routeId:string;state:string}>}
    const publicIds=new Set(ledger.routes.filter(r=>r.state==='PUBLIC').map(r=>r.routeId))
    const rows=salmonRoutes().filter(route=>/^SALMON-product-[0-9]+$/.test(route.routeId)&&/^\/product\/[^/]+\/$/.test(route.targetPath)&&publicIds.has(route.routeId))
    if(new Set(rows.map(row=>row.targetPath)).size!==rows.length||new Set(rows.map(row=>row.routeId)).size!==rows.length)throw new Error('Wave 3 active product identities are not unique')
    return rows
  }
  const rows=activeCache??salmonRoutes().filter(route=>/^SALMON-product-[0-9]+$/.test(route.routeId)&&/^\/product\/[^/]+\/$/.test(route.targetPath))
  // CATALOG-FANS-1: 183 imported product routes + the Hudson TUF-LITE IV family record (OGCS Phase 1)
  const COHORT=184
  if(rows.length!==COHORT||new Set(rows.map(row=>row.targetPath)).size!==COHORT||new Set(rows.map(row=>row.routeId)).size!==COHORT)throw new Error('Wave 3 active product cohort changed')
  activeCache=rows
  return activeCache
}
export const productSlug=(doc:SalmonDocument):string|undefined=>doc.targetPath.match(/^\/product\/([^/]+)\/$/)?.[1]
export const productIdentityValid=(doc:SalmonDocument):boolean=>{
  const route=activeProductRoutes().find(row=>row.routeId===doc.routeId&&row.targetPath===doc.targetPath&&row.sourceUrl===doc.sourceUrl)
  if(!route||!productSlug(doc))return false
  if(!identityCache.has(route.routeId))identityCache.set(route.routeId,salmonDocument(route).sourceIdentity.sha256)
  return identityCache.get(route.routeId)===doc.sourceIdentity.sha256
}

export type ProductPanel={kind:'features'|'specifications'|'literature'|'additional'|'description';nodes:SalmonNode[]}
const panelKinds:Record<string,ProductPanel['kind']>={
  'tab-wpt-4879':'features',
  'tab-wpt-4877':'specifications',
  'tab-wpt-4875':'literature',
  'tab-product-literature':'literature',
  'tab-wpt-4881':'additional',
  'tab-description':'description',
  'tab-specifications':'specifications',
}
const walk=(nodes:SalmonNode[],visit:(node:Exclude<SalmonNode,string>)=>void):void=>{
  for(const node of nodes)if(typeof node!=='string'){visit(node);walk(node.children,visit)}
}
export const productSummary=(doc:SalmonDocument):SalmonNode[]=>{
  let found:SalmonNode[]=[]
  walk(doc.children,node=>{if(!found.length&&node.attrs.class?.split(/\s+/).includes('woocommerce-product-details__short-description'))found=node.children})
  return found
}
export const productPanels=(doc:SalmonDocument):ProductPanel[]=>{
  const result:ProductPanel[]=[]
  walk(doc.children,node=>{
    const kind=panelKinds[node.attrs.id]
    const text=salmonNodeText(node).trim().replace(/\s+/g,' ')
    if(kind&&text&&!(kind==='additional'&&/^(?:Additional information\s*)?none$/i.test(text)))result.push({kind,nodes:node.children})
  })
  return result
}
export const productRelated=(doc:SalmonDocument):SalmonRoute[]=>{
  const paths=new Set<string>()
  walk(doc.children,node=>{
    if(node.tag!=='a'||!node.attrs.href)return
    try{const url=new URL(node.attrs.href,doc.sourceUrl);if(url.pathname.startsWith('/product/')&&url.pathname!==doc.targetPath)paths.add(url.pathname)}catch{/* Malformed source links do not create product relationships. */}
  })
  const routes=new Map(activeProductRoutes().map(route=>[route.targetPath,route]))
  return [...paths].map(path=>routes.get(path)).filter((route):route is SalmonRoute=>!!route)
}
export const productPrimaryMedia=(doc:SalmonDocument)=>{
  const image=doc.images[0]
  const media=image?salmonMedia(image.src,doc.sourceUrl):undefined
  const src=media&&salmonMediaPath(media)
  return image&&media&&src&&media.sha256&&media.width&&media.height?{image,media,src}:null
}
export const productIndexRecords=()=>activeProductRoutes().map(route=>({route,doc:salmonDocument(route)}))

export const partsCategories=(doc:SalmonDocument):Array<{label:string;href:string}>=>{
  const categories=new Map<string,string>()
  walk(doc.children,node=>{
    if(node.tag!=='a'||!node.attrs.href)return
    try{const url=new URL(node.attrs.href,doc.sourceUrl);const route=salmonRoutes().find(row=>row.targetPath===url.pathname&&row.routeId.startsWith('SALMON-pages-'));if(route&&url.pathname!=='/contact-us/'&&url.pathname!==doc.targetPath&&/fan|shaft|fill|frp|gear|motor|nozzle|hardware/i.test(url.pathname))categories.set(url.pathname,salmonNodeText(node).trim())}catch{/* Invalid source links are not categories. */}
  })
  return [...categories].map(([href,label])=>({href,label}))
}
