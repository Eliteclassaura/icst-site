import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
const out='../luxury-evidence/tests';mkdirSync(out,{recursive:true});const results=[]
for(const pkg of ['h2o','agency-core'])for(const gate of ['lint','typecheck','test']){const run=spawnSync('pnpm',['--filter',`@factory/${pkg}`,gate],{encoding:'utf8',maxBuffer:30*1024*1024});writeFileSync(`${out}/${pkg}-${gate}.log`,(run.stdout??'')+(run.stderr??''));results.push({command:`pnpm --filter @factory/${pkg} ${gate}`,status:run.status});console.log(pkg,gate,run.status)}
writeFileSync(out+'/results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>r.status!==0)?1:0
