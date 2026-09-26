import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'

export const origin='https://h2ocooling.com'
export const sourceOrigin='https://salmon-rhinoceros-754457.hostingersite.com'
const releaseOverride='/cooling-tower-retrofit-guide-upgrading-old-towers/'
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export function parseTsv(value){
  const rows=[];let row=[],field='',quoted=false
  for(let i=0;i<value.length;i++){
    const char=value[i]
    if(char==='"'){if(quoted&&value[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(char==='\t'&&!quoted){row.push(field);field=''}
    else if(char==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}
    else field+=char
  }
  if(quoted)throw new Error('Unterminated TSV quote')
  if(field||row.length){row.push(field);rows.push(row)}
  const [keys,...data]=rows
  return data.map(values=>Object.fromEntries(keys.map((key,i)=>[key,values[i]??''])))
}
export const pathKey=value=>decodeURIComponent(value)
export function releaseAuthority(root){
  const read=file=>JSON.parse(readFileSync(path.join(root,file),'utf8'))
  const frozen=readFileSync(path.join(root,'content/wave4/H2O_WAVE4_SALMON_ARTICLE_RECONCILIATION_R1.tsv'))
  if(hash(frozen)!=='3ee3016d5fc1b2d7e32ad2502bcdde50e9e1813c0eeae04035aa47ad47a4ad49')throw new Error('Frozen Wave 4 authority changed')
  const articleRows=parseTsv(frozen.toString())
  const matched=new Map(articleRows.filter(r=>r.FINAL_DISPOSITION==='MATCHED').map(r=>[r.SOURCE_ROUTE_ID,r.SOURCE_PATH]))
  const heldIds=new Set(articleRows.filter(r=>r.FINAL_DISPOSITION==='REVIEW_HOLD').map(r=>r.SOURCE_ROUTE_ID).filter(Boolean))
  const heldPaths=new Set(articleRows.filter(r=>r.FINAL_DISPOSITION==='REVIEW_HOLD').flatMap(r=>[r.SOURCE_PATH,r.SALMON_PATH]).filter(Boolean).map(pathKey))
  if(matched.size!==177||articleRows.filter(r=>r.FINAL_DISPOSITION==='REVIEW_HOLD').length!==653)throw new Error('Frozen article accounting changed')
  const sourceRoutes=[...read('content/salmon/active-routes.json'),...read('content/salmon/r2-live-routes.json')]
  const routes=sourceRoutes.map(row=>{
    const bytes=readFileSync(path.join(root,'content/salmon',row.file))
    if(hash(bytes)!==row.sha256)throw new Error(`Source changed: ${row.routeId}`)
    const doc=JSON.parse(bytes)
    const held=!row.routeId.startsWith('LIVE-')&&(heldIds.has(row.routeId)||heldPaths.has(pathKey(row.targetPath)))&&row.targetPath!==releaseOverride
    if(matched.has(row.routeId)&&matched.get(row.routeId)!==row.targetPath)throw new Error(`Article path mismatch: ${row.routeId}`)
    const previousCanonical=doc.seo.canonical[0]??''
    const canonical=new URL(previousCanonical||row.targetPath,origin)
    const sameOrigin=[origin,sourceOrigin].includes(canonical.origin)
    if(sameOrigin)canonical.host='h2ocooling.com'
    canonical.protocol='https:'
    const sourceRobots=doc.seo.meta.find(meta=>meta.name==='robots')?.value??'index, follow'
    const self=pathKey(canonical.pathname)===pathKey(row.targetPath)
    const indexable=!held&&self&&sameOrigin&&!/\bnoindex\b/i.test(sourceRobots)
    return {path:row.targetPath,routeId:row.routeId,sourceFile:row.file,sourceSha256:row.sha256,routeClass:doc.type,state:held?'REVIEW_HOLD':'PUBLIC',export:!held,indexable,sitemap:indexable,searchable:indexable&&['pages','product','posts'].includes(doc.type),canonical:canonical.href,previousCanonical,sourceRobots,matchedArticle:matched.has(row.routeId),releaseOverride:row.targetPath===releaseOverride?'USER_AUTHORIZED_EXACT_ARTICLE_2026_09_23':null,redirect:null}
  })
  // Owner-authorized canonical migration, 2026-09-24. Keep frozen Salmon bytes intact.
  const about=routes.find(row=>row.routeId==='SALMON-pages-1931')
  if(!about||about.path!=='/about-ics/')throw new Error('About source authority missing')
  about.path='/about-ics-industrial-cooling-solutions/'
  about.canonical=origin+about.path
  const resource=routes.find(row=>row.routeId==='SALMON-pages-1761')
  if(!resource)throw new Error('Resources authority missing')
  routes.push({...resource,path:'/resources/',canonical:origin+'/resources/',previousCanonical:resource.previousCanonical,state:'PUBLIC',indexable:true,sitemap:true})
  resource.state='REDIRECT';resource.export=false;resource.indexable=false;resource.sitemap=false;resource.searchable=false;resource.redirect='/resources/'
  routes.push({path:'/search/',routeId:'RELEASE-SEARCH',routeClass:'search',state:'PUBLIC',export:true,indexable:false,sitemap:false,canonical:origin+'/search/',previousCanonical:'',sourceRobots:'noindex, follow',matchedArticle:false,sourceFile:'release/templates/search.tsx',sourceSha256:null,redirect:null})
  // These four source taxonomy shells render no substantive body and were already noindex.
  const privateBlankArchives=new Set(['/category/indicators-of-cooling-tower-trouble/','/category/tech-articles/','/category/uncategorized-ja/','/category/uncategorized-th/'])
  for(const route of routes)if(privateBlankArchives.has(route.path)){route.state='PRIVATE_ARCHIVE';route.export=false;route.indexable=false;route.sitemap=false;route.searchable=false}
  // Generated taxonomy listing shells duplicate their linked content; retain them for compatibility, not indexing.
  const duplicateNonindex=new Set(['/thank-you/','/testimonial-detail/','/hello-world-2/'])
  for(const route of routes)if(['categories','product_cat'].includes(route.routeClass)||duplicateNonindex.has(route.path)){route.indexable=false;route.sitemap=false;route.searchable=false}
  const r2ExactRedirects=read('content/release/r2-exact-redirects.json')
  const redirectRows=[...read('content/salmon/redirects.json'),...read('content/luxury/reconciled-redirects.json'),...r2ExactRedirects,{source:'/cooling-tower-resources/',destination:'/resources/'},{source:'/about-ics/',destination:about.path}]
  const r2ExactSources=new Set(r2ExactRedirects.map(row=>pathKey(row.source)))
  const redirects=[];const bySource=new Map()
  for(const row of redirectRows){
    const previous=bySource.get(pathKey(row.source))
    if(previous&&previous.destination!==row.destination)throw new Error(`Conflicting redirects: ${row.source}`)
    if(!previous){const redirect={source:row.source,destination:row.destination,status:r2ExactSources.has(pathKey(row.source))?301:308};bySource.set(pathKey(row.source),redirect);redirects.push(redirect)}
  }
  for(const row of redirects){
    const seen=new Set([pathKey(row.source)]);let destination=row.destination
    while(bySource.has(pathKey(destination))){if(seen.has(pathKey(destination)))throw new Error(`Redirect cycle: ${row.source}`);seen.add(pathKey(destination));destination=bySource.get(pathKey(destination)).destination}
    if(destination!==row.destination)throw new Error(`Redirect chain needs authority: ${row.source}`)
    const target=routes.find(route=>pathKey(route.path)===pathKey(destination))
    row.targetState=target?.state??'MISSING'
    if(r2ExactSources.has(pathKey(row.source))&&row.targetState!=='PUBLIC')throw new Error(`R2 exact redirect target not public: ${row.source}`)
  }
  const duplicates=routes.filter((row,i)=>routes.findIndex(other=>pathKey(other.path)===pathKey(row.path))!==i)
  if(duplicates.length)throw new Error(`Duplicate route: ${duplicates[0].path}`)
  return {version:1,origin,routes,redirects,articleHolds:653,matchedArticles:177}
}
