import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync,existsSync} from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'

const app=process.cwd(),repo=path.resolve(app,'../..')
const workspace='/Users/sb/Documents/Codex/2026-09-20/x20-an-x20'
const name='H2O_CORE_RELEASE_ARCHITECTURE_INTEGRATION_2026-09-23_R1'
const bundle=path.join(workspace,'outputs',name)
if(existsSync(bundle)||existsSync(bundle+'.zip'))throw new Error('Refusing to overwrite sealed package')
mkdirSync(bundle,{recursive:true})
const supplied=[]
function copy(relative,from=repo,to=relative){
  const destination=path.join(bundle,to);mkdirSync(path.dirname(destination),{recursive:true});cpSync(path.join(from,relative),destination,{recursive:true});supplied.push(to)
}
for(const relative of ['pnpm-lock.yaml','apps/h2o/package.json','apps/h2o/tsconfig.json','apps/h2o/src/site/salmon.ts','apps/h2o/src/site/Wave3Presentation.tsx','apps/h2o/src/site/release-document.ts','apps/h2o/src/site/StaticPartsController.tsx','apps/h2o/src/site/StaticSearchController.tsx','apps/h2o/content/release','apps/h2o/public/robots.txt','apps/h2o/public/sitemap.xml','apps/h2o/public/release-search.js','apps/h2o/release'])copy(relative)
for(const relative of ['next.config.mjs','tsconfig.json','src/app/(site)/layout.tsx','src/app/(site)/[[...slug]]/page.tsx','src/app/(site)/search/page.tsx'])copy(relative,path.join(app,'.public-renderer'),'boundary-proof/'+relative)
for(const relative of ['index.html','resources/index.html','search/index.html','cooling-tower-retrofit-guide-upgrading-old-towers/index.html','robots.txt','sitemap.xml'])copy(relative,path.join(app,'.public-renderer/out'),'export-samples/'+relative)
const files=[]
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Symlink in package');if(entry.isDirectory())walk(file);else{const relative=path.relative(bundle,file);if(/(^|\/)\.env|node_modules|(^|\/)\.git(\/|$)/.test(relative))throw new Error('Forbidden package path');const bytes=readFileSync(file);files.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})}}}
walk(bundle)
writeFileSync(path.join(bundle,'PACKAGE_MANIFEST.json'),JSON.stringify({candidate:repo,basePackageSha256:'cdcac27475b665c53db1af77b123db202ede63e721a88507d93a01d3df78950d',kind:'source integration delta plus evidence',files},null,2))
writeFileSync(path.join(bundle,'CHANGED_FILE_MANIFEST.tsv'),'path\tbytes\tsha256\n'+files.filter(row=>row.path.startsWith('apps/')&&!row.path.includes('/evidence/')).concat(files.filter(row=>row.path==='pnpm-lock.yaml')).map(row=>[row.path,row.bytes,row.sha256].join('\t')).join('\n')+'\n')
execFileSync('/usr/bin/zip',['-q','-r',bundle+'.zip',name],{cwd:path.dirname(bundle)})
execFileSync('/usr/bin/unzip',['-tq',bundle+'.zip'])
const bytes=readFileSync(bundle+'.zip')
const identity={filename:name+'.zip',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),files:files.length+2,candidate:repo,packagePath:bundle+'.zip'}
writeFileSync(bundle+'.identity.json',JSON.stringify(identity,null,2))
console.log(JSON.stringify(identity,null,2))
