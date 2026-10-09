/**
 * LEGACY-IMG-REDIRECTS-1.1 ingest (CT 2026-10-08). Offline, READ-ONLY on the backups. The legacy upload URLs that the media manifests
 * name but hold no bytes for (ops/img-seo/legacy-image-redirects.report.json `unresolved`) are looked up, case-insensitively by their
 * year/month path, in the owner's local WordPress backups and copied byte-for-byte into the media store the way every held image is
 * (public/media/salmon/<sha256>.<ext>, no re-encode, no upscale), with a manifest row (sha256, bytes, native size, source path).
 *
 *   node ops/img-seo/ingest-legacy-uploads.mjs <backup-uploads-dir> [<backup-uploads-dir> ...]
 *
 * Writes content/salmon/legacy-uploads-recovered-media-identities.json. The manifest feeds the redirect builder only: pages do not
 * read it, so no page gains or loses an image. Originals are preferred; a key found only as a -WxH or -scaled variant is reported.
 */
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import path from 'node:path'

const APP=process.cwd()
const backups=process.argv.slice(2)
if(!backups.length)throw new Error('give at least one backup wp-content/uploads directory')
const report=JSON.parse(readFileSync(path.join(APP,'ops/img-seo/legacy-image-redirects.report.json'),'utf8'))
const manifestPath=path.join(APP,'content/salmon/legacy-uploads-recovered-media-identities.json')
const previous=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')).rows.map(r=>r.url.replace(/^.*\/wp-content\/uploads\//,'').toLowerCase()):[]
const keys=[...new Set([...report.unresolved.map(l=>l.split('  <- ')[0]),...previous])]

const index=new Map()
const walk=(root,dir)=>{for(const name of readdirSync(dir)){const p=path.join(dir,name);if(statSync(p).isDirectory())walk(root,p);else{const rel=path.relative(root,p);const k=rel.toLowerCase();if(!index.has(k))index.set(k,[]);index.get(k).push({root,full:p,rel})}}}
for(const b of backups)walk(b,b)

const store=path.join(APP,'public/media/salmon')
mkdirSync(store,{recursive:true})
const FORMAT={jpg:'jpeg',jpeg:'jpeg',png:'png',webp:'webp',gif:'gif'}
const rows=[],missing=[],variantOnly=[]
let copied=0,reused=0,bytesAdded=0
for(const key of keys.sort()){
  const hits=index.get(key)
  if(!hits){
    const dir=path.dirname(key),stem=path.basename(key,path.extname(key))
    const variants=[...index.keys()].filter(k=>path.dirname(k)===dir&&new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:-scaled|-\\d+x\\d+)(?:-\\d+x\\d+)?${path.extname(key)}$`).test(path.basename(k)))
    ;(variants.length?variantOnly:missing).push(variants.length?`${key} (only ${variants[0]})`:key)
    continue
  }
  const bytes=readFileSync(hits[0].full)
  for(const h of hits.slice(1))if(statSync(h.full).size!==bytes.length)throw new Error(`backups disagree on ${key}`)
  const sha=createHash('sha256').update(bytes).digest('hex')
  const ext=path.extname(hits[0].rel).slice(1).toLowerCase()
  const file=`${sha}.${ext}`
  const target=path.join(store,file)
  if(existsSync(target)){
    if(createHash('sha256').update(readFileSync(target)).digest('hex')!==sha)throw new Error(`store file ${file} does not match its name`)
    reused++
  }else{copyFileSync(hits[0].full,target);copied++;bytesAdded+=bytes.length}
  let width,height
  if(FORMAT[ext]&&ext!=='gif'||ext==='gif'){
    const out=execFileSync('identify',['-format','%w %h','-ping',`${target}[0]`],{encoding:'utf8'}).trim().split(' ').map(Number)
    ;[width,height]=out
  }
  rows.push({url:`https://h2ocooling.com/wp-content/uploads/${hits[0].rel}`,state:'SOURCE_BINARY_HELD',sha256:sha,bytes:bytes.length,file:`media/${file}`,width,height,format:FORMAT[ext]??ext,authority:'LEGACY_IMG_REDIRECTS_1_1_LOCAL_BACKUP_RECOVERED',source:`local WordPress backup, read-only: ${hits.map(h=>`${h.root.replace(/^.*\/Documents\//,'').replace(/\/wp-content\/uploads$/,'')}`).join(' ; ')} :: wp-content/uploads/${hits[0].rel}`,copies:hits.length})
}
writeFileSync(manifestPath,JSON.stringify({authority:'LEGACY-IMG-REDIRECTS-1.1 (Control Tower 2026-10-08): legacy upload URLs the media manifests named but held no bytes for, recovered byte-for-byte from the owner\'s local WordPress backups (read-only; no live download, no re-encode, no upscale). Feeds the legacy-image redirect builder only; pages do not read it.',date:'2026-10-08',rows},null,1)+'\n')
writeFileSync(path.join(APP,'ops/img-seo/ingest-legacy-uploads.report.json'),JSON.stringify({keys:keys.length,recovered:rows.length,filesCopied:copied,filesAlreadyInStore:reused,bytesAdded,mbAdded:Math.round(bytesAdded/1e5)/10,missingInBackups:missing,onlyAsVariantInBackups:variantOnly},null,1)+'\n')
console.log(JSON.stringify({keys:keys.length,recovered:rows.length,copied,reused,mbAdded:Math.round(bytesAdded/1e5)/10,missing:missing.length,variantOnly:variantOnly.length}))
