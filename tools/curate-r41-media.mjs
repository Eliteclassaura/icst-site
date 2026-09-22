import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import path from 'node:path'
const app=path.resolve('apps/h2o')
const sharp=createRequire(path.join(app,'package.json'))('sharp')
const estate='/Users/sb/Desktop/Documents/Archive/Organized_2026-09-10/03_H2O_Cooling/h2obackup/salmon-rhinoceros-754457.hostingersite.com/public_html/wp-content/uploads'
const masters=JSON.parse(readFileSync('../r41-evidence/masters.json','utf8'))
const selected=[
  [2,28,'field-inspection','Field technician working beneath cooling tower structure'],
  [3,24,'tower-deck','Cooling tower fan deck and surrounding structure'],
  [9,25,'fan-stack','Fan stack, flanges and deck-level cabling'],
  [9,30,'fill-structure','Cooling tower fill and internal supporting structure'],
  [9,34,'tower-scale','Multi-cell industrial cooling tower'],
  [1,5,'water-nozzle','Water distribution nozzle'],
  [1,8,'drive-shaft','Drive shaft product views with original identification labels'],
  [1,41,'gearbox','Right-angle gearbox'],
  [2,14,'deck-team','Field personnel handling structural members'],
  [3,29,'construction','Cooling tower construction and lifting equipment'],
  [3,33,'structure','Cooling tower structural assembly'],
  [9,21,'tower-installation','Industrial cooling tower installation'],
  [11,56,'mechanical-deck','Cooling tower mechanical deck'],
  [3,36,'fan-assembly','Fan assembly'],
  [3,60,'water-system','Cooling tower and water-system piping'],
  [3,58,'tower-louvers','Cooling tower exterior louvers and stair access'],
  [4,26,'field-team','Field personnel beside cooling tower equipment'],
  [10,9,'tower-setting','Cooling towers in an industrial setting'],
]
const out=path.join(app,'public/media/r41');mkdirSync(out,{recursive:true})
const rows=[]
for(const [page,tile,id,alt] of selected){
  const original=masters[(page-1)*60+tile-1]
  const source=path.join(estate,original.relative_path)
  const bytes=readFileSync(source)
  const sourceHash=createHash('sha256').update(bytes).digest('hex')
  if(sourceHash!==original.sha256)throw new Error('Source drift '+source)
  const derivative=await sharp(bytes).resize({width:1600,withoutEnlargement:true}).webp({quality:90}).toBuffer()
  const meta=await sharp(derivative).metadata()
  writeFileSync(path.join(out,id+'.webp'),derivative)
  rows.push({id,alt,src:'/media/r41/'+id+'.webp',source,sourceSha256:sourceHash,sourceWidth:Number(original.width),sourceHeight:Number(original.height),sourceBytes:bytes.length,width:meta.width,height:meta.height,bytes:derivative.length,sha256:createHash('sha256').update(derivative).digest('hex'),transformation:'WebP delivery compression; maximum 1600px width; no enlargement, exposure correction, generative edit or geometry change',identity:'UNKNOWN; no named project or customer attribution',originalPreserved:true})
}
writeFileSync(path.join(app,'content/r41-articles/salmon-media.json'),JSON.stringify(rows,null,2)+'\n')
writeFileSync('../r41-evidence/selected-salmon-media.json',JSON.stringify(rows,null,2)+'\n')
console.log({selected:rows.length,sourceBytes:rows.reduce((n,r)=>n+r.sourceBytes,0),deliveryBytes:rows.reduce((n,r)=>n+r.bytes,0)})
