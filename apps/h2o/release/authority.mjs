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
  // Master SEO Pass R1 (Control Tower brief 2026-10-04, OGCS decisions): held articles that passed the content check publish,
  // self canonicals, the ranking archives that list public items become indexable, and live pages consolidated by redirect
  // become REDIRECT rows. The scripted Payload batch (ops/seo-pass) applies exactly these rows.
  const seoPass=read('content/release/seo-pass-r1.json')
  const seoPublish=new Set(seoPass.publish)
  // Locale Part B (owner decision 2026-10-05, OGCS Part A): the preserved live locale pages, captured from the live site
  // with provenance (content/salmon/r3-locale-routes.json). They are LIVE-family sources; search stays English-only.
  const sourceRoutes=[...read('content/salmon/active-routes.json'),...read('content/salmon/r2-live-routes.json'),...read('content/salmon/r3-locale-routes.json')]
  const routes=sourceRoutes.map(row=>{
    const bytes=readFileSync(path.join(root,'content/salmon',row.file))
    if(hash(bytes)!==row.sha256)throw new Error(`Source changed: ${row.routeId}`)
    const doc=JSON.parse(bytes)
    const held=!row.routeId.startsWith('LIVE-')&&(heldIds.has(row.routeId)||heldPaths.has(pathKey(row.targetPath)))&&row.targetPath!==releaseOverride&&!seoPublish.has(row.targetPath)
    if(matched.has(row.routeId)&&matched.get(row.routeId)!==row.targetPath)throw new Error(`Article path mismatch: ${row.routeId}`)
    const previousCanonical=doc.seo.canonical[0]??''
    const canonical=new URL(seoPass.canonical[row.targetPath]||previousCanonical||row.targetPath,origin)
    const sameOrigin=[origin,sourceOrigin].includes(canonical.origin)
    if(sameOrigin)canonical.host='h2ocooling.com'
    canonical.protocol='https:'
    const sourceRobots=doc.seo.meta.find(meta=>meta.name==='robots')?.value??'index, follow'
    const self=pathKey(canonical.pathname)===pathKey(row.targetPath)
    const indexable=!held&&self&&sameOrigin&&!/\bnoindex\b/i.test(sourceRobots)
    return {path:row.targetPath,routeId:row.routeId,sourceFile:row.file,sourceSha256:row.sha256,routeClass:doc.type,state:held?'REVIEW_HOLD':'PUBLIC',export:!held,indexable,sitemap:indexable,searchable:indexable&&['pages','product','posts'].includes(doc.type)&&!row.routeId.startsWith('LIVE-LOCALE-'),canonical:canonical.href,previousCanonical,sourceRobots,matchedArticle:matched.has(row.routeId),releaseOverride:row.targetPath===releaseOverride?'USER_AUTHORIZED_EXACT_ARTICLE_2026_09_23':null,redirect:null}
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
  // Owner decision 2026-10-02 (Control Tower ruling): the author archive's canonical address is /author/timbozic/.
  // Frozen bytes and the source record stay; the new address is an alias row (imported as an alias record), and
  // reviewed admin redirect records send /author/tbozic/ and the dummy author archive here.
  const author=routes.find(row=>row.routeId==='SALMON-b2503fcd6ca86806')
  if(!author||author.path!=='/author/tbozic/')throw new Error('Author source authority missing')
  routes.push({...author,path:'/author/timbozic/',canonical:origin+'/author/timbozic/',indexable:false,sitemap:false,searchable:false})
  routes.push({path:'/search/',routeId:'RELEASE-SEARCH',routeClass:'search',state:'PUBLIC',export:true,indexable:false,sitemap:false,canonical:origin+'/search/',previousCanonical:'',sourceRobots:'noindex, follow',matchedArticle:false,sourceFile:'release/templates/search.tsx',sourceSha256:null,redirect:null})
  const serviceFile='content/english-completion/service-pages.json'
  const serviceBytes=readFileSync(path.join(root,serviceFile))
  const services=JSON.parse(serviceBytes.toString())
  if(services.length!==6||new Set(services.map(service=>service.path)).size!==6)throw new Error('Six distinct English service pages required')
  const serviceHash=hash(serviceBytes)
  for(const service of services){
    if(!/^\/[-a-z]+\/$/.test(service.path)||!/^ENGLISH-SERVICE-/.test(service.id)||!service.title||!service.lead)throw new Error('Invalid English service route')
    routes.push({path:service.path,routeId:service.id,routeClass:'service',state:'PUBLIC',export:true,indexable:true,sitemap:true,searchable:true,canonical:origin+service.path,previousCanonical:'',sourceRobots:'index, follow',matchedArticle:false,sourceFile:serviceFile,sourceSha256:serviceHash,redirect:null})
  }
  // These four source taxonomy shells render no substantive body and were already noindex.
  const privateBlankArchives=new Set(['/category/indicators-of-cooling-tower-trouble/','/category/tech-articles/','/category/uncategorized-ja/','/category/uncategorized-th/'])
  for(const route of routes)if(privateBlankArchives.has(route.path)){route.state='PRIVATE_ARCHIVE';route.export=false;route.indexable=false;route.sitemap=false;route.searchable=false}
  // Generated taxonomy listing shells duplicate their linked content; retain them for compatibility, not indexing.
  const duplicateNonindex=new Set(['/thank-you/','/testimonial-detail/','/hello-world-2/'])
  for(const route of routes)if(['categories','product_cat'].includes(route.routeClass)&&!seoPass.index.includes(route.path)||duplicateNonindex.has(route.path)){route.indexable=false;route.sitemap=false;route.searchable=false}
  // FBG-12 (OGCS, CT 2026-10-11): an article's address is restored to the ranking URL. The ranking URL is a second public address (an alias
  // row of the same source route, like /author/timbozic/); the old address becomes a REDIRECT row to it (redirectSources) and the alias row
  // is added BEFORE that loop so it keeps the PUBLIC state. Self canonical, indexable, in the sitemap.
  for(const [from,to] of Object.entries(seoPass.aliases??{})){
    const route=routes.find(row=>row.path===from)
    if(!route||route.state!=='PUBLIC')throw new Error(`SEO pass alias source not a public route: ${from}`)
    // the alias address is its own canonical: indexable unless the source robots say noindex (the source row's canonical pointed at its old address)
    const indexable=!/\bnoindex\b/i.test(route.sourceRobots)
    routes.push({...route,path:to,canonical:origin+to,redirect:null,indexable,sitemap:indexable,searchable:indexable&&['pages','product','posts'].includes(route.routeClass)})
  }
  for(const [source,destination] of Object.entries(seoPass.redirectSources)){
    const route=routes.find(row=>row.path===source)
    if(!route||route.state!=='PUBLIC')throw new Error(`SEO pass redirect source not a public route: ${source}`)
    Object.assign(route,{state:'REDIRECT',export:false,indexable:false,sitemap:false,searchable:false,redirect:destination})
  }
  const r2ExactRedirects=read('content/release/r2-exact-redirects.json')
  const droppedRedirects=new Set((seoPass.droppedRedirects??[]).map(pathKey)) // a source that is a public page again (FBG-12)
  const redirectRows=[...read('content/salmon/redirects.json'),...read('content/luxury/reconciled-redirects.json'),...r2ExactRedirects,{source:'/cooling-tower-resources/',destination:'/resources/'},{source:'/about-ics/',destination:about.path}]
  const r2ExactSources=new Set(r2ExactRedirects.map(row=>pathKey(row.source)))
  for(let i=redirectRows.length-1;i>=0;i--)if(droppedRedirects.has(pathKey(redirectRows[i].source)))redirectRows.splice(i,1)
  // R2.4 (CT 2026-10-05, SEO Checker item k): every ledger redirect is a permanent 301 (was 308 except the R2 exact rows).
  const redirects=[];const bySource=new Map()
  for(const row of redirectRows){
    const previous=bySource.get(pathKey(row.source))
    if(previous&&previous.destination!==row.destination)throw new Error(`Conflicting redirects: ${row.source}`)
    if(!previous){const redirect={source:row.source,destination:row.destination,status:301};bySource.set(pathKey(row.source),redirect);redirects.push(redirect)}
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
