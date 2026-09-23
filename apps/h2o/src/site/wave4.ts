import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {salmonDocument,salmonMedia,salmonMediaPath,salmonNodeText,salmonRoutes,type SalmonDocument,type SalmonNode} from './salmon'

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
export function matchedWave4Article(doc:SalmonDocument):MatchedArticle|undefined{return matchedWave4Articles().find(row=>row.routeId===doc.routeId&&row.path===doc.targetPath)}
export function matchedWave4Documents():SalmonDocument[]{
  const routeById=new Map(salmonRoutes().map(route=>[route.routeId,route]))
  return matchedWave4Articles().map(row=>{
    const route=routeById.get(row.routeId)
    if(!route||route.targetPath!==row.path)throw new Error(`Wave 4 matched route absent: ${row.routeId}`)
    return salmonDocument(route)
  }).reverse()
}

/** Article cards use only that article's own locally held source image, if one exists. */
export function articleCardImage(doc:SalmonDocument):{src:string;alt:string;width:number;height:number;sha256:string}|undefined{
  for(const image of doc.images){
    const media=salmonMedia(image.src,doc.sourceUrl)
    const src=media&&salmonMediaPath(media)
    if(src&&media?.sha256&&media.width&&media.height&&existsSync(path.join(process.cwd(),'public',src)))
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
export function articleHeadingNodes(nodes:SalmonNode[]):SalmonNode[]{
  let firstH1=true
  const visit=(node:SalmonNode):SalmonNode|null=>{
    if(typeof node==='string')return node
    if(/(?:^|\s)elementor-widget-table-of-contents(?:\s|$)/.test(node.attrs.class??'')&&descendants(node,'a').length===0)return null
    let tag=node.tag
    if(tag==='h1'){if(firstH1)firstH1=false;else tag='h2'}
    return {...node,tag,children:node.children.map(visit).filter((child):child is SalmonNode=>child!==null)}
  }
  return nodes.map(visit).filter((node):node is SalmonNode=>node!==null)
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
