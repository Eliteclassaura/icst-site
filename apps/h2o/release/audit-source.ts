import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {salmonDocument,salmonRoutes,salmonNodeText,type SalmonNode} from '../src/site/salmon'

process.env.H2O_PUBLIC_EXPORT='1'
const ledger=JSON.parse(readFileSync('content/release/route-ledger.json','utf8'))
const links:Array<Record<string,string>>=[]
let facts=0,metadata=0,images=0
function compare(before:SalmonNode,after:SalmonNode,route:string){
  if(typeof before==='string'||typeof after==='string')return
  if(before.tag==='a'&&before.attrs.href&&!after.attrs.href)links.push({route,href:before.attrs.href,action:'NONCLICKABLE_SOURCE_TEXT_RETAINED',reason:'NO_PUBLIC_RELEASE_DESTINATION'})
  if(before.tag==='img'){if(before.attrs.src!==after.attrs.src)throw new Error(`Image changed: ${route}`);images++}
  before.children.forEach((node,index)=>compare(node,after.children[index],route))
}
for(const route of salmonRoutes()){
  const bytes=readFileSync(path.join('content/salmon',route.file))
  if(createHash('sha256').update(bytes).digest('hex')!==route.sha256)throw new Error(`Source hash changed: ${route.routeId}`)
  const before=JSON.parse(bytes.toString()),after=salmonDocument(route)
  if(before.children.map(salmonNodeText).join('')!==after.children.map(salmonNodeText).join(''))throw new Error(`Factual text changed: ${route.routeId}`)
  facts++
  if(before.seo.title!==after.seo.title||JSON.stringify(before.seo.meta.filter((item:{name:string})=>item.name!=='og:url'))!==JSON.stringify(after.seo.meta.filter(item=>item.name!=='og:url')))throw new Error(`Factual metadata changed: ${route.routeId}`)
  metadata++
  before.children.forEach((node:SalmonNode,index:number)=>compare(node,after.children[index],route.targetPath))
}
const baseline=JSON.parse(readFileSync('release/evidence/baseline-source-hashes.json','utf8')) as Array<{path:string;sha256:string}>
const changes=baseline.flatMap(row=>{const digest=createHash('sha256').update(readFileSync(row.path)).digest('hex');return digest===row.sha256?[]:[{...row,newSha256:digest}]})
writeFileSync('release/evidence/source-preservation.json',JSON.stringify({sourceDocumentsHashVerified:facts,factualTextPreserved:facts,factualSeoPreserved:metadata,sourceImageUrlsPreserved:images,suppressedLinkCount:links.length,changedExistingFiles:changes,releaseOverride:ledger.routes.filter((row:{releaseOverride?:string})=>row.releaseOverride)},null,2))
writeFileSync('release/evidence/nonpublic-link-dispositions.json',JSON.stringify(links,null,2))
console.log(JSON.stringify({facts,metadata,images,suppressedLinks:links.length,existingFilesChanged:changes.map(row=>row.path)}))
