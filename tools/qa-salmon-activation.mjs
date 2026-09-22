import {chromium} from 'playwright'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
const root=path.resolve('apps/h2o/content/salmon'),out=path.resolve('../salmon-activation-evidence')
mkdirSync(out,{recursive:true});mkdirSync(path.join(out,'rendered'),{recursive:true})
const manifest=JSON.parse(readFileSync(path.join(root,'active-routes.json')))
const media=JSON.parse(readFileSync(path.join(root,'media-identities.json'))),mediaMap=new Map(media.map(m=>[m.url,m]))
const norm=s=>String(s??'').replace(/\s+/g,' ').trim(),hash=s=>createHash('sha256').update(s).digest('hex')
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const exceptions=[],results=[],linkRows=[]
const sourceText=n=>typeof n==='string'?n:n.children.map(sourceText).join('')
const owner=s=>s.replaceAll('+66-2-260-6598','+662-661-7723')
const noCommerce=n=>typeof n!=='string'&&/(?:^|\s)(?:price|woocommerce-Price-amount|add_to_cart_button|single_add_to_cart_button|checkout-button|cart_totals)(?:\s|$)/.test(n.attrs.class??'')
function expectedText(n,doc,key){
 if(typeof n==='string'){
  if(doc.type==='product'&&/[$€£]\s*\d/.test(n)){exceptions.push({route:doc.targetPath,node:key,kind:'NO_PUBLIC_PRICE',source:n});return ''}
  if(owner(n)!==n)exceptions.push({route:doc.targetPath,node:key,kind:'OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21',source:n,replacement:owner(n)})
  return owner(n)
 }
 if(noCommerce(n)){exceptions.push({route:doc.targetPath,node:key,kind:'NO_PUBLIC_COMMERCE',source:sourceText(n)});return ''}
 if(['script','style','iframe','svg','template','input','textarea'].includes(n.tag)){
  const text=sourceText(n);if(norm(text))exceptions.push({route:doc.targetPath,node:key,kind:'SAFETY_CONTROL_TEXT',source:text})
  return ''
 }
 return n.children.map((c,i)=>expectedText(c,doc,`${key}.${i}`)).join('')
}
function schemaExpected(v){if(Array.isArray(v))return v.map(schemaExpected);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['offers','price','lowPrice','highPrice','priceCurrency'].includes(k)).map(([k,v])=>[k,schemaExpected(v)]));return typeof v==='string'?owner(v):v}
const redirects=JSON.parse(readFileSync(path.join(root,'redirects.json')))
const activePaths=new Set(manifest.map(r=>decodeURIComponent(r.targetPath)))
const aliasMap=new Map(redirects.map(r=>[decodeURIComponent(r.source),decodeURIComponent(r.destination)]))
const browser=await chromium.launch()
const queue=process.env.LIMIT?manifest.slice(0,Number(process.env.LIMIT)):[...manifest]
if(process.env.RECHECK&&existsSync(path.join(out,'route-results.json'))){
 const previous=JSON.parse(readFileSync(path.join(out,'route-results.json')))
 const recheck=new Set(previous.filter(r=>r.copy==='COPY_PARITY_FAIL'||r.seo==='SEO_PARITY_FAIL'||r.mediaDifferences?.length||r.overflow||r.error||r.type==='product').map(r=>r.route))
 queue.splice(0,queue.length,...manifest.filter(r=>recheck.has(r.targetPath)))
 results.push(...previous.filter(r=>!recheck.has(r.route)))
 for(const [file,array]of [['exceptions.json',exceptions],['internal-links.json',linkRows]])array.push(...JSON.parse(readFileSync(path.join(out,file))).filter(r=>!recheck.has(r.route)))
 console.log('Rechecking',queue.length,'changed/failing routes; retaining',results.length,'unchanged measured renders')
}
let count=0
await Promise.all(Array.from({length:4},async()=>{
 const page=await browser.newPage({javaScriptEnabled:false,viewport:{width:1440,height:1000}})
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:3110'&&!['image','font','media'].includes(r.request().resourceType())?r.continue():r.abort())
 while(queue.length){
  const route=queue.shift(),doc=JSON.parse(readFileSync(path.join(root,route.file)))
  if(norm(doc.children.map(sourceText).join(''))!==norm(doc.text))throw new Error('Source tree/text identity mismatch '+route.targetPath)
  const expected={body:norm(doc.children.map((n,i)=>expectedText(n,doc,`body.${i}`)).join(''))}
  for(const c of doc.chrome)expected[c.region]=norm(expectedText(c.tree,doc,c.region))
  try{
   const response=await page.goto('http://127.0.0.1:3110'+route.targetPath,{waitUntil:'domcontentloaded',timeout:120000})
   await page.waitForLoadState('load')
   const html=await page.content()
   const actual=await page.evaluate(()=>{
    const norm=s=>(s??'').replace(/\s+/g,' ').trim()
    const regions={}
    for(const n of document.querySelectorAll('[data-salmon-region]')){const clone=n.cloneNode(true);clone.querySelectorAll('[data-source-media-unavailable]').forEach(n=>n.remove());regions[n.getAttribute('data-salmon-region')]=norm(clone.textContent)}
    return {id:document.querySelector('[data-salmon-document]')?.getAttribute('data-salmon-document'),regions,title:document.title,meta:[...document.querySelectorAll('meta[name],meta[property]')].map(n=>({name:n.getAttribute('name')??n.getAttribute('property'),value:n.getAttribute('content')})),canonical:[...document.querySelectorAll('link[rel="canonical"]')].map(n=>n.getAttribute('href')),h1:[...document.querySelectorAll('h1')].map(n=>norm(n.textContent)),schema:[...document.querySelectorAll('[data-source-schema]')].map(n=>JSON.parse(n.textContent)),images:[...document.querySelectorAll('main [data-source-src],main [data-source-media-unavailable]')].map(n=>({source:n.getAttribute('data-source-src')??n.getAttribute('data-source-media-unavailable'),alt:n.getAttribute('alt'),src:n.getAttribute('src'),sha256:n.getAttribute('data-source-sha256'),unavailable:n.hasAttribute('data-source-media-unavailable')})),links:[...document.querySelectorAll('main a[data-source-href]')].map(n=>({source:n.getAttribute('data-source-href'),href:n.getAttribute('href')})),headings:[...document.querySelectorAll('main h1,main h2,main h3')].map(n=>({tag:n.tagName.toLowerCase(),text:norm(n.textContent)})),overflow:document.documentElement.scrollWidth>innerWidth+1,commerce:!!document.querySelector('form,button[name="add-to-cart"],a[href*="add-to-cart="],a[href="/checkout/"]')}
   })
   const copyDifferences=Object.keys(expected).filter(k=>expected[k]!==actual.regions[k])
   const seoDifferences=[]
   if(actual.title!==doc.seo.title)seoDifferences.push('TITLE')
   if(!equal(actual.canonical,doc.seo.canonical))seoDifferences.push('CANONICAL')
   if(!equal(actual.h1,doc.seo.h1))seoDifferences.push('H1')
   for(const m of doc.seo.meta.filter(m=>!['robots','googlebot','viewport'].includes(m.name))){
     const forbidden=doc.type==='product'&&(/price/i.test(m.name)||/[$€£]\s*\d/.test(m.value)||(m.name==='twitter:label1'&&m.value==='Price'))
     if(forbidden){exceptions.push({route:doc.targetPath,node:`SEO:${m.name}`,kind:'NO_PUBLIC_PRICE_METADATA',source:m.value});if(actual.meta.some(v=>v.name===m.name&&v.value===m.value))seoDifferences.push('PUBLIC_PRICE_METADATA')}
     else if(!actual.meta.some(v=>v.name===m.name&&v.value===m.value))seoDifferences.push(m.name)
   }
   if(!equal(actual.schema,doc.seo.schema.map(s=>schemaExpected(JSON.parse(s)))))seoDifferences.push('SCHEMA')
   const expectedLinks=[]
   const expectedHeadings=[]
   const structuralCounts={p:0,h2:0,h3:0,ul:0,ol:0,li:0,table:0,figure:0,figcaption:0}
   function inspect(n){
     if(typeof n==='string'||noCommerce(n)||['script','style','iframe','svg','template','input','textarea'].includes(n.tag))return
     if(n.tag==='a')expectedLinks.push(n.attrs.href??'')
     if(['h1','h2','h3'].includes(n.tag))expectedHeadings.push({tag:n.tag,text:norm(owner(sourceText(n)))})
     if(n.tag in structuralCounts)structuralCounts[n.tag]++
     n.children.forEach(inspect)
   }
   doc.children.forEach(inspect)
   if(!equal(expectedLinks,actual.links.map(l=>l.source)))seoDifferences.push('INTERNAL_LINK_AUTHORITY')
   const actualCounts=await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,document.querySelectorAll(`main ${k}`).length])),Object.keys(structuralCounts))
   const structureMatches=equal(actual.headings,expectedHeadings)&&equal(actualCounts,structuralCounts)
   const sourceImages=doc.images
   const mediaDifferences=[]
   if(sourceImages.length!==actual.images.length)mediaDifferences.push('COUNT')
   for(let i=0;i<sourceImages.length;i++){
    const original=sourceImages[i],shown=actual.images[i],identity=mediaMap.get(new URL(original.src,doc.sourceUrl).href)
    if(shown?.source!==original.src)mediaDifferences.push(`ORDER_OR_SOURCE_${i}`)
    if(identity?.file&&shown?.sha256!==identity.sha256)mediaDifferences.push(`HELD_BINARY_NOT_ACTIVATED_${i}`)
    if(identity?.file&&shown?.alt!==(original.alt??null))seoDifferences.push(`IMAGE_ALT_${i}`)
    if(!identity?.file&&!shown?.unavailable)mediaDifferences.push(`UNAVAILABLE_NOT_EXPLICIT_${i}`)
   }
   for(const link of actual.links){
    let u;try{u=new URL(link.source,doc.sourceUrl)}catch{continue}
    if(!['salmon-rhinoceros-754457.hostingersite.com','h2ocooling.com','www.h2ocooling.com'].includes(u.hostname)||u.pathname.startsWith('/wp-content/')||/\.[a-z0-9]{2,5}$/i.test(u.pathname))continue
    const key=decodeURIComponent(u.pathname),state=activePaths.has(key)?'ACTIVE':aliasMap.has(key)?'VERIFIED_REDIRECT':'BROKEN_OR_UNRESOLVED'
    linkRows.push({route:route.targetPath,source_target:link.source,state,effective_path:aliasMap.get(key)??key})
   }
   const unavailableSources=[...new Set([...doc.images.map(i=>i.src),...(doc.downloads??[]).map(d=>d.href)].filter(url=>!mediaMap.get(new URL(url,doc.sourceUrl).href)?.file))]
   const row={routeId:route.routeId,route:route.targetPath,type:doc.type,status:response.status(),documentMatches:actual.id===route.routeId,copy:copyDifferences.length?'COPY_PARITY_FAIL':'COPY_PARITY_PASS',copyDifferences,seo:seoDifferences.length?'SEO_PARITY_FAIL':'SEO_PARITY_PASS',seoDifferences,media:mediaDifferences.length||unavailableSources.length?'MEDIA_PARITY_FAIL':'MEDIA_PARITY_PASS',mediaDifferences,unavailableSources,unavailableImages:actual.images.filter(i=>i.unavailable).length,structureMatches,structuralCounts,actualCounts,articleComplete:doc.type==='posts'?copyDifferences.length===0&&structureMatches:null,overflow:actual.overflow,commerce:actual.commerce,robots:response.headers()['x-robots-tag'],renderedSha256:hash(html),textSha256:hash(actual.regions.body??''),expectedTextSha256:hash(expected.body)}
   results.push(row)
   if(copyDifferences.length||seoDifferences.length||mediaDifferences.length||actual.overflow)writeFileSync(path.join(out,'rendered',route.routeId+'.json'),JSON.stringify({row,expected,actual},null,2)+'\n')
  }catch(e){results.push({routeId:route.routeId,route:route.targetPath,error:e.message,copy:'COPY_PARITY_FAIL',seo:'SEO_PARITY_FAIL',media:'MEDIA_PARITY_FAIL'})}
  count++;if(count%100===0)console.log('Validated',count)
 }
 await page.close()
}))
await browser.close()
results.sort((a,b)=>a.route.localeCompare(b.route))
writeFileSync(path.join(out,'route-results.json'),JSON.stringify(results,null,2)+'\n')
writeFileSync(path.join(out,'exceptions.json'),JSON.stringify(exceptions,null,2)+'\n')
writeFileSync(path.join(out,'internal-links.json'),JSON.stringify(linkRows,null,2)+'\n')
console.log({routes:results.length,copyFail:results.filter(r=>r.copy==='COPY_PARITY_FAIL').length,seoFail:results.filter(r=>r.seo==='SEO_PARITY_FAIL').length,mediaFail:results.filter(r=>r.media==='MEDIA_PARITY_FAIL').length,overflow:results.filter(r=>r.overflow).length,errors:results.filter(r=>r.error).length})
