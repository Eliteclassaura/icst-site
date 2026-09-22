import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import path from 'node:path'
const out=path.resolve('../salmon-activation-evidence/tests');mkdirSync(out,{recursive:true})
const results=[]
for(const pkg of ['h2o','agency-core'])for(const gate of ['lint','typecheck','test']){
 const args=['--filter',`@factory/${pkg}`,gate]
 const run=spawnSync('pnpm',args,{encoding:'utf8',maxBuffer:30*1024*1024})
 writeFileSync(path.join(out,`${pkg}-${gate}.log`),(run.stdout??'')+(run.stderr??''))
 results.push({command:`pnpm ${args.join(' ')}`,status:run.status});console.log(pkg,gate,run.status)
}
writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n')
process.exitCode=results.some(r=>r.status!==0)?1:0
