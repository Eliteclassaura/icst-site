import {chromium} from 'playwright'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import path from 'node:path'
const content=path.resolve('apps/h2o/content/r41-articles')
const out=path.resolve('../r41-evidence/articles/responsive');mkdirSync(out,{recursive:true})
const manifest=JSON.parse(readFileSync(path.join(content,'manifest.json'),'utf8'))
const selected=new Set(['RT-0358','RT-0335','RT-0292','RT-0321'])
const browser=await chromium.launch({headless:true})
const report=[];const ledger=[]
for(const width of (process.env.WIDTHS??'1440,1024,768,390').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1})
  await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:3104'?r.continue():r.abort())
  const page=await context.newPage()
  for(const entry of manifest.filter(e=>!process.env.ONLY||e.routeId===process.env.ONLY)){
    const source=JSON.parse(readFileSync(path.join(content,entry.file),'utf8'))
    const requests=[];const errors=[]
    const listener=r=>{if(r.request().resourceType()==='image')requests.push({url:r.url(),status:r.status()})}
    page.on('response',listener)
    const response=await page.goto('http://127.0.0.1:3104'+entry.route,{waitUntil:'networkidle',timeout:60000})
    if(response.status()!==200) throw new Error(entry.route+' HTTP '+response.status())
    await page.locator('img').evaluateAll(async images=>{images.forEach(i=>i.loading='eager');await Promise.all(images.map(i=>i.decode().catch(()=>{})))})
    const data=await page.evaluate(()=>{
      const body=document.querySelector('[data-source-body]');const clone=body.cloneNode(true)
      const lede=document.querySelector('[data-source-lede]').cloneNode(true)
      clone.prepend(lede)
      clone.querySelectorAll('.chapter-number,.source-media-unavailable,[data-source-fallback]').forEach(n=>n.remove())
      const faqHeading=[...clone.querySelectorAll('h2,h3')].find(n=>/frequently asked|^faqs?\b/i.test(n.textContent.trim()))
      let faq=0;if(faqHeading){let n=faqHeading.nextElementSibling;while(n){if((/^H[3-6]$/.test(n.tagName)||n.tagName==='P')&&/^(?:\d+[.)]\s*)?(what|who|how|why|when|where|which|can|does|do|is|are|should|will)\b/i.test(n.textContent.trim())&&/\?/.test(n.textContent))faq++;n=n.nextElementSibling}}
      const headings=[...body.querySelectorAll('h2')].map(n=>n.textContent.trim())
      const toc=[...document.querySelectorAll('.article-index--desktop a')].map(a=>a.lastChild.textContent)
      const text=clone.textContent.replace(/\s+/g,' ').trim()
      const box=document.querySelector('.article-rail').getBoundingClientRect()
      return {title:document.querySelector('h1').textContent,byline:document.querySelector('[data-source-byline]').textContent,headings,toc,text,stats:{h2:clone.querySelectorAll('h2').length,h3:clone.querySelectorAll('h3').length,paragraph:clone.querySelectorAll('p').length,list:clone.querySelectorAll('ul,ol').length,table:clone.querySelectorAll('table').length,faq,media:clone.querySelectorAll('img').length+document.querySelectorAll('[data-source-featured] img').length,textLength:text.length},overflow:document.documentElement.scrollWidth>innerWidth+1,rail:{left:box.left,right:box.right,width:box.width},mobileTocClosed:!document.querySelector('.article-index--mobile').open,images:[...document.images].map(i=>({src:i.getAttribute('src'),complete:i.complete,naturalWidth:i.naturalWidth,width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height})),blockedMedia:body.querySelectorAll('.source-media-unavailable').length}
    })
    if(data.text!==source.text)errors.push('source text mismatch')
    if(data.title!==source.title)errors.push('source title mismatch')
    if(data.byline!==`${source.author} · ${source.date}`)errors.push('source metadata mismatch')
    for(const key of ['h2','h3','paragraph','list','table','faq'])if(data.stats[key]!==source.stats[key])errors.push(key+' count mismatch')
    if(JSON.stringify(data.headings)!==JSON.stringify(source.headings))errors.push('heading sequence mismatch')
    if(JSON.stringify(data.toc)!==JSON.stringify(source.headings))errors.push('TOC mismatch')
    if(data.overflow||data.rail.left<0||data.rail.right>width+1)errors.push('overflow/clipped rail')
    if(!data.mobileTocClosed)errors.push('mobile TOC default open')
    if(data.images.some(i=>!i.complete||i.naturalWidth===0))errors.push('broken image')
    if(data.images.some(i=>i.src.startsWith('/media/r41')&&(i.width>i.naturalWidth+1||i.width<=0||i.height<=0)))errors.push('image size violation')
    if(requests.some(r=>![200,304].includes(r.status)))errors.push('image HTTP error')
    const folder=path.join(out,String(width));mkdirSync(folder,{recursive:true})
    if(selected.has(entry.routeId)){
      await page.screenshot({path:path.join(folder,entry.routeId+'.png'),fullPage:true})
      await page.screenshot({path:path.join(folder,entry.routeId+'-opening.png')})
    }
    if(entry.routeId==='RT-0358'){
      for(const [selector,name]of [['.source-masthead','title-hero'],[width<=900?'.article-index--mobile':'.article-index--desktop','toc'],['.article-rail','related'],['.source-close','rfq'],...Array.from({length:7},(_,i)=>['#article-section-'+(i+1),['step-1','step-2','step-3','step-4','step-5','final-thoughts','faq'][i]])]){
        await page.locator(selector).screenshot({path:path.join(folder,'performance-'+name+'.png')})
      }
    }
    if(width<=900){const details=page.locator('.article-index--mobile');await details.locator('summary').focus();await page.keyboard.press('Enter');if(!await details.evaluate(d=>d.open))errors.push('TOC keyboard failed');if(entry.routeId==='RT-0358')await details.screenshot({path:path.join(folder,'performance-toc-open.png')})}
    const status=errors.length?'PARITY_FAIL_STRUCTURE':data.blockedMedia?'PARITY_BLOCKED_SOURCE':data.stats.media!==source.stats.media?'PARITY_FAIL_MEDIA':'PARITY_PASS'
    report.push({route:entry.route,routeId:entry.routeId,width,status,errors,source:source.stats,...data,requests})
    if(width===1440)ledger.push([entry.route,source.sourceUrl,source.title,source.author,source.date,...['h2','h3','paragraph','list','table','faq','media','textLength'].flatMap(k=>[source.stats[k],data.stats[k]]),status,errors.join('; ')||(data.blockedMedia?'Two published Google-hosted images return HTTP 403; text and structure match':'')])
    console.log(width,entry.routeId,status,errors.join('; '))
    page.off('response',listener)
  }
  await context.close()
}
await browser.close()
const reportFile=path.join(out,'report.json')
const combined=process.env.ONLY && existsSync(reportFile)?[...JSON.parse(readFileSync(reportFile,'utf8')).filter(old=>!report.some(r=>r.routeId===old.routeId&&r.width===old.width)),...report]:report
writeFileSync(reportFile,JSON.stringify(combined,null,2)+'\n')
const headers=['route','source_url','title','source_author','source_date',...['h2','h3','paragraph','list','table','faq','media','text_length'].flatMap(k=>['source_'+k+'_count','candidate_'+k+'_count']),'parity_result','discrepancy_reason']
const ledgerFile=path.resolve('../r41-evidence/R4_1_ARTICLE_CONTENT_PARITY.tsv')
const prior=process.env.ONLY&&existsSync(ledgerFile)?readFileSync(ledgerFile,'utf8').trim().split('\n').slice(1).map(l=>l.split('\t')).filter(old=>!ledger.some(r=>r[0]===old[0])):[]
writeFileSync(ledgerFile,[headers,...prior,...ledger].map(r=>r.map(v=>String(v).replace(/[\t\r\n]/g,' ')).join('\t')).join('\n')+'\n')
