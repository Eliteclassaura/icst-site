import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
const root=path.resolve('../salmon-authority'),data=path.join(root,'canonical')
const hash=b=>createHash('sha256').update(b).digest('hex')
const sharp=createRequire(path.resolve('apps/h2o/package.json'))('sharp')
const run=promisify(execFile)
const archive='/Users/sb/Desktop/Documents/Archive/Organized_2026-09-10/03_H2O_Cooling/h2obackup'
const manifest=JSON.parse(readFileSync(path.join(data,'manifest.json')))
const urls=new Set(),placements=[]
for(const row of manifest){
 const doc=JSON.parse(readFileSync(path.join(data,row.file)))
 for(const image of doc.images){
  let url;try{url=new URL(image.src,doc.sourceUrl).href}catch{continue}
  if(!/^https?:/.test(url))continue
  urls.add(url);placements.push({route_id:row.routeId,...image,source_url:url,source_sha256:doc.sourceIdentity.sha256})
 }
 for(const download of doc.downloads){try{urls.add(new URL(download.href,doc.sourceUrl).href)}catch{}}
}
const queue=[...urls].sort(),results=[]
mkdirSync(path.join(root,'media-fetch'),{recursive:true})
await Promise.all(Array.from({length:4},async()=>{
 while(queue.length){
  const url=queue.shift(),u=new URL(url)
  const relative=decodeURIComponent(u.pathname).split('/wp-content/uploads/')[1]
  let sourceFile=null,authority=''
  if(relative&&!relative.split('/').includes('..')&&['salmon-rhinoceros-754457.hostingersite.com','h2ocooling.com','www.h2ocooling.com'].includes(u.hostname)){
   const domain=u.hostname.replace(/^www\./,'')
   const local=path.join(archive,domain,'public_html/wp-content/uploads',relative)
   if(existsSync(local)){sourceFile=local;authority='EXACT_PATH_LOCAL_SOURCE_BACKUP; not asserted byte-identical to current remote'}
  }
  const cache=path.join(root,'media-fetch',hash(url))
  let status=null,error=null
  if(!sourceFile){
   if(!existsSync(cache+'.json')){
    try{
     const {stdout}=await run('curl',['-sS','-L','--max-time','30','--retry','1','-o',cache+'.body','-w','%{http_code}',url])
     status=Number(stdout)
    }catch(e){error=e.message.slice(0,250)}
    writeFileSync(cache+'.json',JSON.stringify({url,status,error},null,2))
   }
   const prior=JSON.parse(readFileSync(cache+'.json'));status=prior.status;error=prior.error
   if(status===200){sourceFile=cache+'.body';authority='PUBLIC_URL_BINARY_RECOVERED'}
  }
  let binary={state:'SOURCE_UNAVAILABLE',status,error}
  if(sourceFile){
   const bytes=readFileSync(sourceFile),sha256=hash(bytes)
   let dimensions={};try{const m=await sharp(bytes).metadata();dimensions={width:m.width,height:m.height,format:m.format}}catch{}
   const ext=path.extname(u.pathname).slice(0,12)|| (dimensions.format?'.'+dimensions.format:'.bin')
   const file='media/'+sha256+ext
   if(!existsSync(path.join(data,file)))copyFileSync(sourceFile,path.join(data,file))
   binary={state:'SOURCE_BINARY_HELD',sha256,bytes:bytes.length,file,...dimensions,authority}
  }
  results.push({url,...binary})
 }
}))
results.sort((a,b)=>a.url.localeCompare(b.url))
const byUrl=new Map(results.map(x=>[x.url,x]))
for(const p of placements)Object.assign(p,{binary:byUrl.get(p.source_url),authority:'OWNER_APPROVED_SALMON_ASSOCIATION'})
writeFileSync(path.join(data,'media-identities.json'),JSON.stringify(results,null,2)+'\n')
writeFileSync(path.join(data,'media-placements.json'),JSON.stringify(placements,null,2)+'\n')
const tsv=(name,rows)=>{
 const keys=[...new Set(rows.flatMap(Object.keys))]
 const val=v=>(typeof v==='object'?JSON.stringify(v):String(v??'')).replaceAll('\\','\\\\').replaceAll('\t','\\t').replaceAll('\r','\\r').replaceAll('\n','\\n')
 writeFileSync(path.join(data,name),[keys.join('\t'),...rows.map(r=>keys.map(k=>val(r[k])).join('\t'))].join('\n')+'\n')
}
tsv('SALMON_MEDIA_AUTHORITY.tsv',placements)
tsv('UNRESOLVED_MEDIA.tsv',results.filter(x=>x.state==='SOURCE_UNAVAILABLE'))
console.log({uniqueMediaAndDownloadUrls:results.length,held:results.filter(x=>x.state==='SOURCE_BINARY_HELD').length,unavailable:results.filter(x=>x.state==='SOURCE_UNAVAILABLE').length})
