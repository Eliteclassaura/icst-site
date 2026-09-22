import {chromium} from 'playwright'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
const root=path.resolve('apps/h2o/content/salmon'),out=path.resolve('../salmon-activation-evidence/responsive')
mkdirSync(out,{recursive:true})
const entries=JSON.parse(readFileSync(path.join(root,'active-routes.json'))).map(r=>({...r,doc:JSON.parse(readFileSync(path.join(root,r.file)))}))
const articles=entries.filter(r=>r.doc.type==='posts')
const pick=[entries.find(r=>r.targetPath==='/'),entries.find(r=>r.targetPath==='/about-ics/'),entries.find(r=>r.targetPath==='/contact-us/'),[...articles].sort((a,b)=>b.doc.text.length-a.doc.text.length)[0],articles.find(r=>/step|process/i.test(r.doc.title)),articles.find(r=>r.doc.structures.some(n=>/frequently asked|^faq/i.test(n.text))),articles.find(r=>r.doc.structures.some(n=>n.tag==='table')),entries.find(r=>r.targetPath==='/product/frp-angles/'),entries.find(r=>r.targetPath.includes('/category/blog/page/2/')),articles.find(r=>r.doc.images.length===0),articles.find(r=>r.doc.images.length>=8)].filter(Boolean)
const samples=[...new Map(pick.map(r=>[r.routeId,r])).values()]
const browser=await chromium.launch(),results=[]
const page=await browser.newPage({javaScriptEnabled:false})
await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:3110'?r.continue():r.abort())
for(const width of [1440,1024,768,390]){
 await page.setViewportSize({width,height:1000})
 for(const row of samples){
  await page.goto('http://127.0.0.1:3110'+row.targetPath,{waitUntil:'load',timeout:90000})
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(async img=>{img.loading='eager';try{await img.decode()}catch{}}))})
  const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,images:[...document.querySelectorAll('[data-source-src]')].map(img=>({src:img.getAttribute('src'),complete:img.complete,naturalWidth:img.naturalWidth,frameWidth:img.getBoundingClientRect().width,upscaled:img.getBoundingClientRect().width>img.naturalWidth+1})),unavailable:[...document.querySelectorAll('[data-source-media-unavailable]')].map(n=>n.getAttribute('data-source-media-unavailable'))}))
  await page.locator('main').evaluate(n=>n.scrollIntoView({block:'start'}))
  await page.screenshot({path:path.join(out,`${row.routeId}-${width}-body.png`)})
  await page.evaluate(()=>scrollTo(0,0))
  await page.screenshot({path:path.join(out,`${row.routeId}-${width}-top.png`)})
  results.push({route:row.targetPath,type:row.doc.type,width,...result})
 }
 console.log('Responsive',width,samples.length,'routes')
}
await browser.close()
writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n')
console.log({checks:results.length,overflow:results.filter(r=>r.overflow).length,imageFailures:results.flatMap(r=>r.images).filter(i=>!i.complete||i.naturalWidth===0||i.frameWidth===0||i.upscaled).length})
