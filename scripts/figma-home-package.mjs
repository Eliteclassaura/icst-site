import {createHash} from 'node:crypto'
import {copyFileSync,existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'

const sourceRoot=process.cwd()
const outputRoot='/Users/sb/Documents/Codex/2026-09-20/x20-an-x20/outputs'
const packageName='H2O_FIGMA_HOME_IMPLEMENTATION_2026-09-22_R1'
const packageRoot=path.join(outputRoot,packageName)
const archive=path.join(outputRoot,`${packageName}.zip`)
if(existsSync(packageRoot)||existsSync(archive))throw new Error('Review package already exists; inspect it before replacing.')

const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const put=(source,destination)=>{mkdirSync(path.dirname(destination),{recursive:true});copyFileSync(source,destination)}
const textSources=[
  'apps/h2o/src/app/(site)/layout.tsx',
  'apps/h2o/src/site/LuxuryCanonical.tsx',
  'apps/h2o/src/site/LuxuryShell.tsx',
  'apps/h2o/src/app/(site)/figma-home.css',
  'apps/h2o/public/fonts/figma-home/OFL-Bebas-Neue.txt',
  'apps/h2o/public/fonts/figma-home/OFL-DM-Sans.txt',
  'scripts/figma-home-snapshot.mjs',
  'scripts/figma-home-browser-qa.mjs',
  'scripts/figma-home-package.mjs',
]
const tracked=new Set(textSources.slice(0,3))
const changed=['PATH\tCATEGORY\tPRE_SHA256\tPOST_SHA256']
for(const relative of textSources){
  const current=readFileSync(path.join(sourceRoot,relative))
  let before='-'
  if(tracked.has(relative)){
    const prior=spawnSync('git',['show',`HEAD:${relative}`],{cwd:sourceRoot})
    if(prior.status!==0)throw new Error(`Cannot read baseline ${relative}: ${prior.stderr}`)
    before=sha(prior.stdout)
  }
  changed.push([relative,tracked.has(relative)?'TRACKED_SOURCE':'NEW_TEXT_SOURCE',before,sha(current)].join('\t'))
  put(path.join(sourceRoot,relative),path.join(packageRoot,'source',relative))
}
writeFileSync(path.join(packageRoot,'CHANGED_FILES.tsv'),changed.join('\n')+'\n')

const binarySources=[
  ['apps/h2o/public/fonts/figma-home/bebas-neue-latin-400.woff2','FONT_WOFF2','Official Google Fonts Bebas Neue OFL distribution'],
  ['apps/h2o/public/fonts/figma-home/dm-sans-latin-400-700.woff2','FONT_WOFF2','Official Google Fonts DM Sans OFL distribution'],
]
const binaries=['PATH\tTYPE\tSIZE_BYTES\tSHA256\tSOURCE_AUTHORITY']
for(const [relative,type,authority] of binarySources){
  const absolute=path.join(sourceRoot,relative)
  binaries.push([relative,type,statSync(absolute).size,sha(readFileSync(absolute)),authority].join('\t'))
}
writeFileSync(path.join(packageRoot,'BINARY_ASSET_MANIFEST.tsv'),binaries.join('\n')+'\n')

put(path.join(sourceRoot,'CONTROL_TOWER_REPORT.md'),path.join(packageRoot,'CONTROL_TOWER_REPORT.md'))
for(const file of ['AUTHORITY_PRECEDENCE.md','SOURCE_BASELINE.txt','QA_REPORT.md','SEO_PRESERVATION_REPORT.md','TYPEFORM_REGRESSION_REPORT.md','FIGMA_FIDELITY_REPORT.md','RESPONSIVE_REPORT.md','H2O_FIGMA_HOME_DESIGN_BRIEF_R1_2_CONTROL_TOWER_ERRATA.md']){
  put(path.join(sourceRoot,'review',file),path.join(packageRoot,file))
}
put('/Users/sb/Downloads/H2O_FIGMA_HOME_DESIGN_BRIEF_R1.md',path.join(packageRoot,'H2O_FIGMA_HOME_DESIGN_BRIEF_R1.md'))
put('/Users/sb/Downloads/H2O_FIGMA_HOME_DESIGN_BRIEF_R1_1_AUTHORITY_ADDENDUM_DOWNLOAD.md',path.join(packageRoot,'H2O_FIGMA_HOME_DESIGN_BRIEF_R1_1_AUTHORITY_ADDENDUM.md'))
for(const width of [1440,1024,768,390])put(path.join(sourceRoot,'review/screenshots',`home-${width}.png`),path.join(packageRoot,'screenshots',`home-${width}.png`))
for(const width of [1440,390])for(const name of ['hero','capabilities','parts','parts-index','projects','testimonials','footer'])put(path.join(sourceRoot,'review/screenshots',`${name}-${width}.png`),path.join(packageRoot,'screenshots',`${name}-${width}.png`))
const zipped=spawnSync('zip',['-q','-r',archive,packageName],{cwd:outputRoot,encoding:'utf8'})
if(zipped.status!==0)throw new Error(`zip failed: ${zipped.stderr}`)
console.log(JSON.stringify({archive,sizeBytes:statSync(archive).size,sha256:sha(readFileSync(archive)),sourceCount:textSources.length,binaryCount:binarySources.length}))
