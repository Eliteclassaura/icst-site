import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const root = process.cwd()
const app = path.join(root, 'apps/h2o')
const evidence = path.resolve(root, '../r41-evidence/articles')
const content = path.join(app, 'content/r41-articles')
const media = path.join(app, 'public/media/r41-articles')
for (const p of [evidence, content, media]) mkdirSync(p, {recursive:true})
const hash = b => createHash('sha256').update(b).digest('hex')
const sharp = createRequire(path.join(app,'package.json'))('sharp')
const [header,...lines] = readFileSync(path.join(app,'content/2d-launch-cohort/PAGE_CONTENT_INDEX.tsv'),'utf8').trim().split('\n')
const keys = header.split('\t')
const rows = lines.map(l=>Object.fromEntries(l.split('\t').map((v,i)=>[keys[i],v]))).filter(r=>r.route_class==='EDITORIAL')
const browser = await chromium.launch({headless:true})
const page = await browser.newPage()
await page.route('**/*', route=>route.abort())
const manifest=[]
const mediaLedger=[]
for (const row of rows) {
  const sourceUrl='https://h2ocooling.com'+row.canonical_path
  const snapshot=path.join(evidence,row.route_id+'.html')
  if (!existsSync(snapshot)) execFileSync('curl',['-sSL','--fail','--max-time','45',sourceUrl,'-o',snapshot])
  const html=readFileSync(snapshot,'utf8')
  await page.setContent(html,{waitUntil:'domcontentloaded'})
  const source=await page.evaluate(()=>{
    const body=document.querySelector('.elementor-widget-theme-post-content .elementor-widget-container') ?? document.querySelector('.entry-content')
    if(!body) throw new Error('No unique article body found')
    body.querySelectorAll('#ez-toc-container,.ez-toc-section,.ez-toc-section-end,script,style,noscript').forEach(n=>n.remove())
    const title=document.querySelector('h1')?.textContent?.trim()
    const author=document.querySelector('.elementor-post-info__item--type-author')?.textContent?.trim() ?? ''
    const date=document.querySelector('.elementor-post-info__item--type-date')?.textContent?.trim() ?? ''
    const featured=document.querySelector('.elementor-widget-theme-post-featured-image img')
    const toTree=n=>{
      if(n.nodeType===Node.TEXT_NODE) return n.textContent
      if(n.nodeType!==Node.ELEMENT_NODE) return null
      const tag=n.tagName.toLowerCase()
      if(['script','style','iframe','form','input','button','svg','noscript'].includes(tag)) throw new Error('Unsupported article element '+tag)
      const children=[...n.childNodes].map(toTree).filter(n=>n!==null)
      const attrs={}
      if(tag==='a')attrs.href=n.getAttribute('href')??''
      if(tag==='img') {attrs.src=n.getAttribute('data-src')||n.getAttribute('src');attrs.alt=n.getAttribute('alt')??''}
      if(['td','th'].includes(tag)) for(const a of ['colspan','rowspan']) if(n.hasAttribute(a))attrs[a]=n.getAttribute(a)
      if(tag==='ol' && n.hasAttribute('start'))attrs.start=n.getAttribute('start')
      return {tag,attrs,children}
    }
    const children=[...body.childNodes].map(toTree).filter(n=>n!==null)
    const faqHeading=[...body.querySelectorAll('h2,h3')].find(n=>/frequently asked|^faqs?\b/i.test(n.textContent.trim()))
    let faqCount=0
    if(faqHeading) {let n=faqHeading.nextElementSibling;while(n){if((/^H[3-6]$/.test(n.tagName)||n.tagName==='P')&&/^(?:\d+[.)]\s*)?(what|who|how|why|when|where|which|can|does|do|is|are|should|will)\b/i.test(n.textContent.trim())&&/\?/.test(n.textContent))faqCount++;n=n.nextElementSibling}}
    return {title,author,date,children,featured:featured?toTree(featured):null,headings:[...body.querySelectorAll('h2')].map(n=>n.textContent.trim()),stats:{h2:body.querySelectorAll('h2').length,h3:body.querySelectorAll('h3').length,paragraph:body.querySelectorAll('p').length,list:body.querySelectorAll('ul,ol').length,table:body.querySelectorAll('table').length,faq:faqCount,media:body.querySelectorAll('img').length+(featured?1:0),textLength:body.textContent.replace(/\s+/g,' ').trim().length},text:body.textContent.replace(/\s+/g,' ').trim()}
  })
  let count=0
  const localize=async n=>{
    if(typeof n==='string')return
    if(n.tag==='img') {
      const url=new URL(n.attrs.src,sourceUrl)
      if(!['h2ocooling.com','www.h2ocooling.com','lh7-rt.googleusercontent.com'].includes(url.hostname))throw new Error('Unexpected media host '+url.hostname)
      const suffix=path.extname(url.pathname).toLowerCase()
      const ext=['.png','.jpg','.jpeg','.webp','.gif'].includes(suffix)?suffix:'.png'
      const name=row.route_id+'-'+(++count)+ext
      const original=path.join(evidence,name)
      try {
        if(process.env.SKIP_NETWORK && !existsSync(original))throw new Error('Unrecovered source retained as blocked')
        if(!existsSync(original))execFileSync('curl',['-sSL','--fail','--max-time','45',url.href,'-o',original])
      } catch {
        n.attrs={...n.attrs,sourceUrl:url.href,src:'',blocked:'Published source image could not be recovered'}
        mediaLedger.push({route:row.canonical_path,source:url.href,status:'PARITY_BLOCKED_SOURCE'})
        return
      }
      const bytes=readFileSync(original)
      const dimensions=await sharp(bytes).metadata()
      copyFileSync(original,path.join(media,name))
      mediaLedger.push({route:row.canonical_path,source:url.href,original:name,sha256:hash(bytes),width:dimensions.width,height:dimensions.height,transformation:'NONE; exact published binary',bytes:bytes.length})
      n.attrs={...n.attrs,sourceUrl:url.href,src:'/media/r41-articles/'+name,width:dimensions.width,height:dimensions.height}
    }
    for(const c of n.children)await localize(c)
  }
  if(source.featured) await localize(source.featured)
  for(const n of source.children)await localize(n)
  const doc={routeId:row.route_id,route:row.canonical_path,sourceUrl,sourceSha256:hash(html),fetchedAt:new Date().toISOString(),...source}
  const json=JSON.stringify(doc,null,2)+'\n'
  writeFileSync(path.join(content,row.route_id+'.json'),json)
  manifest.push({routeId:row.route_id,route:row.canonical_path,sourceUrl,file:row.route_id+'.json',sha256:hash(json)})
  console.log(row.route_id,source.stats,source.title)
}
await browser.close()
writeFileSync(path.join(content,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
writeFileSync(path.join(evidence,'source-media.json'),JSON.stringify(mediaLedger,null,2)+'\n')
