import {chromium} from 'playwright'
import {createHash} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import path from 'node:path'

const base=process.env.H2O_QA_URL??'http://localhost:3217'
const output=path.resolve('review/screenshots')
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({headless:true})
const results=[]
for(const width of [1440,1024,768,390]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce'})
  const fontRequests=[]
  page.on('request',request=>{if(/\.(?:woff2?|ttf)(?:\?|$)/.test(request.url()))fontRequests.push(request.url())})
  const response=await page.goto(base+'/',{waitUntil:'networkidle',timeout:30000})
  await page.evaluate(async()=>{await document.fonts.ready;for(let y=0;y<document.body.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(resolve=>setTimeout(resolve,25))}window.scrollTo(0,0)})
  await page.waitForTimeout(200)
  const data=await page.evaluate(()=>{
    const visible=(selector)=>[...document.querySelectorAll(selector)].filter(e=>getComputedStyle(e).display!=='none')
    const linkSet=(selector)=>[...new Set([...document.querySelectorAll(selector)].map(e=>e.getAttribute('href')))]
    const imgs=[...document.querySelectorAll('main img')].map(img=>({src:img.getAttribute('src'),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,renderedWidth:Math.round(img.getBoundingClientRect().width),renderedHeight:Math.round(img.getBoundingClientRect().height),complete:img.complete}))
    return {
      title:document.title,
      description:document.querySelector('meta[name="description"]')?.getAttribute('content'),
      canonical:document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      robots:document.querySelector('meta[name="robots"]')?.getAttribute('content'),
      h1:visible('main h1').map(e=>e.textContent?.trim()),
      headings:visible('main h1,main h2,main h3,main h4,main h5,main h6').map(e=>({level:e.tagName.toLowerCase(),text:e.textContent?.trim()})),
      bodyText:document.querySelector('main')?.textContent?.replace(/\s+/g,' ').trim(),
      internalTargets:linkSet('a[href^="/"]'),
      telephoneTargets:linkSet('a[href^="tel:"]'),
      testimonialCount:document.querySelectorAll('[data-testimonial-record]').length,
      socialTargets:linkSet('.client-socials a'),
      search:{action:document.querySelector('main form[role="search"]')?.getAttribute('action'),method:document.querySelector('main form[role="search"]')?.getAttribute('method')??'get',parameter:document.querySelector('main form[role="search"] input')?.getAttribute('name')},
      headerRfq:!!document.querySelector('.lux-header-rfq .rfq'),
      footerRfq:!!document.querySelector('.lux-footer-rfq .rfq'),
      mobileRfq:!!document.querySelector('.lux-menu-rfq .rfq'),
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:document.documentElement.clientWidth,
      fonts:{body:getComputedStyle(document.querySelector('main')).fontFamily,h1:getComputedStyle(document.querySelector('main h1')).fontFamily},
      mainFontFamilies:[...new Set([...document.querySelectorAll('main *')].map(e=>getComputedStyle(e).fontFamily))],
      images:imgs,
      schemas:[...document.querySelectorAll('script[type="application/ld+json"]')].map(e=>e.textContent),
    }
  })
  data.schemaNormalizedSha256=createHash('sha256').update(JSON.stringify(data.schemas.map(raw=>JSON.parse(raw)))).digest('hex')
  delete data.schemas
  data.width=width
  data.status=response?.status()
  data.fontRequests=fontRequests
  await page.screenshot({path:path.join(output,`home-${width}-r1_2.png`),fullPage:true,animations:'disabled'})
  data.presentation=await page.evaluate(()=>{
    const node=id=>document.querySelector(`[data-layout-node="${id}"]`)
    const style=id=>getComputedStyle(node(id))
    const rect=id=>node(id).getBoundingClientRect()
    const index=document.querySelector('.lux-complete-product-index')
    const cardAction=node(67).querySelector('[data-presentation-exception] a')
    const bandActions=[...node(158).children]
    return {
      capabilityTitleFonts:[34,40,46].map(id=>({id,font:style(id).fontFamily,weight:style(id).fontWeight,tracking:style(id).letterSpacing})),
      capabilityGridColumns:style(31).gridTemplateColumns,
      capabilityHeading:{font:style(26).fontFamily,size:style(26).fontSize,width:rect(26).width},
      projectHeading:{font:style(170).fontFamily,width:rect(170).width},
      projectCardTitle:{font:getComputedStyle(node(172).querySelector('h2,h3')).fontFamily,weight:getComputedStyle(node(172).querySelector('h2,h3')).fontWeight},
      conversionEyebrow:{font:style(235).fontFamily,weight:style(235).fontWeight,tracking:style(235).letterSpacing},
      index:{height:index.getBoundingClientRect().height,groupCount:index.children.length,linkCount:index.querySelectorAll('a').length,gapFromFirst:Math.round(index.getBoundingClientRect().top-rect(100).bottom),columns:getComputedStyle(index).columnCount},
      activeChip:{width:rect(57).width,color:style(57).color,background:style(57).backgroundImage},
      cardAction:{height:cardAction.getBoundingClientRect().height,background:getComputedStyle(cardAction).backgroundColor,color:getComputedStyle(cardAction).color},
      projectCardPadding:getComputedStyle(node(172).firstElementChild).padding,
      bandActions:bandActions.map(element=>({text:element.textContent.trim(),width:element.getBoundingClientRect().width,padding:getComputedStyle(element).padding,radius:getComputedStyle(element).borderRadius})),
    }
  })
  if(width===1440||width===390){
    // Focus crops exclude the sticky header so it cannot mask a scrolled section.
    await page.addStyleTag({content:'.lux-header{position:relative!important}'})
    for(const [name,selector] of [['hero','.figma-home-hero-stage'],['capabilities','[data-layout-node="24"]'],['parts','[data-layout-node="52"]'],['parts-index','.figma-home-main>.lux-section-wrap:has([data-layout-node="52"])>.lux-remainder'],['projects','[data-layout-node="165"]'],['testimonials','.client-testimonials'],['footer','.lux-footer']]){
      const element=page.locator(selector).first()
      if(await element.count())await element.screenshot({path:path.join(output,`${name}-${width}.png`),animations:'disabled'})
    }
  }
  if(width===1440||width===390){
    await page.locator('[data-layout-node="100"]').screenshot({path:path.join(output,`parts-index-first-${width}-r1_2.png`),animations:'disabled'})
    await page.locator('.lux-complete-product-index').screenshot({path:path.join(output,`parts-index-second-${width}-r1_2.png`),animations:'disabled'})
    const indexes=await page.evaluate(()=>{
      const first=document.querySelector('[data-layout-node="100"]').getBoundingClientRect()
      const second=document.querySelector('.lux-complete-product-index').getBoundingClientRect()
      return {top:first.top+scrollY,bottom:second.bottom+scrollY}
    })
    await page.screenshot({path:path.join(output,`parts-indexes-${width}-r1_2.png`),fullPage:true,clip:{x:0,y:indexes.top,width,height:indexes.bottom-indexes.top},animations:'disabled'})
  }
  if(width===390){
    await page.locator('[data-layout-node="154"]').screenshot({path:path.join(output,'precision-band-390-r1_2.png'),animations:'disabled'})
    await page.locator('[data-layout-node="1"]').screenshot({path:path.join(output,'hero-390-r1_2.png'),animations:'disabled'})
    const eyebrow=page.locator('[data-layout-node="7"]')
    await eyebrow.scrollIntoViewIfNeeded()
    const box=await eyebrow.boundingBox()
    await eyebrow.evaluate(element=>{element.style.visibility='hidden'})
    const background=await page.screenshot({clip:{x:box.x,y:box.y,width:box.width,height:box.height},animations:'disabled'})
    data.presentation.heroEyebrowContrast=await page.evaluate(async base64=>{
      const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode()
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
      const context=canvas.getContext('2d');context.drawImage(image,0,0)
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data
      let highest=0
      for(let i=0;i<pixels.length;i+=4){
        const value=[pixels[i],pixels[i+1],pixels[i+2]].map(channel=>{const s=channel/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2})
        highest=Math.max(highest,.2126*value[0]+.7152*value[1]+.0722*value[2])
      }
      return {minimumWhiteTextContrast:Number((1.05/(highest+.05)).toFixed(2)),sampleWidth:canvas.width,sampleHeight:canvas.height}
    },background.toString('base64'))
    await eyebrow.evaluate(element=>{element.style.visibility=''})
    await page.locator('.lux-menu summary').click()
    await page.locator('.lux-menu nav').screenshot({path:path.join(output,'mobile-drawer-open-390-r1_2.png'),animations:'disabled'})
  }
  if(width===768){
    const project=await page.evaluate(()=>{const rect=document.querySelector('[data-layout-node="165"]').getBoundingClientRect();return {top:rect.top+scrollY,height:rect.height}})
    await page.screenshot({path:path.join(output,'projects-768-r1_2.png'),fullPage:true,clip:{x:0,y:project.top,width,height:project.height},animations:'disabled'})
  }
  results.push(data)
  await page.close()
}
const representative=['/cooling-tower/','/cooling-tower-parts-online/','/product/addax-drive-shaft-composite-coupling-lra350-275/','/category/blog/','/2026-cooling-tower-cost-guide-pricing-roi-insights/','/contact-us/']
const smoke=[]
for(const route of representative){
  const page=await browser.newPage({viewport:{width:1024,height:900}})
  const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000})
  smoke.push({route,status:response?.status(),header:await page.locator('.lux-header').count(),footer:await page.locator('.lux-footer').count(),horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),rfqPage:route==='/contact-us/'?await page.locator('.client-rfq .rfq').count():undefined})
  await page.close()
}
const formChecks=[]
for(const [route,width,trigger] of [['/',1440,'.lux-header-rfq .rfq a'],['/',390,'.lux-menu-rfq .rfq a'],['/contact-us/',390,'.client-rfq .rfq a']]){
  const page=await browser.newPage({viewport:{width,height:900}})
  await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000})
  if(width===390&&route==='/')await page.locator('.lux-menu summary').click()
  await page.locator(trigger).first().click()
  await page.locator('[role="dialog"] iframe').waitFor({state:'attached',timeout:10000})
  formChecks.push({route,width,trigger,dialog:await page.locator('[role="dialog"]').count(),iframe:await page.locator('[role="dialog"] iframe').count(),iframeSrc:await page.locator('[role="dialog"] iframe').getAttribute('src'),submitted:false})
  await page.keyboard.press('Escape')
  await page.close()
}
writeFileSync(path.resolve('review/browser-qa.json'),JSON.stringify({results,smoke,formChecks},null,2)+'\n')
await browser.close()
