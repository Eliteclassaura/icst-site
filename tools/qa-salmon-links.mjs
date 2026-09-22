import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
const root=path.resolve('apps/h2o/content/salmon'),out=path.resolve('../salmon-activation-evidence')
const manifest=JSON.parse(readFileSync(path.join(root,'active-routes.json')))
const occurrences=[]
for(const row of manifest){
 const d=JSON.parse(readFileSync(path.join(root,row.file)))
 const walk=(n,region)=>{
  if(typeof n==='string')return
  if(n.tag==='a'&&n.attrs.href){
   try{const u=new URL(n.attrs.href,d.sourceUrl)
    if(['salmon-rhinoceros-754457.hostingersite.com','h2ocooling.com','www.h2ocooling.com'].includes(u.hostname)&&!u.pathname.startsWith('/wp-content/')&&!/\.[a-z0-9]{2,5}$/i.test(u.pathname)&&!/[?&]add-to-cart=|\/(?:checkout|cart)\/?(?:[?#]|$)/i.test(n.attrs.href))occurrences.push({route:row.targetPath,region,source_target:n.attrs.href,path:u.pathname,fragment:u.hash})
   }catch{}
  }
  n.children.forEach(c=>walk(c,region))
 }
 d.children.forEach(n=>walk(n,'BODY'));d.chrome.forEach(c=>walk(c.tree,c.region.toUpperCase()))
}
const wanted=[...new Set(occurrences.map(r=>r.path))].sort(),queue=[...wanted],targets=[]
await Promise.all(Array.from({length:4},async()=>{while(queue.length){
 const requested=queue.shift(),chain=[];let current=requested,status=null,error=null
 try{for(let hop=0;hop<6;hop++){
  const r=await fetch('http://127.0.0.1:3110'+current,{redirect:'manual'});status=r.status
  const location=r.headers.get('location');chain.push({path:current,status,location})
  await r.body?.cancel()
  if(![301,302,307,308].includes(status)||!location)break
  const u=new URL(location,'http://127.0.0.1:3110');if(u.origin!=='http://127.0.0.1:3110')throw new Error('Unexpected external staging redirect')
  current=u.pathname+u.search
 }}catch(e){error=e.message}
 targets.push({path:requested,effective:current,status,chain,error,state:status===200&&!error?'RESOLVES':'BROKEN_INTERNAL_LINK'})
}}))
targets.sort((a,b)=>a.path.localeCompare(b.path))
const states=new Map(targets.map(r=>[r.path,r.state]))
writeFileSync(path.join(out,'internal-link-http-targets.json'),JSON.stringify(targets,null,2)+'\n')
writeFileSync(path.join(out,'internal-link-occurrences.json'),JSON.stringify(occurrences.map(r=>({...r,state:states.get(r.path)})),null,2)+'\n')
console.log({occurrences:occurrences.length,uniquePaths:targets.length,brokenPaths:targets.filter(r=>r.state==='BROKEN_INTERNAL_LINK').length,brokenOccurrences:occurrences.filter(r=>states.get(r.path)==='BROKEN_INTERNAL_LINK').length,redirectChains:targets.filter(r=>r.chain.length>2).length})
