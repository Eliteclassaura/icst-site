/**
 * IMG-SEO-1 phase B: rewrites every /media/... raster URL in the app stylesheets (Elementor-derived backgrounds the helpers cannot
 * reach) to its descriptive URL. Idempotent; run after ops/img-seo/build-image-slugs.ts. image-slugs.test.tsx fails if one is left.
 *
 *   node ops/img-seo/codemod-css-image-urls.mjs
 */
import {readFileSync,readdirSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const APP=process.cwd()
const entries=JSON.parse(readFileSync(path.join(APP,'content/release/image-slugs.json'),'utf8')).entries
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])
let replaced=0
for(const file of walk(path.join(APP,'src/app')).filter(f=>f.endsWith('.css'))){
  const text=readFileSync(file,'utf8')
  const next=text.replace(/\/media\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif)/g,m=>{if(entries[m]){replaced++;return entries[m]}return m})
  if(next!==text)writeFileSync(file,next)
}
console.log(JSON.stringify({replaced}))
