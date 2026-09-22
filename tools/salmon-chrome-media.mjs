import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const root=path.resolve('apps/h2o/content/salmon'),pub=path.resolve('apps/h2o/public/media/salmon')
const archive='/Users/sb/Desktop/Documents/Archive/Organized_2026-09-10/03_H2O_Cooling/h2obackup/salmon-rhinoceros-754457.hostingersite.com/public_html/wp-content/uploads'
const sharp=createRequire(path.resolve('apps/h2o/package.json'))('sharp')
const rows=JSON.parse(readFileSync(path.join(root,'media-identities.json'))),held=new Set(rows.map(r=>r.url)),urls=new Set()
for(const route of JSON.parse(readFileSync(path.join(root,'active-routes.json')))){
 const doc=JSON.parse(readFileSync(path.join(root,route.file)))
 const walk=n=>{if(typeof n==='string')return;if(n.tag==='img')urls.add(new URL(n.attrs['data-src']||n.attrs.src,doc.sourceUrl).href);n.children.forEach(walk)}
 doc.chrome.forEach(c=>walk(c.tree))
}
const additions=[]
for(const url of urls){
 if(held.has(url))continue
 const u=new URL(url),rel=decodeURIComponent(u.pathname).split('/wp-content/uploads/')[1]
 if(u.hostname!=='salmon-rhinoceros-754457.hostingersite.com'||!rel||rel.split('/').includes('..'))throw new Error('Unresolved chrome source '+url)
 const file=path.join(archive,rel)
 if(!existsSync(file))throw new Error('Missing chrome original '+url)
 const bytes=readFileSync(file),sha256=createHash('sha256').update(bytes).digest('hex'),m=await sharp(bytes).metadata()
 const name=sha256+path.extname(file)
 copyFileSync(file,path.join(pub,name))
 const row={url,state:'SOURCE_BINARY_HELD',file:'media/'+name,sha256,bytes:bytes.length,width:m.width,height:m.height,format:m.format,authority:'EXACT_PATH_SALMON_BACKUP_CHROME_SUPPLEMENT'}
 rows.push(row);additions.push(row)
}
writeFileSync(path.join(root,'media-identities.json'),JSON.stringify(rows,null,2)+'\n')
writeFileSync(path.join(root,'chrome-media-supplement.json'),JSON.stringify(additions,null,2)+'\n')
console.log('Verified chrome-media supplement',additions.length)
