import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs'
import path from 'node:path'
const root=path.resolve('apps/h2o/content/salmon'),pub=path.resolve('apps/h2o/public/media/salmon')
const source=path.resolve('../../outputs/H2O_SALMON_SOURCE_RECOVERY_PARITY_CANDIDATE_2026_09_21/canonical')
const rows=JSON.parse(readFileSync(path.join(root,'attachments.json'))),ledger=[]
for(const row of rows){
 if(!row.file||!row.sha256)throw new Error('Unheld attachment original')
 const file=path.basename(row.file),target=path.join(pub,file)
 if(!existsSync(target))copyFileSync(path.join(source,row.file),target)
 ledger.push({attachmentId:row.attachment_id,sourceUrl:row.source_url,publicPath:'/media/salmon/'+file,sha256:row.sha256,width:row.width,height:row.height})
}
writeFileSync(path.join(root,'original-library.json'),JSON.stringify(ledger,null,2)+'\n')
console.log('Portable original attachment library',ledger.length)
