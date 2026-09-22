import {chromium} from 'playwright'
import {readFileSync,existsSync,mkdirSync} from 'node:fs'
import path from 'node:path'
const root=path.resolve('../h2o-luxury-design-authority'),out=path.resolve('../luxury-evidence/authority');mkdirSync(out,{recursive:true})
const entries=JSON.parse(readFileSync('../luxury-evidence/design-trees.json')).map(m=>({file:m.name,width:1440,id:m.id}))
entries.push({file:'ICS Home 390',width:390,id:48},{file:'ICS Thermal Upgrade 390',width:390,id:1555})
const browser=await chromium.launch()
for(const e of entries){const page=await browser.newPage({viewport:{width:e.width,height:1000}})
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='fonts.googleapis.com')return r.fulfill({contentType:'text/css',body:readFileSync('apps/h2o/src/app/(site)/luxury-fonts.css','utf8').replaceAll('/fonts/','http://127.0.0.1:3112/fonts/')});if(u.hostname!=='authority.test')return r.continue();const file=path.resolve(root,decodeURIComponent(u.pathname.slice(1)));if(!file.startsWith(root+'/')||!existsSync(file))return r.abort();let body=readFileSync(file);if(file.endsWith('.html')){body=body.toString().replace(/<script[\s\S]*?<\/script>/g,'').replace(/<dc-import name="([^"]+)"[^>]*><\/dc-import>/g,(_,name)=>{const x=readFileSync(path.join(root,name+'.dc.html'),'utf8');return x.slice(x.indexOf('<x-dc>')+6,x.indexOf('</x-dc>'))});body=body.replace('</body>','<style>body{background:#fff!important} x-dc>div{padding:0!important} [data-screen-label]{box-shadow:none!important} </style></body>')}return r.fulfill({body,contentType:file.endsWith('.html')?'text/html':undefined})})
 await page.goto('http://authority.test/'+encodeURIComponent(e.file+'.dc.html'),{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready)
 await page.screenshot({path:path.join(out,`${e.id}-${e.width}-full.png`),fullPage:true});await page.screenshot({path:path.join(out,`${e.id}-${e.width}-top.png`)})
 await page.close()
}
await browser.close()
