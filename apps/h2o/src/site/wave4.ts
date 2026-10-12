import {createHash} from 'node:crypto'
import {physicalImagePath} from '../content/image-slugs'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {releaseRoutes,salmonDocument,salmonMedia,salmonMediaPath,salmonNodeText,salmonRoutes,type SalmonDocument,type SalmonNode} from './salmon'
import {isPayloadContent,releaseLedger} from '../content/runtime-read'
import {aliasReleaseDocument} from './release-document'

const ledgerPath=path.join(process.cwd(),'content/wave4/H2O_WAVE4_SALMON_ARTICLE_RECONCILIATION_R1.tsv')
const ledgerSha256='3ee3016d5fc1b2d7e32ad2502bcdde50e9e1813c0eeae04035aa47ad47a4ad49'

export type MatchedArticle={routeId:string;path:string;bodyDecision:string}
let matchedCache:MatchedArticle[]|undefined
function parseTsv(value:string):string[][]{
  const rows:string[][]=[]
  let row:string[]=[],field='',quoted=false
  for(let i=0;i<value.length;i++){
    const char=value[i]
    if(char==='"'){
      if(quoted&&value[i+1]==='"'){field+='"';i++}else quoted=!quoted
    }else if(char==='\t'&&!quoted){row.push(field);field=''}
    else if(char==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}
    else field+=char
  }
  if(quoted)throw new Error('Wave 4 frozen article ledger has an unterminated quote')
  if(field||row.length){row.push(field);rows.push(row)}
  return rows
}
export function matchedWave4Articles():MatchedArticle[]{
  if(matchedCache)return matchedCache
  const bytes=readFileSync(ledgerPath)
  if(createHash('sha256').update(bytes).digest('hex')!==ledgerSha256)throw new Error('Wave 4 frozen article ledger identity mismatch')
  const [columns,...rows]=parseTsv(bytes.toString('utf8'))
  const at=(name:string)=>{const index=columns.indexOf(name);if(index<0)throw new Error(`Wave 4 missing ledger column: ${name}`);return index}
  const disposition=at('FINAL_DISPOSITION'),routeId=at('SOURCE_ROUTE_ID'),sourcePath=at('SOURCE_PATH'),body=at('LEDGER_BODY_VS_LIVE')
  const matched:MatchedArticle[]=rows.filter(c=>c[disposition]==='MATCHED').map(c=>({routeId:c[routeId]!,path:c[sourcePath]!,bodyDecision:c[body]!}))
  if(rows.length!==830||matched.length!==177||new Set(matched.map(r=>r.routeId)).size!==177)throw new Error('Wave 4 frozen article accounting mismatch')
  matchedCache=matched
  return matched
}
/** FBG-12 (OGCS, CT 2026-10-11): articles whose ranking address is a second public (alias) address of their source route: source path -> alias path (content/release/seo-pass-r1.json `aliases`). */
export const articleAliases=():Record<string,string>=>(JSON.parse(readFileSync(path.join(process.cwd(),'content/release/seo-pass-r1.json'),'utf8')) as {aliases?:Record<string,string>}).aliases??{}
export function matchedWave4Article(doc:SalmonDocument):MatchedArticle|undefined{
  const aliases=articleAliases()
  return matchedWave4Articles().find(row=>row.routeId===doc.routeId&&(row.path===doc.targetPath||aliases[row.path]===doc.targetPath))
}
export function matchedWave4Documents():SalmonDocument[]{
  const routeById=new Map(salmonRoutes().map(route=>[route.routeId,route]))
  // Payload runtime (R1B): a matched article an editor has withdrawn is simply absent from the published set.
  const rows=isPayloadContent()?matchedWave4Articles().filter(row=>routeById.has(row.routeId)):matchedWave4Articles()
  return rows.map(row=>{
    const route=routeById.get(row.routeId)
    if(!route||route.targetPath!==row.path)throw new Error(`Wave 4 matched route absent: ${row.routeId}`)
    return salmonDocument(route)
  }).reverse()
}

type ArticleReleaseRow={path:string;routeId:string;routeClass:string;state:string;export:boolean;indexable:boolean;canonical:string}
/** One reader-facing directory, preserving existing matched/live order and the authorized retrofit addition. */
export function articleDirectoryDocuments():Array<{doc:SalmonDocument;indexable:boolean}>{
  const release=releaseLedger() as {routes:ArticleReleaseRow[]}
  const byPath=new Map(release.routes.filter(row=>row.routeClass==='posts').map(row=>[row.path,row]))
  const current=[...matchedWave4Documents(),...releaseRoutes().filter(route=>route.routeId.startsWith('LIVE-posts-')&&route.targetPath!=='/hello-world-2/').map(salmonDocument)]
  const retrofit=releaseRoutes().find(route=>route.targetPath==='/cooling-tower-retrofit-guide-upgrading-old-towers/')
  if(!retrofit)throw new Error('Authorized retrofit article is absent from release routes')
  current.push(salmonDocument(retrofit))
  // Held articles published by the Master SEO Pass R1 (owner decision, content-checked) join the directory like the
  // retrofit guide, while they are PUBLIC in the release.
  const seoPublished=(JSON.parse(readFileSync(path.join(process.cwd(),'content/release/seo-pass-r1.json'),'utf8')) as {publish:string[]}).publish
  for(const target of seoPublished){
    const route=releaseRoutes().find(candidate=>candidate.targetPath===target),row=byPath.get(target)
    if(route&&row?.state==='PUBLIC'&&row.export)current.push(salmonDocument(route))
  }
  // FBG-12: an article served at its restored ranking address (an alias row of the same source route) is listed at that address.
  for(const [from,to] of Object.entries(articleAliases())){
    const route=releaseRoutes().find(candidate=>candidate.targetPath===from),row=byPath.get(to)
    if(route&&row?.state==='PUBLIC'&&row.export&&row.routeId===route.routeId)current.push(aliasReleaseDocument(salmonDocument(route),to,row.canonical))
  }
  if(new Set(current.map(doc=>doc.targetPath)).size!==current.length)throw new Error('Article directory has a duplicate route')
  // An article consolidated into another by an accepted redirect (Master SEO Pass R1) leaves the directory; any other
  // non-public article is still an error.
  const consolidated=new Set(release.routes.filter(row=>row.state==='REDIRECT').map(row=>row.path))
  return current.filter(doc=>!consolidated.has(doc.targetPath)).map(doc=>{
    const row=byPath.get(doc.targetPath)
    if(!row?.export||row.state!=='PUBLIC'||row.routeId!==doc.routeId)throw new Error(`Article directory route is not public: ${doc.targetPath}`)
    return {doc,indexable:row.indexable}
  })
}

/** The 29 affected source titles encode an ampersand as literal entity text. Decode for display only. */
/** CLIENT-FIX-2 (CF2-21, OGCS/CT): a title that feeds an index or card carries no leading or trailing whitespace or no-break space (U+00A0; the index showed it as "Â "). */
export const articleDisplayTitle=(value:string):string=>value.replace(/&amp;|&#0*38;|&#x0*26;/gi,'&').replace(/^[\s\u00a0]+|[\s\u00a0]+$/g,'')
/** CLIENT-FIX-2 (CF2-22): the latest-posts slide thumbnails carry a leaked file name as their alt ("Slide on-page-free-jpeg.jpg: ..."); their card link already names them, so the alt is empty (decorative). */
export const LEAKED_FILENAME_ALT=/^Slide\s+[\w.-]+\.(?:jpe?g|png|webp)\b/i
export const publicAlt=<T extends string|undefined>(alt:T):T|''=>alt&&LEAKED_FILENAME_ALT.test(alt)?'':alt

/** Article cards use only that article's own locally held source image, if one exists. */
export function articleCardImage(doc:SalmonDocument):{src:string;alt:string;width:number;height:number;sha256:string}|undefined{
  for(const image of doc.images){
    const media=salmonMedia(image.src,doc.sourceUrl)
    const src=media&&salmonMediaPath(media)
    if(src&&media?.sha256&&media.width&&media.height&&existsSync(path.join(process.cwd(),'public',physicalImagePath(src)??src)))
      return {src,alt:image.alt||doc.title,width:media.width,height:media.height,sha256:media.sha256}
  }
  return undefined
}

export type Wave4Item={title:string;description:string;href?:string;kind:'document'|'tool'}
export function descendants(node:SalmonNode,tag:string):Exclude<SalmonNode,string>[]{
  if(typeof node==='string')return []
  return [...(node.tag===tag?[node]:[]),...node.children.flatMap(child=>descendants(child,tag))]
}
const first=(nodes:SalmonNode[],tag:string)=>nodes.flatMap(node=>descendants(node,tag))[0]
export function firstText(doc:SalmonDocument,tag:string):string{return first(doc.children,tag)?salmonNodeText(first(doc.children,tag)!).trim().replace(/\s+/g,' '):''}
export function paragraphTexts(doc:SalmonDocument):string[]{return doc.children.flatMap(node=>descendants(node,'p')).map(node=>salmonNodeText(node).trim().replace(/\s+/g,' ')).filter(Boolean)}
/** Keep source article facts in order; omit only an unpopulated JS-only TOC widget. */
export function articleHeadingNodes(nodes:SalmonNode[],omitFirstH1=false):SalmonNode[]{
  let firstH1=true
  const visit=(node:SalmonNode):SalmonNode|null=>{
    if(typeof node==='string')return node
    if(/(?:^|\s)elementor-widget-table-of-contents(?:\s|$)/.test(node.attrs.class??'')&&descendants(node,'a').length===0)return null
    if(/(?:^|\s)wp-block-rank-math-toc-block(?:\s|$)/.test(node.attrs.class??''))return null
    let tag=node.tag
    if(tag==='h1'){if(firstH1){firstH1=false;if(omitFirstH1)return null}else tag='h2'}
    return {...node,tag,children:node.children.map(visit).filter((child):child is SalmonNode=>child!==null)}
  }
  return nodes.map(visit).filter((node):node is SalmonNode=>node!==null)
}

/**
 * The WordPress "Recent Posts" sidebar region carried in some article sources (timestamps such as "7:33 pm"; Design Fixes
 * R1 A5): a top-level region whose only h2 is "Recent Posts" and that lists posts. It is not article content; the template
 * skips it (by index, so element keys do not move). Anything else with that heading is kept.
 */
export const isRecentPostsRegion=(node:SalmonNode):boolean=>{
  if(typeof node==='string')return false
  const headings=descendants(node,'h2')
  return headings.length===1&&salmonNodeText(headings[0]!).trim()==='Recent Posts'&&descendants(node,'article').length>0
}

export function articleTocLinks(doc:SalmonDocument):Array<{href:string;label:string}>{
  const toc=doc.children.flatMap(node=>descendants(node,'div')).find(node=>/(?:^|\s)wp-block-rank-math-toc-block(?:\s|$)/.test(node.attrs.class??''))
  if(!toc)return []
  const ids=new Set(doc.children.flatMap(node=>[...descendants(node,'h2'),...descendants(node,'h3')]).map(node=>node.attrs.id).filter(Boolean))
  const links=descendants(toc,'a').map(node=>({href:node.attrs.href||'',label:salmonNodeText(node).trim().replace(/\s+/g,' ')})).filter(link=>link.href.startsWith('#')&&ids.has(link.href.slice(1))&&link.label)
  // Restored sections (content/restored-sections) join the contents in document order, like the source's own headings.
  const restored=new Set(doc.children.flatMap(node=>descendants(node,'h2')).filter(node=>node.attrs['data-restored']&&node.attrs.id).map(node=>node.attrs.id))
  if(!restored.size)return links
  const byId=new Map(links.map(link=>[link.href.slice(1),link]))
  const ordered:Exclude<SalmonNode,string>[]=[]
  const walk=(node:SalmonNode):void=>{if(typeof node==='string')return;if(node.tag==='h2'||node.tag==='h3'){ordered.push(node);return}node.children.forEach(walk)}
  doc.children.forEach(walk)
  return ordered.flatMap(node=>{
    const id=node.attrs.id
    if(!id)return []
    if(byId.has(id))return [byId.get(id)!]
    return restored.has(id)?[{href:`#${id}`,label:salmonNodeText(node).trim().replace(/\s+/g,' ')}]:[]
  })
}

export function articleByline(doc:SalmonDocument):{author:string;date:string;dateTime:string}|null{
  for(const raw of doc.seo.schema){
    const parsed=JSON.parse(raw) as Record<string,unknown>|Array<Record<string,unknown>>
    const entries=Array.isArray(parsed)?parsed:Array.isArray(parsed['@graph'])?parsed['@graph'] as Array<Record<string,unknown>>:[parsed]
    const posting=entries.find(entry=>['BlogPosting','Article'].includes(String(entry['@type']||'')))
    if(!posting)continue
    const author=posting.author
    const name=typeof author==='object'&&author!==null?String((author as Record<string,unknown>).name||''):''
    const dateTime=String(posting.datePublished||'').slice(0,10)
    if(!name||!/^\d{4}-\d{2}-\d{2}$/.test(dateTime))return null
    const date=new Date(`${dateTime}T12:00:00Z`).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})
    return {author:name,date,dateTime}
  }
  return null
}
function verifiedLink(raw:string):string|undefined{
  try{
    const url=new URL(raw)
    if(!['h2ocooling.com','www.h2ocooling.com'].includes(url.hostname))return undefined
    if(!/^\/wp-content\/uploads\/\d{4}\/\d{2}\/[A-Za-z0-9._%-]+\.pdf$/i.test(url.pathname))return undefined
    const target=path.join(process.cwd(),'public',url.pathname)
    return existsSync(target)?url.pathname:undefined
  }catch{return undefined}
}
export function wave4LibraryItems(doc:SalmonDocument):Wave4Item[]{
  const items:Wave4Item[]=[]
  for(const details of doc.children.flatMap(node=>descendants(node,'details'))){
    const summary=first(details.children,'summary')
    if(!summary)continue
    const title=salmonNodeText(summary).trim().replace(/\s+/g,' ').replace(/^-\s*/,'')
    const paragraphs=details.children.flatMap(node=>descendants(node,'p')).map(node=>salmonNodeText(node).trim().replace(/\s+/g,' ')).filter(Boolean)
    const link=details.children.flatMap(node=>descendants(node,'a')).map(node=>verifiedLink(node.attrs.href??'')).find(Boolean)
    items.push({title,description:paragraphs.slice(0,2).join(' '),href:link,kind:'document'})
  }
  if(doc.routeId==='SALMON-pages-1870'){
    const headings=doc.children.flatMap(node=>descendants(node,'h2')).filter(node=>/^\s*-\s*/.test(salmonNodeText(node)))
    const links=doc.children.flatMap(node=>descendants(node,'a')).map(node=>verifiedLink(node.attrs.href??'')).filter((value):value is string=>Boolean(value))
    const formLinks=links.filter(link=>link.includes('/2024/06/'))
    const forms=headings.map((heading,index)=>({title:salmonNodeText(heading).trim().replace(/^-\s*/,''),description:'',href:formLinks[index],kind:'document' as const}))
    return [...forms,...items]
  }
  return items
}
