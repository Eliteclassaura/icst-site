/**
 * LEGACY-IMG-REDIRECTS map builder (IMG-SEO-1 phase A, CT 2026-10-08). Offline; writes content/release/legacy-image-redirects.json and
 * ops/img-seo/legacy-image-redirects.report.json.
 *
 *   pnpm exec tsx ops/img-seo/build-legacy-image-redirects.ts
 *
 * Every `/wp-content/uploads/...` URL the media manifests name (media-identities, r2-live, r24-recovered, chrome supplement,
 * original-library, attachments, media-placements incl. every srcset size, live-image-alt) is resolved to the file this site serves
 * today (the held bytes under /media/salmon, through the same overrides and upgrades the pages use). Variants (-WxH, -scaled, .webp)
 * share one entry. Left out on purpose: a tile the owner withheld (media-overrides), and any path already served in place from
 * public/wp-content/uploads (it answers 200 itself). URLs found only by scanning page documents are listed in the report, not mapped
 * unless a manifest holds them.
 */
import {existsSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {heldMediaForUrl,salmonMediaPath,withheldSource} from '../../src/site/salmon'
import {legacyImageKey} from '../../src/content/legacy-image-redirects'

const APP=process.cwd()
const read=<T>(file:string):T=>JSON.parse(readFileSync(path.join(APP,'content/salmon',file),'utf8')) as T
type Cand={url:string;sha256?:string;file?:string;width?:number;exact:boolean;from:string}
const candidates:Cand[]=[]
const pathOf=(url:string):string|undefined=>{try{return new URL(url,'https://h2ocooling.com').pathname}catch{return undefined}}
const isUpload=(url:string)=>/\/wp-content\/uploads\//i.test(pathOf(url)??'')
const add=(c:Cand)=>{if(isUpload(c.url))candidates.push(c)}

const identities=read<Array<{url:string;file?:string;sha256?:string;width?:number}>>('media-identities.json')
for(const r of identities)add({url:r.url,sha256:r.sha256,file:r.file,width:r.width,exact:true,from:'media-identities'})
for(const r of read<Array<{url:string;file?:string;sha256?:string}>>('r2-live-media-identities.json'))add({url:r.url,sha256:r.sha256,file:r.file,exact:true,from:'r2-live'})
for(const r of read<{rows:Array<{url:string;file?:string;sha256?:string;width?:number}>}>('r24-recovered-media-identities.json').rows)add({url:r.url,sha256:r.sha256,file:r.file,width:r.width,exact:true,from:'r24-recovered'})
for(const r of read<Array<{url:string;file?:string;sha256?:string;width?:number}>>('chrome-media-supplement.json'))add({url:r.url,sha256:r.sha256,file:r.file,width:r.width,exact:true,from:'chrome-supplement'})
for(const r of read<{rows:Array<{url:string;file?:string;sha256?:string;width?:number}>}>('legacy-uploads-recovered-media-identities.json').rows)add({url:r.url,sha256:r.sha256,file:r.file,width:r.width,exact:true,from:'legacy-uploads-recovered'})
const library=read<Array<{attachmentId:number;sourceUrl:string;publicPath:string;sha256:string;width?:number}>>('original-library.json')
for(const r of library)add({url:r.sourceUrl,sha256:r.sha256,file:r.publicPath,width:r.width,exact:true,from:'original-library'})
for(const r of read<Array<{attachment_id:number;source_url:string}>>('attachments.json')){
  const lib=library.find(l=>l.attachmentId===r.attachment_id)
  if(lib)add({url:r.source_url,sha256:lib.sha256,file:lib.publicPath,width:lib.width,exact:true,from:'attachments'})
}
for(const p of read<Array<{src?:string;srcset?:string;source_url?:string;source_sha256?:string;binary?:{file?:string}}>>('media-placements.json')){
  const file=p.binary?.file
  for(const url of [p.src,p.source_url,...(p.srcset??'').split(',').map(s=>s.trim().split(/\s+/)[0])])if(url)add({url,sha256:p.source_sha256,file,exact:false,from:'media-placements'})
}
for(const key of Object.keys(read<{alt:Record<string,string>}>('live-image-alt.json').alt))add({url:`https://h2ocooling.com/wp-content/uploads/${key}`,exact:false,from:'live-image-alt'})

// The design, project and client-review media registries pair an owner-backup/live upload name with the file served for it.
const designHits=new Map<string,string>()
const SERVED=/^\/media\/.+\.[a-z0-9]+$/i
const srcOf=(o:Record<string,unknown>):string|undefined=>{
  for(const k of ['src','publicPath','file']){const v=o[k];if(typeof v==='string'&&SERVED.test(v))return v}
  const m=o.media as Record<string,unknown>|undefined
  return m&&typeof m.src==='string'&&SERVED.test(m.src)?m.src:undefined
}
const walkRegistry=(node:unknown,inherited?:string)=>{
  if(Array.isArray(node)){for(const n of node)walkRegistry(n,inherited);return}
  if(!node||typeof node!=='object')return
  const o=node as Record<string,unknown>
  const own=srcOf(o)??inherited
  if(own)for(const [k,v] of Object.entries(o))if(typeof v==='string'&&/\/wp-content\/uploads\//i.test(v)&&k!=='sourceStem'){
    const key=legacyImageKey(v.replace(/^[^/]*public_html/,''))
    if(key&&!designHits.has(key))designHits.set(key,own)
  }
  for(const v of Object.values(o))if(v&&typeof v==='object')walkRegistry(v,own)
}
for(const dir of ['content/design','content/projects','content/luxury']){
  const full=path.join(APP,dir)
  for(const name of readdirSync(full))if(name.endsWith('.json')&&name!=='media-overrides.json')walkRegistry(JSON.parse(readFileSync(path.join(full,name),'utf8')))
}
walkRegistry(JSON.parse(readFileSync(path.join(APP,'content/media-derivatives.json'),'utf8')))

const served=(file?:string)=>file?(file.startsWith('/media/')?file:`/media/salmon/${path.basename(file)}`):undefined
const inPlace=new Set<string>()
const walk=(dir:string)=>{if(!existsSync(dir))return;for(const name of readdirSync(dir)){const p=path.join(dir,name);if(statSync(p).isDirectory())walk(p);else{const k=legacyImageKey(`/wp-content/uploads/${path.relative(path.join(APP,'public/wp-content/uploads'),p)}`);if(k)inPlace.add(k)}}}
walk(path.join(APP,'public/wp-content/uploads'))

type Hit={target:string;width:number;exact:boolean}
const best=new Map<string,Hit>()
const unresolvedFrom=new Map<string,Set<string>>()
const unresolved=new Set<string>(),withheld=new Set<string>(),inPlaceHits=new Set<string>()
for(const c of candidates){
  const key=legacyImageKey(pathOf(c.url)!)
  if(!key)continue
  if(inPlace.has(key)){inPlaceHits.add(key);continue}
  let target:string|undefined,width=c.width??0
  if(withheldSource(c.url,c.url)){withheld.add(key);continue}
  const held=heldMediaForUrl(c.url.startsWith('http')?c.url:`https://h2ocooling.com${c.url}`)
  if(held?.file){target=salmonMediaPath(held);width=held.width??width}
  else if(c.file&&existsSync(path.join(APP,'public',served(c.file)!)))target=served(c.file)
  if(!target&&designHits.has(key)&&existsSync(path.join(APP,'public',designHits.get(key)!)))target=designHits.get(key)
  if(!target){unresolved.add(key);unresolvedFrom.set(key,(unresolvedFrom.get(key)??new Set()).add(c.from));continue}
  const had=best.get(key)
  // one entry per upload: prefer a manifest-exact original, then the widest
  if(!had||(c.exact&&!had.exact)||(c.exact===had.exact&&width>had.width))best.set(key,{target,width,exact:c.exact})
}
for(const [key,src] of designHits){
  if(best.has(key)||inPlace.has(key))continue
  if(existsSync(path.join(APP,'public',src)))best.set(key,{target:src,width:0,exact:false})
}
for(const k of best.keys())unresolved.delete(k)
const extensionless:string[]=[]
for(const [k,v] of [...best.entries()])if(!/\.[a-z0-9]+$/i.test(v.target)){extensionless.push(`${k} -> ${v.target}`);best.delete(k)}
const entries=Object.fromEntries([...best.entries()].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>[k,v.target]))
for(const t of Object.values(entries))if(!existsSync(path.join(APP,'public',t)))throw new Error(`target missing on disk: ${t}`)
writeFileSync(path.join(APP,'content/release/legacy-image-redirects.json'),JSON.stringify({version:1,policy:'301 from a legacy /wp-content/uploads URL (any size variant) to the file served today. Built by ops/img-seo/build-legacy-image-redirects.ts from the media manifests; unknown paths stay 404.',count:Object.keys(entries).length,entries},null,0)+'\n')
const report={extensionlessTargetsLeftOut:extensionless,candidates:candidates.length,mapped:Object.keys(entries).length,unresolved:[...unresolved].sort().map(k=>`${k}  <- ${[...unresolvedFrom.get(k)!].join(',')}`),withheld:[...withheld].sort(),servedInPlace:[...inPlaceHits].sort()}
writeFileSync(path.join(APP,'ops/img-seo/legacy-image-redirects.report.json'),JSON.stringify(report,null,1)+'\n')
console.log(JSON.stringify({candidates:report.candidates,mapped:report.mapped,unresolved:report.unresolved.length,withheld:report.withheld.length,servedInPlace:report.servedInPlace.length}))
