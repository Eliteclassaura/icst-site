import {readFileSync,writeFileSync,mkdirSync,cpSync,copyFileSync,existsSync} from 'node:fs'
import path from 'node:path'
const source=path.resolve('../../outputs/H2O_SALMON_SOURCE_RECOVERY_PARITY_CANDIDATE_2026_09_21')
const destination=path.resolve('apps/h2o/content/salmon')
mkdirSync(destination,{recursive:true})
for(const file of ['documents','manifest.json','media-identities.json','media-placements.json','attachments.json','OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21.json','OWNER_TESTIMONIAL_AUTHORITY_OVERRIDE_2026_09_21.json','OWNER_OVERRIDE_AUTHORITY.tsv'])cpSync(path.join(source,'canonical',file),path.join(destination,file),{recursive:true})
const routes=JSON.parse(readFileSync(path.join(source,'routes.json')))
const manifest=JSON.parse(readFileSync(path.join(destination,'manifest.json')))
const byUrl=new Map(manifest.map(r=>[r.sourceUrl,r]))
const active=new Map(),redirects=[]
for(const row of routes){
 if(row.snapshot.status!==200)continue
 const effective=row.snapshot.effectiveUrl??row.url
 const doc=byUrl.get(effective)
 if(!doc)throw new Error('Effective URL lacks source document: '+effective)
 active.set(effective,doc)
 if(effective!==row.url)redirects.push({source:new URL(row.url).pathname,destination:new URL(effective).pathname,sourceUrl:row.url,effectiveUrl:effective})
}
if(active.size!==1205||redirects.length!==44)throw new Error('Accepted estate count mismatch')
writeFileSync(path.join(destination,'active-routes.json'),JSON.stringify([...active.values()].sort((a,b)=>a.targetPath.localeCompare(b.targetPath)),null,2)+'\n')
writeFileSync(path.join(destination,'redirects.json'),JSON.stringify(redirects.sort((a,b)=>a.source.localeCompare(b.source)),null,2)+'\n')
writeFileSync(path.join(destination,'CANDIDATE_ONLY_ROUTE_DECISIONS.tsv'),readFileSync(path.join(source,'canonical/CANDIDATE_ROUTES_WITHOUT_SALMON_MATCH.tsv'),'utf8').replaceAll('SOURCE_UNAVAILABLE','OWNER_MAPPING_REQUIRED'))
const media=JSON.parse(readFileSync(path.join(destination,'media-identities.json')))
const publicRoot=path.resolve('apps/h2o/public/media/salmon')
mkdirSync(publicRoot,{recursive:true})
for(const row of media)if(row.file){const target=path.join(publicRoot,path.basename(row.file));if(!existsSync(target))copyFileSync(path.join(source,'canonical',row.file),target)}
console.log('Installed',active.size,'routes;',redirects.length,'redirects;',media.filter(x=>x.file).length,'held media/download URLs')
