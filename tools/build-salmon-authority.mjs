import { chromium } from 'playwright'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const evidence = path.resolve('../salmon-authority')
const out = path.join(evidence, 'canonical')
mkdirSync(path.join(out, 'documents'), {recursive:true})
mkdirSync(path.join(out, 'media'), {recursive:true})
const origin = 'https://salmon-rhinoceros-754457.hostingersite.com'
const localUploads = '/Users/sb/Desktop/Documents/Archive/Organized_2026-09-10/03_H2O_Cooling/h2obackup/salmon-rhinoceros-754457.hostingersite.com/public_html/wp-content/uploads'
const sha = b => createHash('sha256').update(b).digest('hex')
const sharp = createRequire(path.resolve('apps/h2o/package.json'))('sharp')
const identities = readdirSync(path.join(evidence,'raw')).filter(n=>n.endsWith('.identity.json')).map(n=>{
  const entry=JSON.parse(readFileSync(path.join(evidence,'raw',n)))
  return {...entry,file:'raw/'+n.replace('.identity.json','.body')}
})
const snapshots = new Map(identities.map(i=>[i.url,i]))
const collections={}
for(const entry of identities){
  const url=new URL(entry.url)
  if(!url.pathname.startsWith('/wp-json/wp/v2/') || entry.status!==200) continue
  const key=url.pathname.split('/').at(-1)
  const items=JSON.parse(readFileSync(path.join(evidence,entry.file)))
  if(Array.isArray(items)) (collections[key]??=[]).push(...items.map(item=>({...item,restEvidence:entry.file})))
}
const routeMap=new Map()
for(const key of ['posts','pages','product','categories','tags','product_cat','product_tag','product_brand']) for(const item of collections[key]??[]) {
  if(item.link && (!item.status || item.status==='publish')) routeMap.set(item.link,{url:item.link,type:key,item})
}
for(const route of JSON.parse(readFileSync(path.join(evidence,'routes.json')))) if(!routeMap.has(route.url))routeMap.set(route.url,{url:route.url,type:route.type,item:{},discoveredFrom:route.discoveredFrom})
for(const entry of identities.filter(i=>!new URL(i.url).pathname.startsWith('/wp-json/') && i.status===200)) {
  if(entry.url.endsWith('.xml')) {
    const xml=readFileSync(path.join(evidence,entry.file),'utf8')
    for(const match of xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)){
      const url=match[1].replaceAll('&amp;','&')
      if(new URL(url).origin===origin && !url.endsWith('.xml') && !routeMap.has(url))routeMap.set(url,{url,type:'sitemap-discovered',item:{}})
    }
  }
}
const ledger={routes:[],copy:[],seo:[],media:[],structure:[],links:[],downloads:[],unresolved:[]}
const writeTSV=(name,rows,keys)=>{
  keys??=[...new Set(rows.flatMap(Object.keys))]
  const value=v=>typeof v==='object'?JSON.stringify(v):String(v??'')
  writeFileSync(path.join(out,name),[keys.join('\t'),...rows.map(r=>keys.map(k=>value(r[k]).replaceAll('\\','\\\\').replaceAll('\t','\\t').replaceAll('\r','\\r').replaceAll('\n','\\n')).join('\t'))].join('\n')+'\n')
}
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({javaScriptEnabled:false})
await page.route('**/*',r=>r.abort())
const manifest=[]
for(const route of [...routeMap.values()].sort((a,b)=>a.url.localeCompare(b.url))){
  const routeId='SALMON-'+(route.item.id?`${route.type}-${route.item.id}`:sha(route.url).slice(0,16))
  const snapshot=snapshots.get(route.url)
  const sourceHeld=snapshot?.status===200
  const html=sourceHeld?readFileSync(path.join(evidence,snapshot.file),'utf8'):''
  await page.setContent(html || '<html><body></body></html>',{waitUntil:'domcontentloaded'})
  const parsed=await page.evaluate(({rest,type})=>{
    const norm=v=>(v??'').replace(/\s+/g,' ').trim()
    const selector='.elementor-widget-theme-post-content .elementor-widget-container'
    const root=document.querySelector(selector)??document.querySelector('[data-elementor-type="wp-page"]')??document.querySelector('main')??document.querySelector('[data-elementor-type="single-post"]')??document.querySelector('[data-elementor-type="product"]')??document.querySelector('[data-elementor-type="archive"]')
    const metas=[...document.querySelectorAll('meta[name],meta[property]')].map(n=>({name:n.getAttribute('name')??n.getAttribute('property'),value:n.getAttribute('content')??''}))
    const seo={title:document.title,meta:metas,canonical:[...document.querySelectorAll('link[rel="canonical"]')].map(n=>n.getAttribute('href')),h1:[...document.querySelectorAll('h1')].map(n=>norm(n.textContent)),schema:[...document.querySelectorAll('script[type="application/ld+json"]')].map(n=>n.textContent)}
    const content=root?.cloneNode(true)??document.createElement('div')
    if(!root && rest.content?.rendered)content.innerHTML=rest.content.rendered
    content.querySelectorAll('script,style,noscript,template').forEach(n=>n.remove())
    const tree=n=>{
      if(n.nodeType===Node.TEXT_NODE)return n.textContent
      if(n.nodeType!==Node.ELEMENT_NODE)return null
      return {tag:n.tagName.toLowerCase(),attrs:Object.fromEntries([...n.attributes].map(a=>[a.name,a.value])),children:[...n.childNodes].map(tree).filter(n=>n!==null)}
    }
    let section='INTRODUCTION',sequence=0
    const structures=[],images=[],links=[],downloads=[]
    for(const n of content.querySelectorAll('*')){
      if(/^H[1-6]$/.test(n.tagName))section=norm(n.textContent)
      if(n.matches('h1,h2,h3,h4,h5,h6,p,ol,ul,table,figure,figcaption,details,summary'))structures.push({sequence:++sequence,tag:n.tagName.toLowerCase(),section,text:norm(n.textContent),html:n.outerHTML})
      if(n.tagName==='IMG')images.push({order:images.length+1,section,kind:'img',src:n.getAttribute('data-src')||n.getAttribute('src')||'',srcset:n.getAttribute('srcset')||'',alt:n.getAttribute('alt'),caption:n.closest('figure')?.querySelector('figcaption')?.textContent??null,attachmentClass:n.className})
      if(n.hasAttribute('data-settings')){
        try{
          const settings=JSON.parse(n.getAttribute('data-settings'))
          for(const [key,value] of Object.entries(settings)) if(key.includes('background') && value && typeof value==='object' && value.url) images.push({order:images.length+1,section,kind:key,src:value.url,attachmentId:value.id??null,alt:null,caption:null,elementId:n.getAttribute('data-id')})
        }catch{}
      }
      if(n.tagName==='A' && n.hasAttribute('href')){
        const entry={order:links.length+1,section,href:n.getAttribute('href'),text:norm(n.textContent)}
        links.push(entry)
        if(/\.(pdf|docx?|xlsx?|zip|dwg)(?:[?#]|$)/i.test(entry.href)||n.hasAttribute('download'))downloads.push(entry)
      }
    }
    const featured=document.querySelector('.elementor-widget-theme-post-featured-image img')
    if(featured && root && !root.contains(featured))images.unshift({order:0,section:'FEATURED',src:featured.getAttribute('src'),alt:featured.getAttribute('alt'),caption:null,attachmentClass:featured.className})
    const chrome=[...document.querySelectorAll('[data-elementor-type="header"],[data-elementor-type="footer"]')].map(n=>{
      const clone=n.cloneNode(true);clone.querySelectorAll('script,style,noscript,template').forEach(n=>n.remove())
      return {region:n.getAttribute('data-elementor-type'),text:norm(clone.textContent),tree:tree(clone)}
    })
    return {bodySelector:root?.matches(selector)?selector:root?.getAttribute('data-elementor-type')??root?.tagName??'REST_FALLBACK',contentHtml:content.innerHTML,text:norm(content.textContent),children:[...content.childNodes].map(tree).filter(n=>n!==null),chrome,seo,structures,images,links,downloads,author:document.querySelector('.elementor-post-info__item--type-author')?.textContent?.trim()??null,date:document.querySelector('.elementor-post-info__item--type-date')?.textContent?.trim()??null}
  },{rest:route.item,type:route.type})
  const sourceSha=html?sha(html):sha(JSON.stringify(route.item))
  const doc={routeId,sourceUrl:route.url,targetPath:new URL(route.url).pathname,type:route.type,wordpressId:route.item.id??null,sourceIdentity:{snapshot:snapshot?.file??null,status:snapshot?.status??null,effectiveUrl:snapshot?.effectiveUrl??route.url,sha256:sourceSha,restEvidence:route.item.restEvidence??null},publicationStatus:route.item.status??(sourceHeld?'PUBLIC_ARCHIVE':'SOURCE_UNAVAILABLE'),title:route.item.title?.rendered??route.item.name??parsed.seo.title,authorId:route.item.author??null,published:route.item.date??null,modified:route.item.modified??null,...parsed}
  const bytes=JSON.stringify(doc,null,2)+'\n'
  writeFileSync(path.join(out,'documents',routeId+'.json'),bytes)
  manifest.push({routeId,sourceUrl:route.url,targetPath:doc.targetPath,file:'documents/'+routeId+'.json',sha256:sha(bytes)})
  ledger.routes.push({route_id:routeId,source_url:route.url,target_url:'https://h2ocooling.com'+doc.targetPath,content_type:route.type,title:doc.title,h1:parsed.seo.h1,publication_status:doc.publicationStatus,source_sha256:sourceSha,seo_sha256:sha(JSON.stringify(parsed.seo)),media_count:parsed.images.length,source_authority_state:sourceHeld?'SALMON_PUBLIC_SNAPSHOT':'SOURCE_UNAVAILABLE',rest_evidence:route.item.restEvidence,html_evidence:snapshot?.file})
  ledger.copy.push({route_id:routeId,source_url:route.url,field:'BODY',value:parsed.text,sha256:sha(parsed.text),source_sha256:sourceSha,body_selector:parsed.bodySelector})
  for(const region of parsed.chrome)ledger.copy.push({route_id:routeId,source_url:route.url,field:region.region.toUpperCase(),value:region.text,sha256:sha(region.text),source_sha256:sourceSha})
  for(const [field,value]of Object.entries(parsed.seo))ledger.seo.push({route_id:routeId,field,value,source_sha256:sourceSha})
  for(const entry of parsed.structures)ledger.structure.push({route_id:routeId,...entry,source_sha256:sourceSha})
  for(const entry of parsed.images)ledger.media.push({route_id:routeId,...entry,source_sha256:sourceSha,authority:'OWNER_APPROVED_SALMON',binary_state:'NOT_YET_VERIFIED'})
  for(const entry of parsed.links){let url;try{url=new URL(entry.href,route.url)}catch{continue}if([new URL(origin).hostname,'h2ocooling.com','www.h2ocooling.com'].includes(url.hostname))ledger.links.push({route_id:routeId,...entry,source_sha256:sourceSha})}
  for(const entry of parsed.downloads)ledger.downloads.push({route_id:routeId,...entry,source_sha256:sourceSha})
  if(!sourceHeld||!parsed.text)ledger.unresolved.push({route_id:routeId,issue:!sourceHeld?'SOURCE_UNAVAILABLE':'CONTENT_BOUNDARY_EMPTY',source_url:route.url})
}
await browser.close()
// Preserve attachment relationships and original files separately from page placement.
const attachments=[]
for(const item of (collections.media??[]).sort((a,b)=>a.id-b.id)){
  const url=item.source_url
  let original=null
  try{const p=decodeURIComponent(new URL(url).pathname).split('/wp-content/uploads/')[1];if(p && !p.split('/').includes('..')) original=path.join(localUploads,p)}catch{}
  let binary={state:'SOURCE_UNAVAILABLE'}
  const recoveredRemote=path.join(evidence,'recovered-media',sha(url)+path.extname(new URL(url).pathname))
  if(existsSync(recoveredRemote))original=recoveredRemote
  if(original && existsSync(original)){
    const bytes=readFileSync(original),hash=sha(bytes),ext=path.extname(original)
    const file='media/'+hash+ext
    if(!existsSync(path.join(out,file)))copyFileSync(original,path.join(out,file))
    let dimensions={};try{const m=await sharp(bytes).metadata();dimensions={width:m.width,height:m.height,format:m.format}}catch{}
    binary={state:'LOCAL_SALMON_ORIGINAL_RECOVERED',file,sha256:hash,bytes:bytes.length,...dimensions}
  }
  attachments.push({attachment_id:item.id,source_url:url,source_filename:url?.split('/').at(-1),parent_post:item.post,alt:item.alt_text,caption:item.caption?.rendered,title:item.title?.rendered,description:item.description?.rendered,source_details:item.media_details,rest_evidence:item.restEvidence,...binary})
}
writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
writeFileSync(path.join(out,'attachments.json'),JSON.stringify(attachments,null,2)+'\n')
for(const [name,key]of Object.entries({SALMON_ROUTE_AUTHORITY:'routes',SALMON_COPY_AUTHORITY:'copy',SALMON_SEO_AUTHORITY:'seo',SALMON_MEDIA_AUTHORITY:'media',SALMON_ARTICLE_STRUCTURE:'structure',SALMON_INTERNAL_LINKS:'links',SALMON_DOWNLOADS:'downloads',UNRESOLVED_SOURCE:'unresolved'}))writeTSV(name+'.tsv',ledger[key],ledger[key].length?undefined:['route_id','issue','source_url'])
writeTSV('SALMON_ATTACHMENT_AUTHORITY.tsv',attachments)
const overrides=[]
for(const kind of ['CONTACT','TESTIMONIAL']){
 const filename=`OWNER_${kind}_AUTHORITY_OVERRIDE_2026_09_21.json`
 const bytes=readFileSync(path.join('apps/h2o/content/2d-launch-cohort',filename))
 copyFileSync(path.join('apps/h2o/content/2d-launch-cohort',filename),path.join(out,filename))
 const authority=JSON.parse(bytes)
 for(const record of authority.offices??authority.records)overrides.push({authority_id:authority.authorityId,record_id:record.officeKey??record.recordId,value:record,sha256:sha(bytes),precedence:'OWNER_OVERRIDE > SALMON; no AI rewrite'})
}
writeTSV('OWNER_OVERRIDE_AUTHORITY.tsv',overrides)
console.log(JSON.stringify({routes:manifest.length,articles:collections.posts?.length,pages:collections.pages?.length,products:collections.product?.length,attachments:attachments.length,unresolved:ledger.unresolved.length},null,2))
