import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const read=p=>JSON.parse(readFileSync(p)),base='../salmon-activation-evidence/'
const occurrences=read(base+'internal-link-occurrences.json').filter(r=>r.state==='BROKEN_INTERNAL_LINK'),targets=read(base+'internal-link-http-targets.json').filter(r=>r.state==='BROKEN_INTERNAL_LINK')
const active=new Set(read('apps/h2o/content/salmon/active-routes.json').map(r=>decodeURIComponent(r.targetPath))),aliases=new Map(read('apps/h2o/content/salmon/redirects.json').map(r=>[r.source,r.destination]))
const decisions=readFileSync('apps/h2o/content/salmon/CANDIDATE_ONLY_ROUTE_DECISIONS.tsv','utf8')
const queue=[...targets],probes=[],resolutions=new Map(),redirects=[]
await Promise.all(Array.from({length:6},async()=>{while(queue.length){const row=queue.shift(),origin=occurrences.find(o=>o.path===row.path)?.source_target??'https://h2ocooling.com'+row.path
 let state='OWNER_DECISION_REQUIRED',target='',evidence='No exact canonical or verified redirect match in accepted ledgers.',status=null,effective='',canonical=''
 try{const response=await fetch(origin,{signal:AbortSignal.timeout(15000),redirect:'follow'});status=response.status;effective=response.url;const text=await response.text();canonical=text.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]??'';const p=new URL(effective).pathname,key=decodeURIComponent(p)
  if(!decisions.includes(row.path)&&response.ok&&response.redirected&&(active.has(key)||aliases.has(p))){state='RESOLVED_VERIFIED_REDIRECT';target=aliases.get(p)??p;evidence='Observed source HTTP redirect to '+effective+'; exact accepted canonical target.';redirects.push({source:row.path.endsWith('/')?row.path:row.path+'/',destination:target,evidence})}
  else if(status===404||status===410){state='SOURCE_LEGACY_BROKEN';evidence='Source HTTP '+status+'; no verified canonical destination.'}
  else if(!response.ok){state='EXTERNAL_UNAVAILABLE';evidence='Source HTTP '+status+'; no inferred replacement.'}
  probes.push({source:origin,status,effective,canonical,bodySha256:createHash('sha256').update(text).digest('hex')})
 }catch(e){state='EXTERNAL_UNAVAILABLE';evidence='Source fetch unavailable: '+e.message;probes.push({source:origin,error:e.message})}
 if(decisions.includes(row.path)){state='OWNER_DECISION_REQUIRED';target='';evidence='Explicit candidate-only OWNER_MAPPING_REQUIRED guard supersedes inferred mapping.'}
 resolutions.set(row.path,{state,target,evidence});console.log(row.path,state,target)
}}))
const grouped=new Map();for(const o of occurrences){const key=o.route+'\t'+o.source_target;const current=grouped.get(key);if(current)current.OCCURRENCES++;else{const r=resolutions.get(o.path);grouped.set(key,{SOURCE_ROUTE:o.route,SOURCE_HREF:o.source_target,OCCURRENCES:1,RESOLUTION:r.target?'Verified routing-layer redirect':'Preserve source record; no invented destination',TARGET:r.target,EVIDENCE:r.evidence,STATE:r.state})}}
const records=[...grouped.values()],keys=Object.keys(records[0]);writeFileSync('../luxury-evidence/INTERNAL_LINK_RECONCILIATION.tsv',[keys.join('\t'),...records.map(r=>keys.map(k=>String(r[k]).replace(/[\t\r\n]/g,' ')).join('\t'))].join('\n')+'\n')
writeFileSync('../luxury-evidence/link-source-probes.json',JSON.stringify(probes,null,2));writeFileSync('../luxury-evidence/link-target-decisions.json',JSON.stringify([...resolutions].map(([source,r])=>({source,...r})),null,2))
writeFileSync('apps/h2o/content/luxury/reconciled-redirects.json',JSON.stringify([...new Map(redirects.map(r=>[r.source,r])).values()],null,2))
