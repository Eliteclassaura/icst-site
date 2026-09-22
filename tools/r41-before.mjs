import {chromium} from 'playwright'
import {mkdirSync,writeFileSync} from 'node:fs'
const out='../r41-evidence/articles/before';mkdirSync(out,{recursive:true})
const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:1000}})
await p.goto('http://127.0.0.1:3104/cooling-tower-performance-testing/',{waitUntil:'networkidle'})
await p.screenshot({path:out+'/performance-1440.png',fullPage:true})
writeFileSync(out+'/render.json',JSON.stringify(await p.evaluate(()=>({headings:[...document.querySelectorAll('article h2,article h3')].map(n=>n.textContent),text:document.querySelector('article').textContent,overflow:document.documentElement.scrollWidth>innerWidth,rail:document.querySelector('.article-rail')?.getBoundingClientRect().toJSON()})),null,2))
await b.close()
