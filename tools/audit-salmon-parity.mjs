import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
const root=path.resolve('../salmon-authority'),data=path.join(root,'canonical')
const norm=s=>String(s??'').replace(/\s+/g,' ').trim()
const sha=v=>createHash('sha256').update(v).digest('hex')
const tsv=(file,rows,keys)=>{
 keys??=[...new Set(rows.flatMap(Object.keys))]
 const val=v=>(typeof v==='object'?JSON.stringify(v):String(v??'')).replaceAll('\\','\\\\').replaceAll('\t','\\t').replaceAll('\r','\\r').replaceAll('\n','\\n')
 writeFileSync(path.join(data,file),[keys.join('\t'),...rows.map(r=>keys.map(k=>val(r[k])).join('\t'))].join('\n')+'\n')
}
// Only whitespace is ignored. Word, punctuation, ordering and omission changes fail.
for(const [a,b,expected]of [['a\n b','a b',true],['A.','A',false],['first second','second first',false],['a paragraph b','a b',false]])if((norm(a)===norm(b))!==expected)throw new Error('Parity verifier self-test failed')
const manifest=JSON.parse(readFileSync(path.join(data,'manifest.json')))
const index=readFileSync('apps/h2o/content/2d-launch-cohort/PAGE_CONTENT_INDEX.tsv','utf8').trim().split('\n')
const keys=index.shift().split('\t')
const registered=index.map(l=>Object.fromEntries(l.split('\t').map((v,i)=>[keys[i],v])))
const candidate=new Map()
mkdirSync(path.join(root,'candidate-rendered'),{recursive:true})
const browser=await chromium.launch()
const page=await browser.newPage({javaScriptEnabled:false})
await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:3104'?r.continue():r.abort())
for(const route of registered){
 const cached=path.join(root,'candidate-rendered',route.route_id+'.json')
 if(process.env.REUSE_CAPTURE && existsSync(cached)){candidate.set(route.canonical_path,JSON.parse(readFileSync(cached)));continue}
 const response=await page.goto('http://127.0.0.1:3104'+route.canonical_path,{waitUntil:'domcontentloaded',timeout:90000})
 const html=await page.content()
 writeFileSync(path.join(root,'candidate-rendered',route.route_id+'.html'),html)
 const parsed=await page.evaluate(()=>{
  const norm=s=>(s??'').replace(/\s+/g,' ').trim()
  const main=document.querySelector('main')?.cloneNode(true)
  main?.querySelectorAll('script,style,noscript,template').forEach(n=>n.remove())
  return {text:norm(main?.textContent),seo:{title:document.title,meta:[...document.querySelectorAll('meta[name],meta[property]')].map(n=>({name:n.getAttribute('name')??n.getAttribute('property'),value:n.getAttribute('content')??''})),canonical:[...document.querySelectorAll('link[rel="canonical"]')].map(n=>n.getAttribute('href')),h1:[...document.querySelectorAll('h1')].map(n=>norm(n.textContent)),schema:[...document.querySelectorAll('script[type="application/ld+json"]')].map(n=>n.textContent)},images:[...document.querySelectorAll('main img')].map((n,i)=>({order:i+1,src:n.getAttribute('src'),alt:n.getAttribute('alt'),caption:n.closest('figure')?.querySelector('figcaption')?.textContent??null})),links:[...document.querySelectorAll('main a[href]')].map(n=>({href:n.getAttribute('href'),text:norm(n.textContent)}))}
 })
 const record={...parsed,status:response.status(),routeId:route.route_id,htmlSha256:sha(html),evidence:'candidate-rendered/'+route.route_id+'.html'}
 candidate.set(route.canonical_path,record)
 writeFileSync(cached,JSON.stringify(record,null,2)+'\n')
 console.log(route.route_id,response.status())
}
await browser.close()
const copy=[],seo=[],media=[],delta=[],orphan=[]
for(const item of manifest){
 const source=JSON.parse(readFileSync(path.join(data,item.file)))
 const current=candidate.get(item.targetPath)
 const unavailable=!source.text||!source.sourceIdentity.snapshot
 const copyState=unavailable?'SOURCE_UNAVAILABLE':current?.status===200&&norm(source.text)===norm(current.text)?'COPY_PARITY_PASS':'COPY_PARITY_FAIL'
 const proof=current?.evidence??'apps/h2o/content/2d-launch-cohort/PAGE_CONTENT_INDEX.tsv + catch-all dynamicParams=false'
 copy.push({route_id:item.routeId,source_url:item.sourceUrl,target_path:item.targetPath,state:copyState,reason:unavailable?'SOURCE_CONTENT_NOT_HELD':!current?'NO_REGISTERED_CANDIDATE_ROUTE':copyState==='COPY_PARITY_PASS'?'EXACT_NORMALIZED_TEXT':'RENDERED_CONTENT_DIFFERS',source_text_sha256:sha(norm(source.text)),candidate_text_sha256:current?sha(norm(current.text)):'',candidate_evidence:proof})
 const mismatches=[]
 for(const field of ['title','meta','canonical','h1','schema'])if(JSON.stringify(source.seo[field])!==JSON.stringify(current?.seo[field]))mismatches.push(field)
 if(JSON.stringify(source.images.map(x=>x.alt))!==JSON.stringify(current?.images.map(x=>x.alt)))mismatches.push('IMAGE_ALT')
 if(JSON.stringify(source.links.map(x=>({href:x.href,text:x.text})))!==JSON.stringify(current?.links))mismatches.push('INTERNAL_LINKS')
 seo.push({route_id:item.routeId,state:unavailable?'SOURCE_NOT_HELD':!mismatches.length?'SEO_PARITY_PASS':'SEO_PARITY_FAIL',mismatches,private_staging_robots:'NOINDEX_LOCK_PRESERVED; source SEO not rewritten',candidate_evidence:proof})
 // Local substitute paths alone cannot prove the accepted source binary identity.
 const equalImages=current && current.status===200 && source.images.length===0 && current.images.length===0
 media.push({route_id:item.routeId,state:unavailable?'SOURCE_ASSOCIATION_UNKNOWN':equalImages?'MEDIA_PARITY_PASS':'MEDIA_PARITY_FAIL',source_media_count:source.images.length,candidate_media_count:current?.images.length??null,reason:!current?'NO_REGISTERED_CANDIDATE_ROUTE':equalImages?'BOTH_ASSOCIATED_SETS_EMPTY':'SOURCE_ASSOCIATION_OR_IDENTITY_NOT_PRESERVED',candidate_evidence:proof})
 if(copyState!=='COPY_PARITY_PASS')delta.push({route:item.targetPath,current_value:current?.text??'',salmon_value:source.text,field:'BODY',current_source:proof,action_required:'REPLACE_WITH_SALMON'})
 for(const field of mismatches)delta.push({route:item.targetPath,current_value:field==='IMAGE_ALT'?current?.images.map(x=>x.alt)??null:field==='INTERNAL_LINKS'?current?.links??null:current?.seo[field]??null,salmon_value:field==='IMAGE_ALT'?source.images.map(x=>x.alt):field==='INTERNAL_LINKS'?source.links:source.seo[field]??null,field,current_source:proof,action_required:'REPLACE_WITH_SALMON; preserve staging lock separately'})
}
const sourcePaths=new Set(manifest.map(x=>x.targetPath))
for(const route of registered)if(!sourcePaths.has(route.canonical_path))orphan.push({candidate_route:route.canonical_path,route_id:route.route_id,state:'SOURCE_UNAVAILABLE',action:'OWNER_ROUTE_MAPPING_REQUIRED; no inferred Salmon substitute'})
tsv('COPY_PARITY.tsv',copy);tsv('SEO_PARITY.tsv',seo);tsv('MEDIA_PARITY.tsv',media);tsv('NON_SALMON_CONTENT_DELTA.tsv',delta);tsv('CANDIDATE_ROUTES_WITHOUT_SALMON_MATCH.tsv',orphan,['candidate_route','route_id','state','action'])
writeFileSync(path.join(data,'parity-counts.json'),JSON.stringify({COPY_PARITY_PASS:copy.filter(x=>x.state==='COPY_PARITY_PASS').length,COPY_PARITY_FAIL:copy.filter(x=>x.state==='COPY_PARITY_FAIL').length,SEO_PARITY_PASS:seo.filter(x=>x.state==='SEO_PARITY_PASS').length,SEO_PARITY_FAIL:seo.filter(x=>x.state==='SEO_PARITY_FAIL').length,MEDIA_PARITY_PASS:media.filter(x=>x.state==='MEDIA_PARITY_PASS').length,MEDIA_PARITY_FAIL:media.filter(x=>x.state==='MEDIA_PARITY_FAIL').length,SOURCE_UNAVAILABLE:copy.filter(x=>x.state==='SOURCE_UNAVAILABLE').length,CANDIDATE_ROUTES_WITHOUT_SALMON_MATCH:orphan.length},null,2)+'\n')
console.log('PARITY',copy.length,'Salmon routes;',orphan.length,'candidate routes lack an exact Salmon path')
