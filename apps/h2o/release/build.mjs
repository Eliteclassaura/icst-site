import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import * as pagefind from 'pagefind'
import {publicBuildConfig} from './public-build-config.mjs'

const root=process.cwd(),build=path.join(root,'.public-renderer'),evidence=path.join(root,'release/evidence')
function run(command,args,options={}){
  const result=spawnSync(command,args,{stdio:'inherit',...options})
  if(result.status!==0)throw new Error(`${command} ${args.join(' ')} exited ${result.status}`)
}
const publicConfig=publicBuildConfig(path.join(root,'release/public-build-config.json'))
if(!process.argv.includes('--finalize-only'))run(process.execPath,['release/prepare.mjs'])
const env={...process.env,...publicConfig,H2O_PUBLIC_EXPORT:'1',NEXT_TELEMETRY_DISABLED:'1'}
delete env.PAYLOAD_SECRET;delete env.DATABASE_URI
if(!process.argv.includes('--finalize-only'))run(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:build,env})
const a=JSON.parse(readFileSync(path.join(root,'content/release/route-ledger.json'),'utf8'))
const out=path.join(build,'out')
const {index,errors}=await pagefind.createIndex({rootSelector:'main',forceLanguage:'en'})
if(errors?.length||!index)throw new Error(JSON.stringify(errors))
let count=0
for(const row of a.routes.filter(row=>row.export&&row.searchable)){
  const file=path.join(out,decodeURIComponent(row.path),'index.html')
  const result=await index.addHTMLFile({url:row.path,content:readFileSync(file,'utf8')})
  if(result.errors?.length)throw new Error(JSON.stringify(result.errors))
  count++
}
const result=await index.writeFiles({outputPath:path.join(out,'pagefind')})
if(result.errors?.length)throw new Error(JSON.stringify(result.errors))
await pagefind.close()
mkdirSync(evidence,{recursive:true})
writeFileSync(path.join(evidence,'pagefind.json'),JSON.stringify({indexedPages:count,heldRowsIndexed:0,searchResultsIndexed:false,source:'exported HTML main content',version:JSON.parse(readFileSync(path.join(root,'node_modules/pagefind/package.json'))).version},null,2))
const assets={}
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else{const bytes=readFileSync(file),key='/'+path.relative(out,file).split(path.sep).join('/');assets[key]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}}}
walk(out)
const scriptHashes={}
for(const row of a.routes.filter(row=>row.export)){
  const file=path.join(out,decodeURIComponent(row.path),'index.html'),html=readFileSync(file,'utf8')
  scriptHashes[row.path]=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(match=>!match[1].includes('src=')&&!match[1].includes('application/ld+json')).map(match=>`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`)
}
writeFileSync(path.join(evidence,'asset-inventory.json'),JSON.stringify(assets,null,2))
const releaseId=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,20)
writeFileSync(path.join(evidence,'edge-manifest.json'),JSON.stringify({...a,releaseId,assets,scriptHashes},null,2))
writeFileSync(path.join(evidence,'worker-entry.mjs'),"import manifest from './edge-manifest.json' with {type:'json'};\nimport {createWorker} from '../worker.mjs';\nexport default createWorker(manifest);\n")
writeFileSync(path.join(evidence,'static-build.json'),JSON.stringify({command:'pnpm --filter @factory/h2o build:public',exit:0,output:'apps/h2o/.public-renderer/out',exportedRoutes:a.routes.filter(r=>r.export).length,files:Object.keys(assets).length,payloadSecretRequired:false,databaseRequired:false},null,2))
console.log(JSON.stringify({exportedRoutes:a.routes.filter(r=>r.export).length,pagefind:count,files:Object.keys(assets).length}))
