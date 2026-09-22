import {mkdirSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
const url='https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap'
let css=execFileSync('curl',['-L','--fail','--silent',url],{encoding:'utf8'})
mkdirSync('apps/h2o/public/fonts/luxury',{recursive:true})
let i=0;const ledger=[]
for(const match of [...css.matchAll(/https:\/\/fonts.gstatic.com\/[^)]+/g)]){const name=`font-${++i}.ttf`;execFileSync('curl',['-L','--fail','--silent',match[0],'-o','apps/h2o/public/fonts/luxury/'+name]);ledger.push({file:name,source:match[0]});css=css.replace(match[0],'/fonts/luxury/'+name)}
writeFileSync('apps/h2o/src/app/(site)/luxury-fonts.css',css)
writeFileSync('apps/h2o/content/luxury/font-provenance.json',JSON.stringify(ledger,null,2))
