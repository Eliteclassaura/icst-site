import {readFileSync} from 'node:fs'
import path from 'node:path'
import type {SalmonDocument,SalmonNode} from './salmon'

type ReleaseRow={path:string;state:string;canonical:string;indexable:boolean;redirect:string|null}
type ReleaseAuthority={origin:string;routes:ReleaseRow[];redirects:Array<{source:string;destination:string}>}
let ledger:ReleaseAuthority|undefined
function authority(){
  return ledger??=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as ReleaseAuthority
}
/** Build-only adaptation. The hash-verified source JSON is never rewritten. */
export function publicReleaseDocument(doc:SalmonDocument):SalmonDocument{
  if(process.env.H2O_PUBLIC_EXPORT!=='1')return doc
  const {origin,routes,redirects}=authority()
  const row=routes.find(candidate=>decodeURIComponent(candidate.path)===decodeURIComponent(doc.targetPath))
  if(!row)throw new Error(`Public route authority absent: ${doc.targetPath}`)
  const canonical=row.redirect?origin+row.redirect:row.canonical
  const normalizeSchema=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(normalizeSchema)
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalizeSchema(item)]))
    if(typeof value==='string'){
      if(doc.seo.canonical[0]&&value.startsWith(doc.seo.canonical[0]))return canonical+value.slice(doc.seo.canonical[0].length)
      try{const url=new URL(value);if(url.origin==='https://salmon-rhinoceros-754457.hostingersite.com'&&!url.pathname.startsWith('/wp-content/'))return origin+url.pathname+url.search+url.hash}catch{/* Not a schema URL. */}
    }
    return value
  }
  const adaptNode=(node:SalmonNode):SalmonNode=>{
    if(typeof node==='string')return node
    const attrs={...node.attrs}
    if(node.tag==='a'&&attrs.href&&!attrs.href.startsWith('#')){
      try{
        const url=new URL(attrs.href,doc.sourceUrl)
        if(['h2ocooling.com','www.h2ocooling.com','salmon-rhinoceros-754457.hostingersite.com'].includes(url.hostname)&&!url.pathname.startsWith('/wp-content/')){
          const target=routes.find(candidate=>decodeURIComponent(candidate.path)===decodeURIComponent(url.pathname))
          const redirect=redirects.find(candidate=>decodeURIComponent(candidate.source)===decodeURIComponent(url.pathname))
          if(target?.state==='PUBLIC')attrs.href=target.path+url.search+url.hash
          else if(target?.redirect)attrs.href=target.redirect+url.search+url.hash
          else if(redirect&&routes.some(candidate=>candidate.path===redirect.destination&&candidate.state==='PUBLIC'))attrs.href=redirect.destination+url.search+url.hash
          else delete attrs.href
        }
      }catch{/* Existing non-URL anchors retain their source value. */}
    }
    return {...node,attrs,children:node.children.map(adaptNode)}
  }
  return {...doc,children:doc.children.map(adaptNode),seo:{...doc.seo,canonical:[canonical],meta:doc.seo.meta.map(meta=>meta.name==='og:url'?{...meta,value:canonical}:meta),schema:doc.seo.schema.map(raw=>JSON.stringify(normalizeSchema(JSON.parse(raw))))}}
}
