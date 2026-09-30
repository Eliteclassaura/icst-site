// Salmon family media ledger: every rendered media slot (hash re-verified from bytes) and every
// source image slot on the audited family routes that does not resolve to a held binary.
// Run from apps/h2o: `npx tsx release/salmon-parity/media-ledger.ts <out.tsv>`
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import path from 'node:path'
import {salmonDocument,salmonMedia,salmonRoutes} from '../../src/site/salmon'
import {salmonFamilyFor,salmonFamilyModel} from '../../src/site/salmon-family-adapter'
import type {Block,MediaRef} from '../../src/site/salmon-family-model'
import {cssBackground} from '../../src/site/salmon-source'

const out=process.argv[2]??'salmon-media-ledger.tsv'
const rows:string[][]=[['ROUTE','ROUTE_ID','FAMILY','SLOT','SOURCE_URL','LOCAL_SRC','SHA256_EXPECTED','SHA256_ON_DISK','MATCH','WIDTH','HEIGHT','STATUS']]
const verify=(media:MediaRef)=>{const file=path.join(process.cwd(),'public',media.src);if(!existsSync(file))return 'MISSING_FILE';return createHash('sha256').update(readFileSync(file)).digest('hex')}
const walk=(block:Block,slot:string,emit:(slot:string,media:MediaRef)=>void)=>{
  if(block.type==='container'){if(block.background)emit(`${slot}/background:${block.background.mode}`,block.background.media);block.children.forEach((child,i)=>walk(child,`${slot}.${i}`,emit))}
  if(block.type==='image')emit(`${slot}/image`,block.media)
  if(block.type==='imageCard'&&block.media)emit(`${slot}/imageCard`,block.media)
  if((block.type==='iconCard'||block.type==='iconLink')&&block.icon?.kind==='image')emit(`${slot}/icon`,block.icon.media)
  if(block.type==='list')block.items.forEach((item,i)=>{if(item.icon?.kind==='image')emit(`${slot}/list.${i}/icon`,item.icon.media)})
  if(block.type==='productGrid')block.products.forEach(product=>{if(product.media)emit(`${slot}/product:${product.productPath??'unlinked'}`,product.media)})
  if(block.type==='accordion')block.items.forEach((item,i)=>item.answer.forEach((child,j)=>walk(child,`${slot}/accordion.${i}.${j}`,emit)))
}
const unresolved:string[][]=[]
for(const route of salmonRoutes()){
  const doc=salmonDocument(route),config=salmonFamilyFor(doc)
  if(!config)continue
  const model=salmonFamilyModel(doc,config)
  model.sections.forEach(section=>walk(section.root,`section.${section.index}`,(slot,media)=>{const disk=verify(media);rows.push([doc.targetPath,doc.routeId,config.family,slot,media.sourceUrl??'',media.src,media.sha256??'',disk,String(disk===media.sha256),String(media.width??''),String(media.height??''),disk===media.sha256?'SOURCE_BINARY_HELD_VERIFIED':'HASH_MISMATCH'])}))
  // Source image slots that did not resolve (would be silently absent otherwise).
  const text=JSON.stringify(doc.children)
  for(const match of text.matchAll(/"(?:data-src|src)": "([^"]+\.(?:png|jpe?g|webp|gif|svg)[^"]*)"/gi)){const media=salmonMedia(match[1],doc.sourceUrl);if(!media?.file)unresolved.push([doc.targetPath,doc.routeId,config.family,'source-img',match[1],'','','','false','','',media?.state??'NOT_IN_MEDIA_IDENTITIES'])}
}
// Library/article heroes (Wave 4 presentations) use the same CSS map.
for(const [routeId,key,pathLabel] of [['SALMON-pages-1761','8f448f5','/resources/'],['SALMON-pages-1797','8f448f5','/cooling-tower-brochures/'],['SALMON-pages-1870','8f448f5','/cooling-tower-resources/tools/'],['SALMON-pages-1875','e-c1d8555','/tech-articles/']] as const){
  const media=cssBackground(routeId,key)
  if(!media){unresolved.push([pathLabel,routeId,'library','hero-background','','','','','false','','','UNRESOLVED']);continue}
  const disk=verify(media);rows.push([pathLabel,routeId,'library','hero-background',media.sourceUrl,media.src,media.sha256??'',disk,String(disk===media.sha256),String(media.width??''),String(media.height??''),disk===media.sha256?'SOURCE_BINARY_HELD_VERIFIED':'HASH_MISMATCH'])
}
writeFileSync(out,[...rows,...unresolved].map(row=>row.join('\t')).join('\n')+'\n')
const verified=rows.slice(1).filter(row=>row[8]==='true').length
console.log(JSON.stringify({renderedSlots:rows.length-1,verified,hashMismatch:rows.length-1-verified,unresolvedSourceSlots:unresolved.length,unresolved:unresolved.slice(0,20).map(row=>`${row[0]} ${row[4].slice(-60)} ${row[11]}`)},null,1))
