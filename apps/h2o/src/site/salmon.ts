import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {contactOffices} from './contact'
import {publicReleaseDocument} from './release-document'
import {decodeEntities,repairDocumentText,repairMojibake} from './text-repair'
import {releaseLedger,isPayloadContent,requestDocuments,snapshotFile,snapshotJson} from '../content/runtime-read'
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
// Content bridge seam: in payload content mode the route lists and page documents come from the promoted
// published snapshot of Payload (see src/content/snapshot.ts); media identities and owner authorities stay
// repository authorities. Repository mode is unchanged.
export const salmonRoutes=():SalmonRoute[]=>isPayloadContent()?snapshotJson<SalmonRoute[]>('routes.salmon.json'):read('active-routes.json')
// Locale Part B: the preserved live locale pages are LIVE-family routes too (r3-locale-routes.json).
export const liveRoutes=():SalmonRoute[]=>isPayloadContent()?snapshotJson<SalmonRoute[]>('routes.live.json'):[...read<SalmonRoute[]>('r2-live-routes.json'),...read<SalmonRoute[]>('r3-locale-routes.json')]
export const releaseRoutes=():SalmonRoute[]=>[...salmonRoutes(),...liveRoutes()]
/** Release routes a listing may link: PUBLIC and exported in the release ledger. Withdrawn, held and consolidated
 * (redirected, Master SEO Pass R1) routes leave every listing, in repository and Payload modes alike. */
export const publicReleaseRoutes=():SalmonRoute[]=>{
  const ledger=releaseLedger() as {routes:Array<{path:string;state:string;export:boolean}>}
  const ok=new Set(ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export).map(row=>salmonPathKey(row.path)))
  return releaseRoutes().filter(route=>ok.has(salmonPathKey(route.targetPath)))
}
export const salmonRedirects=():Array<{source:string;destination:string}>=>read('redirects.json')
export const salmonPathKey=(value:string):string=>decodeURIComponent(value)
export const salmonRouteFor=(segments:string[]=[]):SalmonRoute|null=>{
  const wanted=salmonPathKey(segments.length?`/${segments.join('/')}/`:'/')
  return salmonRoutes().find(r=>salmonPathKey(r.targetPath)===wanted)??null
}
export const releaseRouteFor=(segments:string[]=[]):SalmonRoute|null=>{
  const wanted=salmonPathKey(segments.length?`/${segments.join('/')}/`:'/')
  if(isPayloadContent()){
    // The page being rendered was resolved from Payload for this request (published or previewed draft).
    for(const doc of requestDocuments().values()){const d=doc as SalmonDocument;if(salmonPathKey(d.targetPath)===wanted)return {routeId:d.routeId,sourceUrl:d.sourceUrl,targetPath:d.targetPath,file:`documents/${d.routeId}.json`,sha256:''}}
  }
  return releaseRoutes().find(r=>salmonPathKey(r.targetPath)===wanted)??null
}
export const salmonDocument=(route:SalmonRoute):SalmonDocument=>{
  if(isPayloadContent()){
    const injected=requestDocuments().get(route.routeId) as SalmonDocument|undefined
    if(injected)return publicReleaseDocument(repairDocumentText(injected,documentHeldAlt(injected)))
  }
  if(!(isPayloadContent()?/^documents\/(?:SALMON|LIVE)-[a-zA-Z0-9_-]+\.json$/:/^documents\/SALMON-[a-zA-Z0-9_-]+\.json$/).test(route.file))throw new Error('Unsafe canonical document path')
  const bytes=isPayloadContent()?snapshotFile(route.file):readFileSync(path.join(root,route.file))
  if(createHash('sha256').update(bytes).digest('hex')!==route.sha256)throw new Error('Salmon source identity mismatch')
  const doc=JSON.parse(bytes.toString()) as SalmonDocument
  if(doc.routeId!==route.routeId||doc.sourceUrl!==route.sourceUrl)throw new Error('Salmon route identity mismatch')
  return publicReleaseDocument(repairDocumentText(doc,documentHeldAlt(doc)))
}
/** Held alt text for an image (CT SEO parity follow-up R1, Part 2 item 3), most authoritative first:
 *  1. the alt h2ocooling.com serves today (content/salmon/live-image-alt.json, from the CT parity audit's live fetches);
 *  2. the Salmon WordPress media-library alt, else its caption (attachments.json).
 * Matched by upload path without the size suffix ("-300x200", "-scaled"), and through the media identity's SHA-256 when the
 * same bytes were uploaded under another name. Nothing is invented: no held text means the image keeps alt="". */
const uploadKey=(url:string):string|undefined=>{
  let pathname=url.split(/[?#]/)[0]??''
  try{pathname=decodeURI(pathname)}catch{/* Keep the held spelling. */}
  const upload=/\/wp-content\/uploads\/(.+)$/i.exec(pathname)?.[1]
  return upload?.replace(/(\.(?:jpe?g|png|gif))\.webp$/i,'$1').replace(/-(?:\d+x\d+|scaled)(?=\.[a-z0-9]+$)/i,'').toLowerCase()
}
let heldAltIndex:{byKey:Map<string,string>;bySha:Map<string,string>}|undefined
const heldAlt=()=>{
  if(heldAltIndex)return heldAltIndex
  const byKey=new Map<string,string>()
  const clean=(value:string)=>repairMojibake(decodeEntities(value.replace(/<[^>]*>/g,' '))).replace(/\s+/g,' ').trim()
  for(const [key,alt] of Object.entries(read<{alt:Record<string,string>}>('live-image-alt.json').alt))if(clean(alt))byKey.set(key,clean(alt))
  for(const item of read<Array<{source_url:string;alt?:string;caption?:string}>>('attachments.json')){
    const text=clean(item.alt||item.caption||''),key=uploadKey(item.source_url)
    if(text&&key&&!byKey.has(key))byKey.set(key,text)
  }
  const bySha=new Map<string,string>()
  for(const row of [...read<SalmonMedia[]>('media-identities.json'),...read<SalmonMedia[]>('r2-live-media-identities.json')]){
    const key=uploadKey(row.url),text=key?byKey.get(key):undefined
    if(row.sha256&&text&&!bySha.has(row.sha256))bySha.set(row.sha256,text)
  }
  return heldAltIndex={byKey,bySha}
}
/** Held alt text for an image source URL and/or the SHA-256 of its held bytes. */
export const heldImageAlt=(source?:string,sha256?:string):string|undefined=>{
  const index=heldAlt(),key=source?uploadKey(source):undefined
  return (key?index.byKey.get(key):undefined)??(sha256?index.bySha.get(sha256):undefined)
}
/** The held alt for an image node of a document (its source URL, then the identity of the bytes it resolves to). */
const documentHeldAlt=(doc:{sourceUrl:string})=>(source:string):string|undefined=>{
  if(!source)return undefined
  let sha:string|undefined
  try{sha=salmonMedia(source,doc.sourceUrl)?.sha256}catch{/* Not a held media URL. */}
  return heldImageAlt(source,sha)
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
export const ownerText=(text:string):string=>text.replaceAll('+66-2-260-6598',thailand.telephoneDisplay).replaceAll('+662-661-7723',thailand.telephoneDisplay)
export const ownerHref=(href:string):string=>/^tel:\+?66[- ]?2[- ]?260[- ]?6598$/i.test(href)?thailand.telephoneHref:href
export const salmonNodeText=(node:SalmonNode):string=>typeof node==='string'?node:node.children.map(salmonNodeText).join('')
export const commerceException=(node:Exclude<SalmonNode,string>):boolean=>/(?:^|\s)(?:price|woocommerce-Price-amount|add_to_cart_button|single_add_to_cart_button|checkout-button|cart_totals)(?:\s|$)/.test(node.attrs.class??'')
export const commerceMetaException=(meta:{name:string;value:string},doc:SalmonDocument):boolean=>doc.type==='product'&&(/price|availability/i.test(meta.name)||/[$€£]\s*\d/.test(meta.value)||(meta.name==='twitter:label1'&&meta.value==='Price')||(meta.name==='twitter:label2'&&meta.value==='Availability')||(meta.name==='twitter:data2'&&/in stock|out of stock/i.test(meta.value)))
