import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
const root=path.resolve('../salmon-authority'),origin='https://salmon-rhinoceros-754457.hostingersite.com'
const hash=s=>createHash('sha256').update(s).digest('hex')
const routes=JSON.parse(readFileSync(path.join(root,'routes.json')))
const known=new Map(routes.map(r=>[r.url,r]))
const run=promisify(execFile)
let batch=routes
while(batch.length){
 const next=[]
 for(const route of batch){
  if(route.snapshot.status!==200)continue
  const html=readFileSync(path.join(root,route.snapshot.file),'utf8')
  for(const match of html.matchAll(/href=["']([^"']+)["']/g)){
   let u;try{u=new URL(match[1].replaceAll('&amp;','&'),route.url);u.hash=''}catch{continue}
   if(u.origin!==origin||u.search||/\.(?:xml|txt|png|jpe?g|webp|svg|pdf|css|js|gif|ico|zip|woff2?)$/i.test(u.pathname)||/^\/(?:wp-admin|wp-json|wp-content|wp-includes|feed)\//.test(u.pathname)||u.pathname.includes('/feed/')||known.has(u.href))continue
   const entry={url:u.href,type:'link-discovered',discoveredFrom:route.url}
   known.set(u.href,entry);next.push(entry)
  }
 }
 if(known.size>5000)throw new Error('Unexpected inventory growth; inspect before continuing')
 const queue=[...next]
 await Promise.all(Array.from({length:4},async()=>{
  while(queue.length){
   const route=queue.shift(),stem=path.join(root,'raw',hash(route.url))
   if(!existsSync(stem+'.identity.json')){
    const {stdout}=await run('curl',['-sS','-L','--max-time','60','--retry','2','-D',stem+'.headers','-o',stem+'.body','-w','%{http_code}\n%{url_effective}',route.url])
    const [status,effectiveUrl]=stdout.split('\n')
    writeFileSync(stem+'.identity.json',JSON.stringify({url:route.url,status:Number(status),effectiveUrl,acquiredAt:new Date().toISOString()},null,2))
   }
   const entry=JSON.parse(readFileSync(stem+'.identity.json')),bytes=readFileSync(stem+'.body')
   route.snapshot={...entry,file:path.relative(root,stem+'.body'),sha256:hash(bytes),bytes:bytes.length}
  }
 }))
 console.log('Additional linked routes',next.length,'inventory',known.size)
 batch=next
 writeFileSync(path.join(root,'routes.json'),JSON.stringify([...known.values()].sort((a,b)=>a.url.localeCompare(b.url)),null,2)+'\n')
}
