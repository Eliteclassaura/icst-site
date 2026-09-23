import {readFileSync,existsSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createWorker} from './worker.mjs'

const root=process.cwd(),out=path.join(root,'.public-renderer/out'),evidence=path.join(root,'release/evidence')
const manifest=JSON.parse(readFileSync(path.join(evidence,'edge-manifest.json'),'utf8'))
const failures=[],missingLinks=[],nonPublicLinks=[]
const check=(condition,message)=>{if(!condition)failures.push(message)}
const decode=value=>value.replaceAll('&amp;','&').replaceAll('&#x27;',"'").replaceAll('&quot;','"')
const routeMap=new Map(manifest.routes.map(row=>[decodeURIComponent(row.path),row]))
const redirectMap=new Map(manifest.redirects.map(row=>[decodeURIComponent(row.source),row]))
const sitemap=readFileSync(path.join(out,'sitemap.xml'),'utf8')
const locations=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>decode(match[1]))
const publicRows=manifest.routes.filter(row=>row.export&&row.state==='PUBLIC')
check(new Set(locations).size===locations.length,'Duplicate sitemap URLs')
check(locations.includes('https://h2ocooling.com/resources/'),'Resources missing from sitemap')
check(locations.length===manifest.routes.filter(row=>row.sitemap).length,'Sitemap count mismatch')
const outputRows=[]
for(const row of manifest.routes){
  const file=path.join(out,decodeURIComponent(row.path),'index.html')
  if(!row.export){check(!existsSync(file),`Excluded route exported: ${row.path}`);continue}
  check(existsSync(file),`Missing output: ${row.path}`)
  if(!existsSync(file))continue
  const html=readFileSync(file,'utf8')
  const canonical=decode(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]??'')
  check(canonical===row.canonical,`Canonical mismatch: ${row.path}: ${canonical}`)
  const robots=html.match(/<meta name="robots" content="([^"]+)"/)?.[1]??''
  check(row.indexable?!robots.includes('noindex'):robots.includes('noindex'),`Robots mismatch: ${row.path}: ${robots}`)
  if(row.matchedArticle){check(new URL(row.previousCanonical).pathname===new URL(row.canonical).pathname,`Article path changed: ${row.path}`);check(new URL(row.canonical).origin===manifest.origin,`Article host wrong: ${row.path}`)}
  check(locations.includes(row.canonical)===row.sitemap,`Sitemap membership mismatch: ${row.path}`)
  outputRows.push({path:row.path,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),canonical,robots})
  for(const match of html.matchAll(/<(a|img|script|link)\b[^>]*?\b(href|src)="([^"]*)"/g)){
    const value=decode(match[3]);if(!value||value.startsWith('#'))continue
    let url;try{url=new URL(value,manifest.origin+row.path)}catch{continue}
    if(!['h2ocooling.com','www.h2ocooling.com','salmon-rhinoceros-754457.hostingersite.com'].includes(url.hostname))continue
    const key=decodeURIComponent(url.pathname),route=routeMap.get(key),redirect=redirectMap.get(key)
    if(route?.state==='REVIEW_HOLD'){nonPublicLinks.push({from:row.path,target:key});continue}
    if(route?.state==='PUBLIC'||redirect||manifest.assets[key])continue
    missingLinks.push({from:row.path,target:key,tag:match[1]})
  }
}
const bucket={async get(key){const prefix=`releases/${manifest.releaseId}/`;if(!key.startsWith(prefix))return null;const file=path.join(out,key.slice(prefix.length));return existsSync(file)?{body:readFileSync(file)}:null}}
const worker=createWorker(manifest)
const fetch=(url,stage='production',method='GET')=>worker.fetch(new Request('https://h2ocooling.com'+url,{method}),{RELEASE_STAGE:stage,RELEASE_ID:manifest.releaseId,RELEASE_BUCKET:bucket})
for(const redirect of manifest.redirects){const response=await fetch(redirect.source);check(response.status===308&&response.headers.get('location')===redirect.destination,`Edge redirect mismatch: ${redirect.source}`);check(!redirectMap.has(decodeURIComponent(redirect.destination)),`Redirect chain: ${redirect.source}`)}
const search=await fetch('/?s=cooling+tower');check(search.status===307&&search.headers.get('location')==='/search/?q=cooling+tower','Legacy search mapping')
const headers=[]
for(const route of ['/','/resources/','/search/','/robots.txt','/sitemap.xml','/not-a-release-route/','/admin/','/api/live/']){
  for(const stage of ['production','preview']){
    const response=await fetch(route,stage);headers.push({route,stage,status:response.status,robots:response.headers.get('x-robots-tag')})
    if(stage==='preview')check(response.headers.get('x-robots-tag')?.includes('noindex'),`Preview index leak: ${route}`)
    if(stage==='production'&&['/','/resources/'].includes(route))check(!response.headers.get('x-robots-tag')?.includes('noindex'),`Production globally noindexed: ${route}`)
  }
}
check((await fetch('/robots.txt','preview').then(response=>response.text())).includes('Disallow: /'),'Preview robots must disallow')
for(const row of manifest.routes.filter(row=>row.state==='REVIEW_HOLD'))check((await fetch(row.path)).status===404,`Held route publicly exposed: ${row.path}`)
for(const url of ['/admin/','/api/live/','/not-a-release-route/'])check((await fetch(url)).status===404,`Unknown/private exposed: ${url}`)
const provenance=readFileSync(path.join(root,'content/release/recovered-pdf-provenance.tsv'),'utf8').trim().split('\n').slice(1)
for(const line of provenance){const fields=line.split('\t'),url=fields[2],expected=fields[4],response=await fetch(url),bytes=Buffer.from(await response.arrayBuffer());check(response.status===200&&response.headers.get('content-type')==='application/pdf'&&createHash('sha256').update(bytes).digest('hex')===expected,`PDF identity/path failure: ${url}`)}
const pdfCount=provenance.length
const uniqueMissing=[...new Map(missingLinks.map(row=>[row.target,row])).values()]
check(nonPublicLinks.length===0,`${nonPublicLinks.length} links to held routes`)
check(uniqueMissing.length===0,`${uniqueMissing.length} unresolved internal link targets`)
const classCounts={};for(const row of manifest.routes){classCounts[row.routeClass]??={total:0,exported:0,indexable:0};classCounts[row.routeClass].total++;if(row.export)classCounts[row.routeClass].exported++;if(row.indexable)classCounts[row.routeClass].indexable++}
const report={pass:failures.length===0,failures,counts:{routes:manifest.routes.length,exported:publicRows.length,indexable:locations.length,products:publicRows.filter(row=>row.routeClass==='product').length,matchedArticles:publicRows.filter(row=>row.matchedArticle).length,held:manifest.routes.filter(row=>row.state==='REVIEW_HOLD').length,redirects:manifest.redirects.length,pdfCount},classCounts,missingLinks:uniqueMissing,nonPublicLinks,headers}
writeFileSync(path.join(evidence,'qa.json'),JSON.stringify(report,null,2))
writeFileSync(path.join(evidence,'route-output-inventory.json'),JSON.stringify(outputRows,null,2))
console.log(JSON.stringify(report,null,2))
if(failures.length)process.exitCode=1
