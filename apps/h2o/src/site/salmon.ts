import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {contactOffices} from './contact'
import {publicReleaseDocument} from './release-document'
export type SalmonNode = string | {tag:string;attrs:Record<string,string>;children:SalmonNode[]}
export type SalmonRoute = {routeId:string;sourceUrl:string;targetPath:string;file:string;sha256:string}
export type SalmonDocument = {
  routeId:string;sourceUrl:string;targetPath:string;type:string;title:string
  sourceIdentity:{sha256:string};text:string;children:SalmonNode[]
  chrome:Array<{region:string;text:string;tree:SalmonNode}>
  seo:{title:string;meta:Array<{name:string;value:string}>;canonical:string[];h1:string[];schema:string[]}
  images:Array<{src:string;section:string;order:number;alt:string|null}>
}
export type SalmonMedia = {url:string;state:string;file?:string;sha256?:string;width?:number;height?:number}
const root=path.join(process.cwd(),'content/salmon')
const read=<T,>(file:string):T=>JSON.parse(readFileSync(path.join(root,file),'utf8')) as T
export const salmonRoutes=():SalmonRoute[]=>read('active-routes.json')
export const liveRoutes=():SalmonRoute[]=>read('r2-live-routes.json')
export const releaseRoutes=():SalmonRoute[]=>[...salmonRoutes(),...liveRoutes()]
export const salmonRedirects=():Array<{source:string;destination:string}>=>read('redirects.json')
export const salmonPathKey=(value:string):string=>decodeURIComponent(value)
export const salmonRouteFor=(segments:string[]=[]):SalmonRoute|null=>{
  const wanted=salmonPathKey(segments.length?`/${segments.join('/')}/`:'/')
  return salmonRoutes().find(r=>salmonPathKey(r.targetPath)===wanted)??null
}
export const releaseRouteFor=(segments:string[]=[]):SalmonRoute|null=>{
  const wanted=salmonPathKey(segments.length?`/${segments.join('/')}/`:'/')
  return releaseRoutes().find(r=>salmonPathKey(r.targetPath)===wanted)??null
}
export const salmonDocument=(route:SalmonRoute):SalmonDocument=>{
  if(!/^documents\/SALMON-[a-zA-Z0-9_-]+\.json$/.test(route.file))throw new Error('Unsafe canonical document path')
  const bytes=readFileSync(path.join(root,route.file))
  if(createHash('sha256').update(bytes).digest('hex')!==route.sha256)throw new Error('Salmon source identity mismatch')
  const doc=JSON.parse(bytes.toString()) as SalmonDocument
  if(doc.routeId!==route.routeId||doc.sourceUrl!==route.sourceUrl)throw new Error('Salmon route identity mismatch')
  return publicReleaseDocument(doc)
}
let mediaIndex:Map<string,SalmonMedia>|undefined
let mediaAliases:Map<string,SalmonMedia|null>|undefined
const mediaIdentityKey=(url:string):string=>decodeURI(url)
export const salmonMedia=(source:string,base:string):SalmonMedia|undefined=>{
  if(!mediaIndex){
    const rows=[...read<SalmonMedia[]>('media-identities.json'),...read<SalmonMedia[]>('r2-live-media-identities.json')]
    mediaIndex=new Map(rows.map(row=>[row.url,row]))
    mediaAliases=new Map()
    for(const row of rows){
      try{
        const key=mediaIdentityKey(row.url)
        if(mediaAliases.has(key)&&mediaAliases.get(key)?.url!==row.url)mediaAliases.set(key,null)
        else if(!mediaAliases.has(key))mediaAliases.set(key,row)
      }catch{/* Malformed historical URLs cannot create an alias. */}
    }
  }
  try{
    const absolute=new URL(source,base).href
    return mediaIndex.get(absolute)??mediaAliases?.get(mediaIdentityKey(absolute))??undefined
  }catch{return undefined}
}
export const salmonMediaPath=(media:SalmonMedia):string|undefined=>media.file?`/media/salmon/${path.basename(media.file)}`:undefined
const thailand=contactOffices.find(office=>office.officeKey==='thailand')!
export const ownerText=(text:string):string=>text.replaceAll('+66-2-260-6598',thailand.telephoneDisplay)
export const ownerHref=(href:string):string=>/^tel:\+?66[- ]?2[- ]?260[- ]?6598$/i.test(href)?thailand.telephoneHref:href
export const salmonNodeText=(node:SalmonNode):string=>typeof node==='string'?node:node.children.map(salmonNodeText).join('')
export const commerceException=(node:Exclude<SalmonNode,string>):boolean=>/(?:^|\s)(?:price|woocommerce-Price-amount|add_to_cart_button|single_add_to_cart_button|checkout-button|cart_totals)(?:\s|$)/.test(node.attrs.class??'')
export const commerceMetaException=(meta:{name:string;value:string},doc:SalmonDocument):boolean=>doc.type==='product'&&(/price|availability/i.test(meta.name)||/[$€£]\s*\d/.test(meta.value)||(meta.name==='twitter:label1'&&meta.value==='Price')||(meta.name==='twitter:label2'&&meta.value==='Availability')||(meta.name==='twitter:data2'&&/in stock|out of stock/i.test(meta.value)))
