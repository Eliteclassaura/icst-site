/**
 * IMG-SEO-1 phase B slug manifest builder (CT 2026-10-08). Offline; writes content/release/image-slugs.json and
 * ops/img-seo/image-slugs.tsv (the list OGCS spot-checks).
 *
 *   pnpm exec tsx ops/img-seo/build-image-slugs.ts
 *
 * Every public raster image under public/media (png, jpg, jpeg, webp, gif) except the owner-protected testimonials media (figma-testimonials, client-review) and the
 * private staging captures gets a descriptive URL `/media/<slug>-<hash8>.<ext>`; `hash8` is the first 8 hex of the file's sha256, so
 * every URL is unique and a changed image can never keep a stale URL. The files are NOT renamed: the proxy rewrites the descriptive URL
 * to the physical file, and 301s the old hash URL to the descriptive one.
 *
 * The slug comes from, in this order: the image's held alt text; a descriptive WordPress file name; the page section or project the
 * image sits under; the registry caption or name; else a plain fallback. Lowercase ASCII, hyphens, at most 60 characters, never padded
 * with keywords. A derivative (a delivery WebP) takes its original's slug.
 */
import {testimonialBackgroundUrls} from './testimonial-portraits'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {heldImageAlt,salmonDocument,salmonRoutes} from '../../src/site/salmon'

const APP=process.cwd()
const PUBLIC=path.join(APP,'public')
const EXCLUDED_DIRS=new Set(['figma-testimonials','client-review','private-staging'])
const RASTER=/\.(png|jpe?g|webp|gif)$/i
const read=<T>(file:string):T=>JSON.parse(readFileSync(path.join(APP,file),'utf8')) as T

/** The text of a URL's file name: decoded, no extension. */
const stemOf=(url:string)=>{let n=url.split(/[?#]/)[0]!.split('/').pop()!;try{n=decodeURIComponent(n)}catch{/* keep */}return n.replace(/\.[a-z0-9]+$/i,'')}

const STOP=new Set(['a','an','the','of','and','or','to','in','on','for','with','by','at'])
export function cleanSlug(text:string,max=60):string{
  let s=text.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
  s=s.replace(/&/g,' and ').replace(/^(slide|image|photo|picture|figure|graphic)\s*(of|:)?\s*/,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
  const words=s.split('-').filter(Boolean)
  const dedup=words.filter((w,i)=>w!==words[i-1])
  let out=''
  for(const w of dedup){const next=out?`${out}-${w}`:w;if(next.length>max)break;out=next}
  const parts=out.split('-')
  while(parts.length>2&&STOP.has(parts.at(-1)!))parts.pop()
  return parts.join('-')
}
const WEAK=/^(?:image|img|dsc|dscn|pb|screenshot|screen-shot|group|frame|untitled|copy|photo|picture|pic|slide|unnamed|logo|banner|bg|background|cropped|new|final|design)(?:-?\d+)*$/
/** A WordPress file name that says something: not a counter, a camera name, a hash or a bare "image". */
export function descriptiveStem(stem:string):string|undefined{
  const s=stem.toLowerCase().replace(/[_\s]+/g,'-').replace(/-(?:min|scaled|copy|final|web|edited)(?=-|$)/g,'').replace(/-\d{2,4}x\d{2,4}(?=-|$)/,'').replace(/-\d+$/,'').replace(/^-+|-+$/g,'')
  if(/[0-9a-f]{16,}/.test(s.replace(/-/g,'')))return undefined
  const letters=(s.match(/[a-z]/g)??[]).length,digits=(s.match(/[0-9]/g)??[]).length
  if(letters<6||digits>letters)return undefined
  if(WEAK.test(s)||/^(?:image|img|dsc|screenshot|group)-/.test(s)&&s.split('-').length<=3)return undefined
  const slug=cleanSlug(s)
  return slug.split('-').length>=2||slug.length>=9?slug:undefined
}

type Info={alt?:string;wp?:string;section?:string;route?:string;registry?:string;page?:string}
const bySha=new Map<string,Info>()
const infoFor=(sha:string)=>{let i=bySha.get(sha);if(!i){i={};bySha.set(sha,i)}return i}
const shaOfFile=(rel:string)=>{const m=/^([0-9a-f]{64})\./.exec(path.basename(rel));return m?.[1]}

// 1. WordPress file names from the media manifests (identity rows carry the url and the held file)
const identityRows:Array<{url:string;file?:string;sha256?:string}>=[
  ...read<Array<{url:string;file?:string;sha256?:string}>>('content/salmon/media-identities.json'),
  ...read<{rows:Array<{url:string;file?:string;sha256?:string}>}>('content/salmon/r24-recovered-media-identities.json').rows,
  ...read<Array<{url:string;file?:string;sha256?:string}>>('content/salmon/chrome-media-supplement.json'),
  ...read<{rows:Array<{url:string;file?:string;sha256?:string}>}>('content/salmon/legacy-uploads-recovered-media-identities.json').rows,
]
for(const r of identityRows)if(r.sha256&&r.file)infoFor(r.sha256).wp??=stemOf(r.url)
for(const r of read<Array<{sourceUrl:string;sha256:string}>>('content/salmon/original-library.json'))infoFor(r.sha256).wp??=stemOf(r.sourceUrl)
// 2. the page section and held alt each held image sits under
for(const p of read<Array<{source_sha256?:string;binary?:{sha256?:string};alt?:string;section?:string;route_id?:string}>>('content/salmon/media-placements.json')){
  const held=p.binary?.sha256??p.source_sha256
  if(!held)continue
  const i=infoFor(held)
  if(p.alt&&!i.alt)i.alt=p.alt
  if(p.section&&!i.section){i.section=p.section;i.route=p.route_id}
}
for(const sha of [...bySha.keys()]){const alt=heldImageAlt(undefined,sha);if(alt)infoFor(sha).alt=alt}
const uploadKey=(url:string)=>{let p=url.split(/[?#]/)[0]!;try{p=decodeURI(p)}catch{/* keep */}return (/\/wp-content\/uploads\/(.+)$/i.exec(p)?.[1]??p).toLowerCase().replace(/(\.(?:jpe?g|png|gif))\.webp$/,'$1').replace(/-(?:\d+x\d+|scaled)(?=\.[a-z0-9]+$)/,'')}
const byUploadKey=new Map<string,string>()
for(const r of read<Array<{sourceUrl:string;sha256:string}>>('content/salmon/original-library.json'))byUploadKey.set(uploadKey(r.sourceUrl),r.sha256)
for(const r of identityRows)if(r.sha256&&r.file)byUploadKey.set(uploadKey(r.url),byUploadKey.get(uploadKey(r.url))??r.sha256)
// 2b. the first page each upload appears on (any image a page document references), for images no placement row describes.
// Page documents name the Salmon staging copy of an upload, so the context is kept by upload path (no size suffix) and then
// applied to every held file whose own WordPress name has the same upload path.
const pageCtx=new Map<string,{page:string;section?:string;alt?:string}>()
for(const route of salmonRoutes()){
  let doc
  try{doc=salmonDocument(route)}catch{continue}
  const title=(doc.seo.h1[0]||doc.title||'').trim()
  if(!title)continue
  for(const img of doc.images??[]){
    const k=uploadKey(img.src)
    if(!pageCtx.has(k))pageCtx.set(k,{page:title,section:(img as {section?:string}).section,alt:(img as {alt?:string}).alt||undefined})
  }
}
const applyCtx=(sha:string|undefined,url:string)=>{
  if(!sha)return
  const c=pageCtx.get(uploadKey(url));if(!c)return
  const i=infoFor(sha)
  i.page??=c.page
  if(c.section&&!i.section){i.section=c.section}
  if(c.alt&&!i.alt)i.alt=c.alt
}
for(const r of identityRows)applyCtx(r.sha256,r.url)
for(const r of read<Array<{sourceUrl:string;sha256:string}>>('content/salmon/original-library.json'))applyCtx(r.sha256,r.sourceUrl)
// 3. registries that pair a served file with its words (design, project, luxury): keyed by the served path
const byPath=new Map<string,Info>()
const walk=(node:unknown,inheritedSrc?:string,inheritedWords?:Info)=>{
  if(Array.isArray(node)){for(const n of node)walk(n,inheritedSrc,inheritedWords);return}
  if(!node||typeof node!=='object')return
  const o=node as Record<string,unknown>
  const src=typeof o.src==='string'&&/^\/media\//.test(o.src)?o.src:undefined
  const words:Info={...inheritedWords}
  if(typeof o.alt==='string'&&o.alt.trim())words.alt=o.alt
  if(typeof o.caption==='string'&&o.caption.trim())words.registry=o.caption
  else if(typeof o.name==='string'&&o.name.trim()&&!words.registry)words.registry=o.name
  if(typeof o.registry==='string'&&!words.registry)words.registry=o.registry.replace(/^\/|\/$/g,'').split('/').pop()!.replace(/-/g,' ')
  if(src){const cur=byPath.get(src)??{};byPath.set(src,{alt:cur.alt??words.alt,registry:cur.registry??words.registry})}
  for(const v of Object.values(o))if(v&&typeof v==='object')walk(v,src??inheritedSrc,words)
}
for(const dir of ['content/design','content/projects','content/luxury'])for(const name of readdirSync(path.join(APP,dir)))if(name.endsWith('.json'))walk(JSON.parse(readFileSync(path.join(APP,dir,name),'utf8')))
// 4. a delivery derivative takes its original's words
const derivByPath=new Map<string,{origSha256:string}>()
const derivOf=new Map<string,string>()
for(const it of read<{items:Array<{src:string;derivative:string}>}>('content/media-derivatives.json').items){derivOf.set(it.derivative,it.src);derivByPath.set(it.derivative,{origSha256:(it as unknown as {origSha256:string}).origSha256})}

/** OGCS rows by hash8 + extension (the bytes), so a later change of an image's alt wording does not detach its fix. */
const overrides=new Map<string,string>()
for(const line of readFileSync(path.join(APP,'ops/img-seo/slug-overrides.tsv'),'utf8').split('\n').slice(1)){
  const [current,proposed]=line.split('\t')
  if(!current||!proposed)continue
  const key=/-([0-9a-f]{8}\.[a-z]+)$/.exec(current)?.[1]
  if(!key||!proposed.endsWith(`-${key}`))throw new Error(`override changes the hash or extension: ${current} -> ${proposed}`)
  overrides.set(key,proposed)
}
const files:string[]=[]
const collect=(dir:string)=>{
  for(const name of readdirSync(dir)){
    const full=path.join(dir,name),rel=path.relative(PUBLIC,full)
    if(statSync(full).isDirectory()){if(!EXCLUDED_DIRS.has(rel.split(path.sep)[1]??''))collect(full)}
    else if(RASTER.test(name))files.push('/'+rel.split(path.sep).join('/'))
  }
}
collect(path.join(PUBLIC,'media'))
// A held copy of an owner-protected testimonial image (same bytes, another directory) keeps its URL too: never altered or renamed.
const protectedShas=new Set<string>()
for(const dir of ['figma-testimonials','client-review'])for(const name of readdirSync(path.join(PUBLIC,'media',dir)))if(RASTER.test(name))protectedShas.add(createHash('sha256').update(readFileSync(path.join(PUBLIC,'media',dir,name))).digest('hex'))
// IMG-SEO-1.2: the home testimonial portraits the stylesheets name (derived from the testimonial source sections, ./testimonial-portraits):
// their files, the originals they are derivatives of, and every derivative of those originals keep their URLs too.
const protectedPaths=new Set<string>()
for(const url of testimonialBackgroundUrls(APP)){
  const physical=url
  protectedPaths.add(physical)
  const item=derivByPath.get(physical)
  if(item)protectedShas.add(item.origSha256)
  else{const m=/([0-9a-f]{64})\.[a-z0-9]+$/.exec(physical);if(m)protectedShas.add(m[1]!)}
}
files.sort()
const isProtectedFile=(f:string):boolean=>protectedShas.has(shaOfFile(f)??createHash('sha256').update(readFileSync(path.join(PUBLIC,f))).digest('hex'))
// ...and so does a delivery derivative of one (the home testimonial portraits are served as derivatives)
const kept=files.filter(f=>!protectedPaths.has(f)&&!(derivByPath.get(f)&&protectedShas.has(derivByPath.get(f)!.origSha256))&&!isProtectedFile(f)&&!(derivOf.get(f)&&(EXCLUDED_DIRS.has(derivOf.get(f)!.split('/')[2]??'')||(existsSync(path.join(PUBLIC,derivOf.get(f)!))&&isProtectedFile(derivOf.get(f)!)))))
files.length=0;files.push(...kept)

type Row={file:string;url:string;source:string;basis:string;sha:string;page:string}
const rows:Row[]=[]
const used=new Map<string,string>() // descriptive URL -> sha256 (identical bytes under two physical paths share one URL)
const counts:Record<string,number>={}
for(const file of files){
  const full=path.join(PUBLIC,file)
  const bytes=readFileSync(full)
  if(bytes.subarray(0,40).toString().startsWith('version https://git-lfs'))throw new Error(`LFS pointer, not bytes: ${file}`)
  const sha=shaOfFile(file)??createHash('sha256').update(bytes).digest('hex')
  const ext=path.extname(file).slice(1).toLowerCase()
  // the words: this file's own, else its original's (a derivative), else the registry entry for its path
  const origPath=derivOf.get(file)
  const origSha=origPath?shaOfFile(origPath):undefined
  const own=bySha.get(shaOfFile(file)??sha)??(origSha?bySha.get(origSha):undefined)??{}
  const reg=byPath.get(file)??(origPath?byPath.get(origPath):undefined)??{}
  let slug:string|undefined,source='fallback',basis=''
  const alt=own.alt||reg.alt
  if(alt){const s=cleanSlug(alt.split(/[.:;|]/)[0]!.trim()||alt);if(s&&s.split('-').length>=2){slug=s;source='alt';basis=alt.slice(0,80)}}
  if(!slug){const wp=own.wp?descriptiveStem(own.wp):undefined;if(wp){slug=wp;source='wp-filename';basis=own.wp!}}
  if(!slug&&own.section){
    // a bare section name ("Introduction", "Feedback") says nothing alone: it follows the page it sits on
    const generic=cleanSlug(own.section).split('-').length<3
    const s=cleanSlug(generic&&own.page?`${own.page} ${own.section}`:own.section);if(s){slug=s;source='section';basis=`${own.page?own.page+' / ':''}${own.section}`.slice(0,90)}
  }
  if(!slug&&own.page){const s=cleanSlug(own.page);if(s){slug=s;source='page';basis=own.page.slice(0,80)}}
  if(!slug&&reg.registry){const s=cleanSlug(reg.registry);if(s){slug=s;source='registry';basis=reg.registry.slice(0,80)}}
  if(!slug){const stem=descriptiveStem(stemOf(file).replace(/^[0-9a-f]{16}-/,''));if(stem){slug=stem;source='file-name';basis=stemOf(file)}}
  if(!slug){slug='ics-industrial-cooling-image';source='fallback';basis=file}
  let url=`/media/${slug}-${sha.slice(0,8)}.${ext}`
  // OGCS spot-check (CT 2026-10-09): exact current -> proposed rows (ops/img-seo/slug-overrides.tsv); the hash8 and extension never change
  const proposed=overrides.get(`${sha.slice(0,8)}.${ext}`)
  if(proposed){url=proposed;source='ogcs-override';basis=`${slug} (OGCS)`}
  else{
    // the same neutral rule for any slug OGCS did not list: no brand-host suffix, and no HVAC / commercial wording (industrial-only copy)
    const neutral=slug.split('-').filter((w,i,a)=>!(w==='hvac'||w==='commercial'||(w==='h2ocooling'||(w==='com'&&a[i-1]==='h2ocooling')))).join('-')
    if(neutral!==slug&&neutral){slug=neutral;url=`/media/${slug}-${sha.slice(0,8)}.${ext}`;source=`${source}+neutral`}
  }
  if(used.has(url)&&used.get(url)!==sha)throw new Error(`descriptive URL collision between different files: ${url}`)
  used.set(url,sha)
  counts[source]=(counts[source]??0)+1
  rows.push({file,url,source,basis,sha,page:own.page??''})
}
const entries=Object.fromEntries(rows.map(r=>[r.file,r.url]))
writeFileSync(path.join(APP,'content/release/image-slugs.json'),JSON.stringify({version:1,policy:'Descriptive public image URLs. Keys are the physical files under public/; values are the URLs served (the proxy rewrites them to the files and 301s the old hash URLs). Built by ops/img-seo/build-image-slugs.ts. Excluded: figma-testimonials and client-review (owner-protected testimonial media and the home photograph), private-staging, SVG, PDF, the Payload media collection.',count:rows.length,entries},null,0)+'\n')
const tsv=['file\told URL\tnew URL\tslug source\tbasis\tfirst page (H1)\tsha256',...rows.map(r=>[r.file,r.file,r.url,r.source,r.basis.replace(/[\t\n]/g,' '),r.page.replace(/[\t\n]/g,' '),r.sha].join('\t'))]
writeFileSync(path.join(APP,'ops/img-seo/image-slugs.tsv'),tsv.join('\n')+'\n')
console.log(JSON.stringify({images:rows.length,...counts}))
void existsSync
