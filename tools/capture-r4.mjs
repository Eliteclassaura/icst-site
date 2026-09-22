import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const base = process.env.BASE ?? 'http://127.0.0.1:3104'
const out = process.env.OUT
if (!out) throw new Error('OUT is required')
const routes = [['home','/'],['upgrades','/cooling-tower-thermal-upgrade/'],['parts','/cooling-tower-parts-online/'],['about','/about-ics-industrial-cooling-solutions/'],['contact','/contact-us/'],['maintenance','/cooling-tower-maintenance/'],['resources','/resources/']]
const report = { base, pages: [], issues: [] }
const browser = await chromium.launch({headless:true})
for (const width of (process.env.WIDTHS ?? '1440,1024,768,390').split(',').map(Number)) {
  const context = await browser.newContext({ viewport:{width,height:width === 390 ? 844:1000}, deviceScaleFactor:1 })
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort())
  for (const [name, route] of routes.filter(([name]) => !process.env.ONLY || process.env.ONLY.split(',').includes(name))) {
    const page = await context.newPage()
    const imageRequests=[]
    page.on('response', response=>{if(response.request().resourceType()==='image')imageRequests.push({url:response.url(),status:response.status()})})
    const response = await page.goto(base + route,{waitUntil:'networkidle',timeout:60000})
    await page.locator('img').evaluateAll(async images => Promise.all(images.map(img=>img.decode().catch(()=>{}))))
    const metrics = await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth > innerWidth + 1,
      h1:document.querySelectorAll('h1').length,
      bodyText:document.body.innerText,
      logos:[...document.querySelectorAll('.header .identity, .r3footer-brand > a')].map(a=>({tag:a.tagName,href:a.getAttribute('href'),name:a.getAttribute('aria-label'),width:a.getBoundingClientRect().width})),
      images:[...document.images].map(img=>{
        const b=img.getBoundingClientRect(); const style=getComputedStyle(img)
        const frame=img.closest('.feature-frame')?.getBoundingClientRect()
        return {src:img.getAttribute('src'),alt:img.alt,complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,width:b.width,height:b.height,coverScale:style.objectFit==='cover'?Math.max(b.width/img.naturalWidth,b.height/img.naturalHeight):b.width/img.naturalWidth,frame:frame?{width:frame.width,height:frame.height,x0:(frame.x-b.x)/b.width,y0:(frame.y-b.y)/b.height,x1:(frame.right-b.x)/b.width,y1:(frame.bottom-b.y)/b.height}:null}
      }),
      contactOffices:document.querySelectorAll('.contact-directory--footer .contact-office').length,
      testimonials:document.querySelectorAll('.testimonial-row').length,
      contactText:document.querySelector('.contact-directory--footer')?.textContent,
      testimonialText:[...document.querySelectorAll('.testimonial-row')].map(el=>el.textContent),
    }))
    const folder=path.join(out,String(width));mkdirSync(folder,{recursive:true})
    await page.screenshot({path:path.join(folder,name+'.png'),fullPage:true})
    await page.screenshot({path:path.join(folder,name+'-first-screen.png')})
    if(name==='home') {
      for(const [selector,label] of [['.r3hero','hero'],['.testimonials','testimonials'],['.contact-directory--footer','contacts'],['#capability-01','construction'],['#capability-02','service'],['#capability-03','parts']]) {
        if(await page.locator(selector).count()) await page.locator(selector).screenshot({path:path.join(folder,'home-'+label+'.png')})
      }
    }
    const faults=[]
    if(response.status()!==200)faults.push('HTTP '+response.status())
    if(metrics.overflow)faults.push('overflow')
    if(metrics.h1!==1)faults.push('H1 count')
    if(metrics.images.some(i=>!i.complete||!i.naturalWidth))faults.push('broken image')
    if(metrics.images.some(i=>i.src.includes('/r4/')&&i.coverScale>1.01))faults.push('R4 media upscale')
    if(metrics.images.some(i=>i.frame&&(i.frame.width<=0||i.frame.height<=0||i.frame.x0<-.002||i.frame.y0<-.002||i.frame.x1>1.002||i.frame.y1>1.002)))faults.push('invalid visible crop/frame')
    if(imageRequests.some(i=>i.status!==200&&i.status!==304))faults.push('image request failure')
    if(metrics.contactOffices!==3)faults.push('contact offices')
    if(name==='home'&&metrics.testimonials!==8)faults.push('testimonials')
    let logoClicks=[]
    for(const selector of ['.header .identity','.r3footer-brand > a']) {
      if(await page.locator(selector+'[href="/"]').count()) {
        await page.locator(selector).click(); await page.waitForURL(base+'/')
        await page.goto(base+route,{waitUntil:'domcontentloaded'})
        await page.locator(selector).focus(); await page.keyboard.press('Enter'); await page.waitForURL(base+'/')
        logoClicks.push({selector,home:true,keyboard:true})
      } else {logoClicks.push({selector,home:false});faults.push('logo home link '+selector)}
    }
    report.pages.push({name,route,width,status:response.status(),...metrics,imageRequests,logoClicks})
    report.issues.push(...faults.map(f=>`${width} ${route}: ${f}`))
    await page.close()
  }
  await context.close()
}
await browser.close()
writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({pages:report.pages.length,issues:report.issues},null,2))
