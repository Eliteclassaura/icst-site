import {chromium} from 'playwright'
import {readFileSync,writeFileSync} from 'node:fs'
const browser=await chromium.launch(),page=await browser.newPage(),origin='http://127.0.0.1:3112',controls=new Map()
const models=JSON.parse(readFileSync('../luxury-evidence/design-trees.json'))
for(const m of models){await page.goto(origin+m.route);const links=await page.locator('a[href]').evaluateAll(a=>a.map(n=>({href:n.getAttribute('href'),source:n.hasAttribute('data-source-href'),text:n.textContent.trim()})));for(const l of links){if(l.source||!l.href.startsWith('/')||l.href.startsWith('//'))continue;controls.set(l.href,[...(controls.get(l.href)??[]),m.route])}}
const results=[]
for(const [href,routes] of controls){const r=await page.request.get(origin+href);results.push({href,routes:[...new Set(routes)],status:r.status(),pass:r.status()===200})}
await browser.close();writeFileSync('../luxury-evidence/behavior/new-controls.json',JSON.stringify(results,null,2));console.log({newControlTargets:results.length,failed:results.filter(r=>!r.pass)});process.exitCode=results.some(r=>!r.pass)?1:0
