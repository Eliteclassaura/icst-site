import {chromium} from 'playwright'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
const manifest=JSON.parse(readFileSync('release/evidence/edge-manifest.json','utf8'))
const product=manifest.routes.find(row=>row.routeClass==='product').path
const routes={home:'/',service:'/thermal-upgrade/',contact:'/contact-us/',parts:'/cooling-tower-parts-online/',product,resources:'/resources/',articles:'/tech-articles/',detail:'/fill-assembly-glued-vs-mechanical/'}
mkdirSync('release/evidence/screenshots',{recursive:true})
const browser=await chromium.launch({headless:true}),results=[]
for(const [name,route] of Object.entries(routes))for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1})
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  const response=await page.goto('http://127.0.0.1:3106'+route,{waitUntil:'networkidle'})
  await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=800){scrollTo(0,y);await new Promise(resolve=>setTimeout(resolve,15))}scrollTo(0,0)})
  await page.waitForTimeout(300)
  const info=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,title:document.title,h1:document.querySelector('h1')?.textContent,images:[...document.images].filter(image=>image.checkVisibility()).map(image=>({src:image.getAttribute('src'),complete:image.complete,naturalWidth:image.naturalWidth})),visibleProducts:[...document.querySelectorAll('.wave3-catalog [data-static-product]')].filter(node=>getComputedStyle(node).display!=='none').length}))
  await page.screenshot({path:`release/evidence/screenshots/${name}-${width}.png`,fullPage:true})
  await page.screenshot({path:`release/evidence/screenshots/${name}-top-${width}.png`})
  if(name==='articles'){
    await page.locator('.wave4-more-articles').evaluate(node=>{node.open=true})
    await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=800){scrollTo(0,y);await new Promise(resolve=>setTimeout(resolve,20))}})
    await page.waitForTimeout(400)
    info.expandedArticleImages=await page.locator('.wave4-article-image img').evaluateAll(images=>({count:images.length,broken:images.filter(image=>!image.complete||image.naturalWidth===0).length}))
  }
  results.push({name,route,width,status:response.status(),...info,errors});await page.close()
}
const page=await browser.newPage()
const searchErrors=[];page.on('pageerror',error=>searchErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')searchErrors.push(message.text())})
await page.goto('http://127.0.0.1:3106/search/?q=cooling',{waitUntil:'networkidle'})
await page.waitForTimeout(1500)
const search=await page.evaluate(()=>({status:document.querySelector('#release-search-status')?.textContent,results:document.querySelectorAll('#release-search-results li').length}))
await page.goto('http://127.0.0.1:3106/cooling-tower-parts-online/?q=gearbox&page=2',{waitUntil:'networkidle'})
const parts=await page.evaluate(()=>({count:document.querySelector('.wave3-catalog-heading p')?.textContent,pagination:document.querySelector('.wave3-pagination')?.textContent,input:document.querySelector('#wave3-query')?.value,visible:[...document.querySelectorAll('.wave3-catalog [data-static-product]')].filter(node=>getComputedStyle(node).display!=='none').length}))
await browser.close()
writeFileSync('release/evidence/rendered-qa.json',JSON.stringify({results,search:{...search,errors:searchErrors},parts},null,2))
console.log(JSON.stringify({pages:results.map(({name,width,status,scrollWidth,errors,images,visibleProducts})=>({name,width,status,scrollWidth,errors,brokenImages:images.filter(image=>!image.complete||image.naturalWidth===0).length,visibleProducts})),search:{...search,errors:searchErrors},parts},null,2))
