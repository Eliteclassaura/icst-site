import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
const root=path.resolve('../salmon-authority')
const output=path.join(root,'recovered-media')
mkdirSync(output,{recursive:true})
const items=JSON.parse(readFileSync(path.join(root,'canonical/attachments.json'))).filter(x=>!x.sha256)
const results=[]
for(const item of items){
 const url=item.source_url
 if(new URL(url).hostname!=='salmon-rhinoceros-754457.hostingersite.com')throw new Error('Unexpected origin')
 const file=path.join(output,createHash('sha256').update(url).digest('hex')+path.extname(new URL(url).pathname))
 if(!existsSync(file))execFileSync('curl',['-sS','--fail','--max-time','45',url,'-o',file])
 const bytes=readFileSync(file)
 results.push({url,file:path.relative(root,file),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length})
}
writeFileSync(path.join(output,'identities.json'),JSON.stringify(results,null,2)+'\n')
console.log(results.length,'missing attachment originals recovered')
