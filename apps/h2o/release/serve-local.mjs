import http from 'node:http'
import {readFileSync,existsSync} from 'node:fs'
import path from 'node:path'
import {createWorker} from './worker.mjs'
const root=process.cwd(),manifest=JSON.parse(readFileSync('release/evidence/edge-manifest.json','utf8'))
const worker=createWorker(manifest),out=path.join(root,'.public-renderer/out')
const bucket={async get(key){const prefix=`releases/${manifest.releaseId}/`;if(!key.startsWith(prefix))return null;const file=path.join(out,key.slice(prefix.length));return existsSync(file)?{body:readFileSync(file)}:null}}
for(const [port,stage] of [[3106,'production'],[3107,'preview']]){
  http.createServer(async(req,res)=>{
    try{const result=await worker.fetch(new Request('https://h2ocooling.com'+req.url,{method:req.method}),{RELEASE_STAGE:stage,RELEASE_ID:manifest.releaseId,RELEASE_BUCKET:bucket});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()))}
    catch(error){res.writeHead(500);res.end(String(error))}
  }).listen(port,'127.0.0.1',()=>console.log(`${stage}: http://127.0.0.1:${port}`))
}
