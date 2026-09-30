// Recovers PNG/JPEG icons that Salmon embedded inside inline SVG <image href="data:..."> nodes
// (country flags on project cards and project detail identity). Bytes are decoded verbatim and
// stored by SHA-256; nothing is re-encoded or substituted.
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
const root=process.cwd()
const routes=JSON.parse(readFileSync(path.join(root,'content/salmon/active-routes.json'),'utf8'))
const wanted=routes.filter(route=>route.routeId.startsWith('SALMON-pages-')&&route.targetPath.startsWith('/all-projects/'))
const icons={}
for(const route of wanted){
  const text=readFileSync(path.join(root,'content/salmon',route.file),'utf8')
  for(const match of text.matchAll(/data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)/g)){
    const bytes=Buffer.from(match[2],'base64'),sha=createHash('sha256').update(bytes).digest('hex'),ext=match[1]==='jpeg'?'jpg':'png'
    const file=`/media/salmon/${sha}.${ext}`
    if(!existsSync(path.join(root,'public',file)))writeFileSync(path.join(root,'public',file),bytes)
    icons[sha]??={src:file,bytes:bytes.length,routes:[]}
    if(!icons[sha].routes.includes(route.routeId))icons[sha].routes.push(route.routeId)
  }
}
writeFileSync(path.join(root,'content/salmon/parity-embedded-icons.json'),JSON.stringify({authority:'SALMON_EMBEDDED_SVG_IMAGE_RECOVERY_2026_09_28',method:'base64 data URI inside source inline SVG, decoded verbatim',icons},null,1)+'\n')
console.log(JSON.stringify({icons:Object.keys(icons).length,routes:wanted.length}))
