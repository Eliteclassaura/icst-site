import {spawnSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import path from 'node:path'
// Never supplies production credentials, contacts a database, or changes fail-closed config.
const run=spawnSync('pnpm',['--filter','@factory/h2o','build','--webpack'],{encoding:'utf8',maxBuffer:30*1024*1024})
const root=path.resolve('../salmon-activation-evidence/tests')
writeFileSync(path.join(root,'production-build.log'),(run.stdout??'')+(run.stderr??''))
writeFileSync(path.join(root,'production-build.json'),JSON.stringify({command:'pnpm --filter @factory/h2o build --webpack',status:run.status,environment:'No credentials provisioned; production remains locked'},null,2)+'\n')
console.log('Build gate',run.status)
