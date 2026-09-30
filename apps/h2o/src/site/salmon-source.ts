/**
 * Salmon source model — typed, read-only access to the Elementor structure that the frozen
 * Salmon documents already carry.
 *
 * The generic renderer strips every Elementor class, which is why distinct Salmon pages collapsed
 * into one article column. This module reads those classes (never renders them) to recover the
 * page's *semantics* — which node is a hero, a heading, a product card, an icon card, a button —
 * so the Salmon family presentations can compose real sections from the same source nodes.
 *
 * Every text node is still rendered through `renderSalmonNode`, so owner corrections, RFQ-only
 * substitutions, public-route link adaptation and commerce exceptions apply unchanged. Keys are
 * the same `body.<i>.<j>…` paths the generic renderer uses.
 */
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {ownerHref,salmonMedia,salmonMediaPath,salmonNodeText,type SalmonDocument,type SalmonNode} from './salmon'

export type SalmonElement=Exclude<SalmonNode,string>
export type SourceRef={node:SalmonElement;key:string}
export type SourceImage={src:string;alt:string;width?:number;height?:number;sha256?:string;sourceUrl:string;fit?:'cover'|'contain'|'auto';position?:string}

export const isElement=(node:SalmonNode|undefined):node is SalmonElement=>typeof node==='object'&&node!==null
export const classList=(node:SalmonElement):string[]=>(node.attrs.class??'').split(/\s+/).filter(Boolean)
export const hasClass=(node:SalmonElement,name:string):boolean=>classList(node).includes(name)
export const elementId=(node:SalmonElement):string|undefined=>classList(node).find(name=>/^elementor-element-[0-9a-f]{7}$/.test(name))?.slice(18)
/** Lookup keys for the Salmon CSS map: the Elementor element id and any atomic `e-<hash>` class. */
export const elementKeys=(node:SalmonElement):string[]=>[elementId(node),...classList(node).filter(name=>/^e-[0-9a-f]{7}$/.test(name))].filter((key):key is string=>!!key)
export const widgetType=(node:SalmonElement):string|undefined=>{
  const type=node.attrs['data-widget_type']?.split('.')[0]
  if(type)return type
  return classList(node).find(name=>name.startsWith('elementor-widget-')&&!['elementor-widget-container'].includes(name)&&!name.includes('__width')&&!name.startsWith('elementor-widget-mobile'))?.slice(17)
}
export const isContainer=(node:SalmonElement):boolean=>hasClass(node,'e-con')
export const refText=(ref:SourceRef):string=>salmonNodeText(ref.node).replace(/\s+/g,' ').trim()

/** Top-level, non-empty source sections, with renderer-compatible keys. */
export const sourceSections=(doc:SalmonDocument):SourceRef[]=>doc.children.flatMap((node,i)=>isElement(node)&&salmonNodeText(node).trim()||isElement(node)&&findAll({node:node as SalmonElement,key:`body.${i}`},ref=>ref.node.tag==='img').length?[{node:node as SalmonElement,key:`body.${i}`}]:[])

export function findAll(ref:SourceRef,match:(ref:SourceRef)=>boolean,descendIntoMatch=false):SourceRef[]{
  const found:SourceRef[]=[]
  const visit=(current:SourceRef)=>{
    current.node.children.forEach((child,i)=>{
      if(!isElement(child))return
      const next={node:child,key:`${current.key}.${i}`}
      const hit=match(next)
      if(hit)found.push(next)
      if(!hit||descendIntoMatch)visit(next)
    })
  }
  visit(ref)
  return found
}
export const findFirst=(ref:SourceRef,match:(ref:SourceRef)=>boolean):SourceRef|undefined=>findAll(ref,match)[0]
export const childRefs=(ref:SourceRef):SourceRef[]=>ref.node.children.flatMap((child,i)=>isElement(child)?[{node:child,key:`${ref.key}.${i}`}]:[])
/** Elementor container children, skipping the plain `e-con-inner` wrapper. */
export const containerChildren=(ref:SourceRef):SourceRef[]=>childRefs(ref).flatMap(child=>hasClass(child.node,'e-con-inner')?childRefs(child):[child])

/** Widgets in document order. Loop-grid product cards are one widget each. */
export function widgetsIn(ref:SourceRef):SourceRef[]{
  return findAll(ref,current=>!!widgetType(current.node)&&!isContainer(current.node)||hasClass(current.node,'product')&&hasClass(current.node,'type-product'))
}
export const firstTag=(ref:SourceRef,tags:RegExp):SourceRef|undefined=>tags.test(ref.node.tag)?ref:findFirst(ref,current=>tags.test(current.node.tag))
export const allTags=(ref:SourceRef,tags:RegExp):SourceRef[]=>findAll(ref,current=>tags.test(current.node.tag))

export function sourceImage(doc:SalmonDocument,node:SalmonElement):SourceImage|undefined{
  if(node.attrs['data-payload-media']&&/^\/api\/media\/file\/[A-Za-z0-9._-]+$/.test(node.attrs.src??''))return {src:node.attrs.src,alt:node.attrs.alt??'',width:node.attrs.width?Number(node.attrs.width):undefined,height:node.attrs.height?Number(node.attrs.height):undefined,sourceUrl:node.attrs.src}
  const original=node.attrs['data-src']||node.attrs.src
  if(!original)return undefined
  const media=salmonMedia(original,doc.sourceUrl)
  const src=media&&salmonMediaPath(media)
  if(!media||!src)return undefined
  return {src,alt:node.attrs.alt??'',width:media.width,height:media.height,sha256:media.sha256,sourceUrl:original}
}

type CssBackground={state:string;sourcePath:string;src?:string;sha256?:string;width?:number;height?:number;attachmentId?:number;fit?:'cover'|'contain'|'auto';position?:string}
let backgrounds:Record<string,{cssSha256:string;elements:Record<string,CssBackground>}>|undefined
/** Salmon Elementor CSS backgrounds, derived by `release/salmon-parity/derive-css-media.mjs`. */
export function cssBackground(routeId:string,element:string|undefined):SourceImage|undefined{
  if(!element)return undefined
  backgrounds??=(JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon/parity-css-backgrounds.json'),'utf8')) as {routes:typeof backgrounds}).routes
  const row=backgrounds?.[routeId]?.elements[element]
  if(!row||row.state!=='SOURCE_BINARY_HELD'||!row.src)return undefined
  return {src:row.src,alt:'',width:row.width,height:row.height,sha256:row.sha256,sourceUrl:row.sourcePath,...(row.fit?{fit:row.fit}:{}),...(row.position?{position:row.position}:{})}
}
export const backgroundOf=(routeId:string,node:SalmonElement):SourceImage|undefined=>elementKeys(node).map(key=>cssBackground(routeId,key)).find(Boolean)
/** The first held CSS background on this node or any descendant container. */
export function backgroundWithin(doc:SalmonDocument,ref:SourceRef):SourceImage|undefined{
  const own=cssBackground(doc.routeId,elementId(ref.node))
  if(own)return own
  for(const inner of findAll(ref,current=>isContainer(current.node))){const found=cssBackground(doc.routeId,elementId(inner.node));if(found)return found}
  return undefined
}
export const sourceIconName=(ref:SourceRef):string|undefined=>{
  const svg=findFirst(ref,current=>current.node.tag==='svg')
  return svg?classList(svg.node).find(name=>name.startsWith('e-fa'))?.replace(/^e-fa[srb]?-/,''):undefined
}
let publicOrigin:string|undefined
/** Same-site hosts from authority, not literals: the document's own source host and the public origin. */
const sameSiteHosts=(doc:SalmonDocument):Set<string>=>{
  publicOrigin??=(JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {origin:string}).origin
  const site=new URL(publicOrigin).hostname
  return new Set([new URL(doc.sourceUrl).hostname,site,`www.${site}`])
}
/**
 * Public href for a source anchor — the same resolution the generic renderer applies: held media
 * resolve to their local file, an unavailable PDF has no link, commerce links are dropped,
 * owner phone overrides apply, and same-site pages become paths (already adapted to the public
 * route authority by the release document in the static export).
 */
export function localHref(value:string|undefined,doc:SalmonDocument):string|undefined{
  if(!value||value==='#'||value.endsWith('/#'))return undefined
  if(value.startsWith('#'))return value
  const media=salmonMedia(value,doc.sourceUrl)
  if(media?.state==='SOURCE_UNAVAILABLE'&&/\.pdf(?:[?#]|$)/i.test(value))return undefined
  const local=media&&salmonMediaPath(media)
  if(local)return local
  if(/[?&]add-to-cart=|\/(?:checkout|cart)\/?(?:[?#]|$)/i.test(value))return undefined
  if(value.startsWith('/'))return value
  try{
    const url=new URL(ownerHref(value),doc.sourceUrl)
    if(sameSiteHosts(doc).has(url.hostname)&&!url.pathname.startsWith('/wp-content/'))return url.pathname+url.search+url.hash
    if(['https:','http:','tel:','mailto:'].includes(url.protocol))return url.protocol==='tel:'?ownerHref(value):url.href
  }catch{/* Non-URL anchors are inert. */}
  return undefined
}
let embedded:Record<string,{src:string}>|undefined
/** A PNG/JPEG Salmon embedded in an inline SVG icon, recovered by `derive-embedded-icons.mjs`. */
export function embeddedIcon(svg:SourceRef):{src:string;sha256:string}|undefined{
  const image=findFirst(svg,current=>current.node.tag==='image')
  const href=image&&(image.node.attrs.href??image.node.attrs['xlink:href'])
  const data=href?.match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/)?.[1]
  if(!data)return undefined
  embedded??=(JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon/parity-embedded-icons.json'),'utf8')) as {icons:typeof embedded}).icons
  const sha256=createHash('sha256').update(Buffer.from(data,'base64')).digest('hex')
  const row=embedded?.[sha256]
  return row?{src:row.src,sha256}:undefined
}
