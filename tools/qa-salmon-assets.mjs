import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
const out=path.resolve('../salmon-activation-evidence');mkdirSync(out,{recursive:true})
const all=JSON.parse(readFileSync('apps/h2o/content/salmon/media-identities.json'))
const unique=[...new Map(all.filter(x=>x.file).map(x=>[x.file,x])).values()]
const queue=[...unique],results=[]
await Promise.all(Array.from({length:4},async()=>{while(queue.length){const m=queue.shift(),url='http://127.0.0.1:3110/media/salmon/'+path.basename(m.file);try{const r=await fetch(url);const bytes=Buffer.from(await r.arrayBuffer());const sha256=createHash('sha256').update(bytes).digest('hex');results.push({source:m.url,url,status:r.status,expected:m.sha256,actual:sha256,pass:r.status===200&&sha256===m.sha256})}catch(e){results.push({source:m.url,url,pass:false,error:e.message})}}}))
writeFileSync(path.join(out,'asset-http-identity.json'),JSON.stringify(results,null,2)+'\n')
const redirects=JSON.parse(readFileSync('apps/h2o/content/salmon/redirects.json')),redirectResults=[]
for(const row of redirects){const r=await fetch('http://127.0.0.1:3110'+row.source,{redirect:'manual'});const loc=r.headers.get('location');const target=loc?new URL(loc,'http://127.0.0.1:3110'):null;redirectResults.push({...row,status:r.status,location:loc,pass:[301,308].includes(r.status)&&decodeURIComponent(target?.pathname??'')===decodeURIComponent(row.destination)})}
writeFileSync(path.join(out,'redirect-http.json'),JSON.stringify(redirectResults,null,2)+'\n')
const disabled=readFileSync('apps/h2o/content/salmon/CANDIDATE_ONLY_ROUTE_DECISIONS.tsv','utf8').trim().split('\n').slice(1).map(l=>l.split('\t')[0])
const guard=[]
for(const url of [...disabled,'/home/','/salmon-unknown-route-must-not-exist/']){const r=await fetch('http://127.0.0.1:3110'+url,{redirect:'manual'});guard.push({path:url,status:r.status,pass:r.status===404})}
writeFileSync(path.join(out,'disabled-route-http.json'),JSON.stringify(guard,null,2)+'\n')
console.log({uniqueBinaries:unique.length,binaryFailures:results.filter(r=>!r.pass).length,redirects:redirectResults.length,redirectFailures:redirectResults.filter(r=>!r.pass).length,disabledFailures:guard.filter(r=>!r.pass).length})
