import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {contactOffices} from './contact'
import {provenanceRef} from './media-delivery'
import {imageUrlPath} from '../content/image-slugs'
import {publicReleaseDocument} from './release-document'
import {decodeEntities,repairDocumentText,repairMojibake} from './text-repair'
import {withTextOverrides} from '../content/text-overrides'
import {releaseLedger,isPayloadContent,requestDocuments,snapshotFile,snapshotJson} from '../content/runtime-read'
export type SalmonNode = string | {tag:string;attrs:Record<string,string>;children:SalmonNode[]}
export type SalmonRoute = {routeId:string;sourceUrl:string;targetPath:string;file:string;sha256:string}
export type SalmonDocument = {
  routeId:string;sourceUrl:string;targetPath:string;type:string;title:string
  sourceIdentity:{sha256:string};text:string;children:SalmonNode[]
  chrome:Array<{region:string;text:string;tree:SalmonNode}>
  /** decidedDescription (R2.5): the description meta is the record's own SEO field (a decided value), not the import's. */
  seo:{title:string;meta:Array<{name:string;value:string}>;canonical:string[];h1:string[];schema:string[];decidedDescription?:boolean}
  images:Array<{src:string;section:string;order:number;alt:string|null}>
}
export type SalmonMedia = {url:string;state:string;file?:string;sha256?:string;width?:number;height?:number}
const root=path.join(process.cwd(),'content/salmon')
const read=<T,>(file:string):T=>JSON.parse(readFileSync(path.join(root,file),'utf8')) as T
/** R2.4 (item g): images recovered from the local h2ocooling.com backup (content/salmon/r24-recovered-media-identities.json). */
const recoveredMedia=():SalmonMedia[]=>read<{rows:SalmonMedia[]}>('r24-recovered-media-identities.json').rows
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
    if(injected)return publicReleaseDocument(repairDocumentText(withTextOverrides(injected),documentHeldAlt(injected)))
  }
  if(!(isPayloadContent()?/^documents\/(?:SALMON|LIVE)-[a-zA-Z0-9_-]+\.json$/:/^documents\/SALMON-[a-zA-Z0-9_-]+\.json$/).test(route.file))throw new Error('Unsafe canonical document path')
  const bytes=isPayloadContent()?snapshotFile(route.file):readFileSync(path.join(root,route.file))
  if(createHash('sha256').update(bytes).digest('hex')!==route.sha256)throw new Error('Salmon source identity mismatch')
  const doc=JSON.parse(bytes.toString()) as SalmonDocument
  if(doc.routeId!==route.routeId||doc.sourceUrl!==route.sourceUrl)throw new Error('Salmon route identity mismatch')
  // R2.1 text-override registry (content/text-overrides): idempotent, so a published (already corrected) document is unchanged.
  return publicReleaseDocument(repairDocumentText(withTextOverrides(doc),documentHeldAlt(doc)))
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
  for(const row of [...read<SalmonMedia[]>('media-identities.json'),...read<SalmonMedia[]>('r2-live-media-identities.json'),...recoveredMedia()]){
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
    const rows=[...read<SalmonMedia[]>('media-identities.json'),...read<SalmonMedia[]>('r2-live-media-identities.json'),...recoveredMedia()]
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
    return mediaOverride(mediaIndex.get(absolute)??mediaAliases?.get(mediaIdentityKey(absolute))??undefined)
  }catch{return undefined}
}
/**
 * OGCS pre-launch copy R1 C1–C6 (CT accepted 2026-10-05): a baked-text claim tile resolves to its recorded photo-only crop,
 * or to nothing where it is withheld (content/design/media-overrides.json, keyed by the held tile's SHA-256), so every page
 * and card that shows the tile follows, in both content modes.
 */
type MediaOverride={action:'crop'|'withhold';sourceStem?:string;file?:string;sha256?:string;width?:number;height?:number}
let mediaOverrides:Map<string,MediaOverride>|undefined
const loadMediaOverrides=()=>mediaOverrides??=new Map(Object.entries((JSON.parse(readFileSync(path.join(process.cwd(),'content/design/media-overrides.json'),'utf8')) as {overrides:Record<string,MediaOverride>}).overrides))
/**
 * MEDIA-1 (CT 2026-10-08): a held image served below ~1000 px is replaced by a genuinely larger original of the same picture from
 * the owner's WordPress backup (content/design/media-upgrades.json, keyed by the held bytes' SHA-256, which stays the provenance
 * identity). Only the file and its size follow the larger original; nothing is upscaled.
 */
type MediaUpgrade={file:string;sha256:string;width:number;height:number}
let mediaUpgrades:Map<string,MediaUpgrade>|undefined
const loadMediaUpgrades=()=>mediaUpgrades??=new Map(Object.entries((JSON.parse(readFileSync(path.join(process.cwd(),'content/design/media-upgrades.json'),'utf8')) as {upgrades:Record<string,MediaUpgrade>}).upgrades))
const mediaOverride=(row:SalmonMedia|undefined):SalmonMedia|undefined=>{
  const overrides=loadMediaOverrides()
  const override=row?.sha256?overrides.get(row.sha256):undefined
  if(row&&!override){
    const upgrade=row.sha256?loadMediaUpgrades().get(row.sha256):undefined
    if(upgrade)return {...row,file:upgrade.file,width:upgrade.width,height:upgrade.height}
  }
  if(!row||!override)return row
  if(override.action==='withhold')return undefined
  return {...row,file:override.file,sha256:override.sha256,width:override.width,height:override.height}
}
/**
 * R2.4 item g (CT 2026-10-05): legacy body images held nowhere (media-overrides.json `withheldSources`) are removed from the
 * page rather than shown as "unavailable"; the imported document keeps the node, the removal is recorded there.
 */
let withheldSources:Set<string>|undefined
export const withheldSource=(source:string,base:string):boolean=>{
  withheldSources??=new Set((JSON.parse(readFileSync(path.join(process.cwd(),'content/design/media-overrides.json'),'utf8')) as {withheldSources?:Array<{url:string}>}).withheldSources?.map(w=>w.url)??[])
  try{return withheldSources.has(new URL(source,base).href)}catch{return false}
}
/**
 * The same ruling for a URL a page names in its social image tags or structured data (the 1600 original, matched by the
 * tile's upload path with any `-WxH` size suffix): nothing where the tile is withheld, else the crop on the public origin.
 */
export const socialImageOverride=(url:string):{action:'withhold'}|{action:'crop';path:string;width:number;height:number}|undefined=>{
  let pathname:string
  try{pathname=new URL(url).pathname}catch{return undefined}
  for(const o of loadMediaOverrides().values()){
    if(!o.sourceStem||!pathname.startsWith(o.sourceStem)||!/^(?:-\d+x\d+)?\.(?:jpe?g|png|webp)$/i.test(pathname.slice(o.sourceStem.length)))continue
    return o.action==='withhold'?{action:'withhold'}:{action:'crop',path:`/media/salmon/${path.basename(o.file!)}`,width:o.width!,height:o.height!}
  }
  return undefined
}
/**
 * R2.3 (CT 2026-10-05): the held media a URL in a page's head names (social image tags, structured data). The exact URL first
 * (salmonMedia); else, as WordPress names one upload by several sizes (`-WxH`), the largest held size of the same upload on
 * the same host. Overrides (C1–C6) apply; undefined when nothing is held.
 */
let mediaByStem:Map<string,SalmonMedia[]>|undefined
const stemKey=(url:string):string|undefined=>{
  try{
    const u=new URL(url),m=/^(.*?)(?:-\d+x\d+)?(\.[a-z0-9]+)$/i.exec(decodeURI(u.pathname))
    return m?`${u.hostname.replace(/^www\./,'').toLowerCase()}${m[1]}${m[2]!.toLowerCase()}`:undefined
  }catch{return undefined}
}
export const heldMediaForUrl=(url:string):SalmonMedia|undefined=>{
  if(socialImageOverride(url)?.action==='withhold')return undefined
  const exact=salmonMedia(url,url)
  if(exact?.file)return exact
  if(!mediaByStem){
    mediaByStem=new Map()
    for(const row of mediaIndex!.values()){const k=row.file?stemKey(row.url):undefined;if(k)mediaByStem.set(k,[...(mediaByStem.get(k)??[]),row])}
  }
  const key=stemKey(url)
  const rows=key?mediaByStem.get(key):undefined
  if(!rows?.length)return undefined
  // a withheld tile stays withheld at every size of the upload
  if(rows.some(row=>row.sha256&&loadMediaOverrides().get(row.sha256)?.action==='withhold'))return undefined
  const best=[...rows].sort((a,b)=>(b.width??0)-(a.width??0))[0]
  return mediaOverride(best)
}
/** The public URL of a held image: its descriptive path (IMG-SEO-1 phase B); the physical file under public/media keeps its hash name. */
export const salmonMediaPath=(media:SalmonMedia):string|undefined=>media.file?imageUrlPath(`/media/salmon/${path.basename(media.file)}`):undefined
const thailand=contactOffices.find(office=>office.officeKey==='thailand')!
/** The retired Thailand number in any written form ("+66-2-260-6598", "66 2 260 6598", "(02) 260-6598", "2606598"). */
export const RETIRED_THAILAND_PHONE=/(?:\+?66[\s.-]*)?(?:\(?0?2\)?[\s.-]*)?260[\s.-]*6598/g
/** DD country-page review M1: a placeholder "(remove)" left by an editor-side removal (the R5B-L31 claim edit could not save an empty paragraph) never renders. */
export const ownerText=(text:string):string=>text.trim()==='(remove)'?'':text.replace(RETIRED_THAILAND_PHONE,thailand.telephoneDisplay).replaceAll('+662-661-7723',thailand.telephoneDisplay)
export const ownerHref=(href:string):string=>/^tel:/i.test(href)&&new RegExp(RETIRED_THAILAND_PHONE.source).test(href)?thailand.telephoneHref:href
/**
 * SEO-FIX-1 (CT 2026-10-07, launch-blocking): the `data-source-href` provenance attribute never carries a contact value.
 * A tel:, mailto: or sms: source link keeps only its public href (the retired Thailand number was leaking through it); the
 * old Salmon staging host is named `salmon:` (R2.5 provenance rule, ./media-delivery).
 */
export const provenanceHref=(original:string|undefined):string|undefined=>original&&!/^\s*(?:tel|mailto|sms|callto):/i.test(original)?provenanceRef(original):undefined
export const salmonNodeText=(node:SalmonNode):string=>typeof node==='string'?node:node.children.map(salmonNodeText).join('')
export const commerceException=(node:Exclude<SalmonNode,string>):boolean=>/(?:^|\s)(?:price|woocommerce-Price-amount|add_to_cart_button|single_add_to_cart_button|checkout-button|cart_totals)(?:\s|$)/.test(node.attrs.class??'')
/**
 * HEAD-POLISH-1 (CT 2026-10-09): head tags the WordPress/Elementor/WooCommerce/Yoast import left behind. The generator tag and the
 * Windows tile image name the retired stack; the WooCommerce price/availability pair is meaningless on a quote-only product.
 * On a taxonomy archive the article:*, og:updated_time and "Written by" tags describe a post that is not there, so the archive
 * falls back to the standard website type. Real posts, pages and products keep everything else.
 */
const ARCHIVE_TYPES=new Set(['categories','tags','product_cat','product_tag'])
export const staleHeadMeta=(meta:{name:string;value:string},doc:SalmonDocument):boolean=>
  /^(?:generator|msapplication-TileImage|product:price:currency|product:availability)$/i.test(meta.name)||
  (ARCHIVE_TYPES.has(doc.type)&&(meta.name==='og:type'||meta.name==='og:updated_time'||/^article:/.test(meta.name)||/^twitter:(?:label|data)\d*$/.test(meta.name)))
export const commerceMetaException=(meta:{name:string;value:string},doc:SalmonDocument):boolean=>doc.type==='product'&&(/price|availability/i.test(meta.name)||/[$€£]\s*\d/.test(meta.value)||(meta.name==='twitter:label1'&&meta.value==='Price')||(meta.name==='twitter:label2'&&meta.value==='Availability')||(meta.name==='twitter:data2'&&/in stock|out of stock/i.test(meta.value)))
