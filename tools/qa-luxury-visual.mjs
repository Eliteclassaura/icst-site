import {chromium} from 'playwright'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
const out=path.resolve('../luxury-evidence',process.env.ROUND??'initial');mkdirSync(out,{recursive:true})
const models=JSON.parse(readFileSync('../luxury-evidence/design-trees.json'))
const browser=await chromium.launch(),results=[]
const norm=s=>s.replace(/\s+/g,' ').trim()
for(const m of models){
 const widths=m.id===48?[1440,1024,768,390]:[1555,411,1534].includes(m.id)?[1440,390]:[1440]
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1})
  await page.goto('http://127.0.0.1:3112'+m.route,{waitUntil:'networkidle',timeout:120000});await page.evaluate(async()=>{await document.fonts.ready;document.querySelectorAll('img').forEach(n=>n.loading='eager');await Promise.all([...document.images].map(n=>n.decode().catch(()=>{})))})
  const actual=await page.evaluate(()=>({title:document.title,h1:[...document.querySelectorAll('h1')].map(n=>n.textContent.trim()),overflow:document.documentElement.scrollWidth>innerWidth+1,offenders:[...document.querySelectorAll('main *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(n=>({tag:n.tagName,node:n.getAttribute('data-layout-node'),right:n.getBoundingClientRect().right})),fragments:[...document.querySelectorAll('[data-canonical-text]')].map(n=>({key:n.getAttribute('data-canonical-text'),start:Number(n.getAttribute('data-canonical-start')),end:Number(n.getAttribute('data-canonical-end')),text:n.textContent,visible:!!n.getClientRects().length})),images:[...document.images].map(n=>({src:n.getAttribute('src'),complete:n.complete,naturalWidth:n.naturalWidth,frameWidth:n.getBoundingClientRect().width})),deadLinks:[...document.querySelectorAll('a')].filter(n=>['#0','#',''].includes(n.getAttribute('href'))).map(n=>({text:n.textContent,href:n.getAttribute('href')})),reviewChrome:/DESIGN AUTHORITY|NOT IMPLEMENTED|IMAGE NOT HELD|ARCHETYPE —|SALMON-pages-/i.test(document.body.innerText),buyNow:/buy now|add to cart|checkout/i.test(document.body.innerText)}))
  const grouped=new Map();for(const f of actual.fragments)grouped.set(f.key,[...(grouped.get(f.key)??[]),f])
  const seen=new Map([...grouped].map(([key,parts])=>[key,parts.sort((a,b)=>a.start-b.start).map(p=>p.text).join(' ')]));const differences=m.leaves.filter(l=>!seen.has(l.key)||norm(seen.get(l.key))!==norm(l.text.trim()==='Buy Now'?'Request a Quote':l.text.replaceAll('+66-2-260-6598','+662-661-7723')))
  const dupes=actual.fragments.filter((f,i,a)=>a.some((v,j)=>j<i&&v.key===f.key&&f.start<v.end&&f.end>v.start))
  await page.screenshot({path:path.join(out,`${m.id}-${width}-full.png`),fullPage:true})
  await page.screenshot({path:path.join(out,`${m.id}-${width}-top.png`)})
  results.push({route:m.route,id:m.id,width,...actual,copyDifferences:differences,duplicateFragments:dupes})
  console.log(m.route,width,'copy',differences.length,'dupes',dupes.length,'overflow',actual.overflow,'dead',actual.deadLinks.length)
  await page.close()
 }
}
await browser.close();writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2))
