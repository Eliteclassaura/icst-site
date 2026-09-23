import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs'
import path from 'node:path'
import {releaseAuthority} from './authority.mjs'

const root=process.cwd(),build=path.join(root,'.public-renderer')
const a=releaseAuthority(root)
const write=(file,value)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,value)}
write(path.join(root,'content/release/route-ledger.json'),JSON.stringify(a,null,2)+'\n')
mkdirSync(build,{recursive:true})
for(const [name,target] of [['content',path.join(root,'content')],['public',path.join(root,'public')],['node_modules',path.join(root,'node_modules')],['src/site',path.join(root,'src/site')],['src/conversion',path.join(root,'src/conversion')]]){
  const dest=path.join(build,name);mkdirSync(path.dirname(dest),{recursive:true});if(!existsSync(dest))symlinkSync(target,dest,'dir')
}
// Only public route-group code is copied. No proxy, Payload layout/API, config, secrets or env files.
cpSync(path.join(root,'src/app/(site)'),path.join(build,'src/app/(site)'),{recursive:true,filter:source=>!source.includes('/api/')&&!source.endsWith('/api')})
cpSync(path.join(root,'src/app/(site)/[[...slug]]/page.tsx'),path.join(build,'src/accepted-page.tsx'))
let accepted=readFileSync(path.join(build,'src/accepted-page.tsx'),'utf8').replaceAll("'../../../site/","'./site/")
write(path.join(build,'src/accepted-page.tsx'),accepted)
cpSync(path.join(root,'release/templates/page.tsx'),path.join(build,'src/app/(site)/[[...slug]]/page.tsx'))
cpSync(path.join(root,'release/templates/search.tsx'),path.join(build,'src/app/(site)/search/page.tsx'))
let layout=readFileSync(path.join(build,'src/app/(site)/layout.tsx'),'utf8')
layout=layout.replace("import { estateHasPublicationReadyRoute } from '../../site/gate'",'').replace('robots: defaultRobots(estateHasPublicationReadyRoute()),','')
write(path.join(build,'src/app/(site)/layout.tsx'),layout)
write(path.join(build,'next.config.mjs'),"export default {output:'export',trailingSlash:true,poweredByHeader:false,images:{unoptimized:true},experimental:{cpus:2},typescript:{tsconfigPath:'tsconfig.json'}}\n")
write(path.join(build,'package.json'),JSON.stringify({name:'h2o-public-static-renderer',private:true,type:'module'},null,2))
write(path.join(build,'tsconfig.json'),JSON.stringify({extends:'../tsconfig.json',compilerOptions:{incremental:false,paths:{'@/*':['./src/*']}},include:['src/**/*.ts','src/**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules','src/site/__tests__','src/conversion/__tests__']},null,2))
write(path.join(root,'public/release-search.js'),readFileSync(path.join(root,'release/templates/release-search.js')))
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
write(path.join(root,'public/sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+a.routes.filter(r=>r.sitemap).map(r=>`  <url><loc>${escape(r.canonical)}</loc></url>`).join('\n')+'\n</urlset>\n')
write(path.join(root,'public/robots.txt'),'User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /private/\nSitemap: https://h2ocooling.com/sitemap.xml\n')
const tsv=rows=>rows.map(row=>row.map(value=>String(value??'').replaceAll('\t',' ').replaceAll('\n',' ')).join('\t')).join('\n')+'\n'
write(path.join(root,'release/evidence/route-ledger.tsv'),tsv([['PATH','SOURCE_ID','CLASS','STATE','EXPORTED','INDEXABLE','CANONICAL','SITEMAP','REDIRECT','SOURCE_SHA256'],...a.routes.map(r=>[r.path,r.routeId,r.routeClass,r.state,r.export,r.indexable,r.canonical,r.sitemap,r.redirect,r.sourceSha256])]))
write(path.join(root,'release/evidence/canonical-177.tsv'),tsv([['SOURCE_ID','PATH','BEFORE','AFTER','PATH_UNCHANGED'],...a.routes.filter(r=>r.matchedArticle).map(r=>[r.routeId,r.path,r.previousCanonical,r.canonical,new URL(r.previousCanonical).pathname===new URL(r.canonical).pathname])]))
write(path.join(root,'release/evidence/redirect-ledger.json'),JSON.stringify(a.redirects,null,2))
console.log(JSON.stringify({renderer:build,routes:a.routes.length,export:a.routes.filter(r=>r.export).length,indexable:a.routes.filter(r=>r.indexable).length,redirects:a.redirects.length,held:a.routes.filter(r=>r.state==='REVIEW_HOLD').length}))
