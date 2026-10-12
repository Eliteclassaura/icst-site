import {salmonDocument,salmonMedia,salmonMediaPath,salmonNodeText,salmonRoutes,type SalmonDocument,type SalmonNode,type SalmonRoute} from './salmon'
import {tidyAdditionalInfo} from './product-attributes'
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
  // CATALOG-FANS-1/2: 183 imported product routes + 11 Hudson records (TUF-LITE IV: the family and its seven series; TUF-LITE III: 4000KWUHT, 3000KUHT, 3000KC)
  const COHORT=194
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
    if(kind&&text&&!(kind==='additional'&&/^(?:Additional information\s*)?none$/i.test(text)))result.push({kind,nodes:kind==='additional'?tidyAdditionalInfo(node.children):node.children}) // FBG-11: attribute labels and sorted values
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
/**
 * HOME-RENDER-1: the parts hub reads every product (about 490 KB of source each) up to three times per request (page count, filter, cards)
 * to show twelve cards and a count. What the hub reads from a product is its identity, name, first image and short description, so in
 * payload mode the records are built once per ledger object from a slim copy of each product (the short-description element, the first
 * image, the identity; never the body) and handed out as copies. Repository mode keeps the full documents, as before.
 */
const slimProduct=(doc:SalmonDocument):SalmonDocument=>{
  let summary:SalmonNode|undefined
  walk(doc.children,node=>{if(!summary&&node.attrs.class?.split(/\s+/).includes('woocommerce-product-details__short-description'))summary=node})
  return {...doc,children:summary?[summary]:[],text:'',chrome:[],images:doc.images.slice(0,1),seo:{...doc.seo,schema:[],meta:[]}}
}
let indexNow:{ledger:object;routes:object;records:Array<{route:SalmonRoute;doc:SalmonDocument}>}|undefined
export const productIndexRecords=()=>{
  if(!isPayloadContent())return activeProductRoutes().map(route=>({route,doc:salmonDocument(route)}))
  const ledger=releaseLedger() as object,routes=salmonRoutes()
  if(!indexNow||indexNow.ledger!==ledger||indexNow.routes!==routes)indexNow={ledger,routes,records:activeProductRoutes().map(route=>({route,doc:slimProduct(salmonDocument(route))}))}
  return structuredClone(indexNow.records)
}

// CHIP-LABEL-FIX-1: a button such as "Buy Now" that links to a category never replaces that category's real label (first real label wins)
const GENERIC_CTA_LABEL=/^(?:buy|shop|order|view|learn|read|see|explore)(?:\s+(?:now|more|all|details))?$/i
/** FBG-06 (OGCS, CT 2026-10-11): the Parts hub's category chips read the source's raw labels ("Cooling Tower FAN STACKS", "DRIVE SHAFTS ASSEMBLES", "GEAR BOX"); these are their names. */
export const PARTS_CATEGORY_LABELS:Readonly<Record<string,string>>=Object.freeze({'/cooling-tower-fan-stacks/':'Fan Stacks','/drive-shafts-assembles/':'Drive Shafts & Assemblies','/fill-media/':'Fill Media','/frp-members/':'FRP Members','/gear-box/':'Gearboxes','/nozzles/':'Nozzles','/tower-hardware/':'Tower Hardware'})
export const partsCategories=(doc:SalmonDocument):Array<{label:string;href:string}>=>{
  const categories=new Map<string,string>()
  walk(doc.children,node=>{
    if(node.tag!=='a'||!node.attrs.href)return
    try{const url=new URL(node.attrs.href,doc.sourceUrl);const route=salmonRoutes().find(row=>row.targetPath===url.pathname&&row.routeId.startsWith('SALMON-pages-'));if(route&&url.pathname!=='/contact-us/'&&url.pathname!==doc.targetPath&&/fan|shaft|fill|frp|gear|motor|nozzle|hardware/i.test(url.pathname)){const label=salmonNodeText(node).trim();if(categories.has(url.pathname)&&GENERIC_CTA_LABEL.test(label))return;categories.set(url.pathname,PARTS_CATEGORY_LABELS[url.pathname]??label)}}catch{/* Invalid source links are not categories. */}
  })
  return [...categories].map(([href,label])=>({href,label}))
}
