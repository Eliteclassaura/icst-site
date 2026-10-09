/**
 * LOCATION-FAQ-FIX-1 (owner, found on /cooling-tower-thailand/): the imported FAQ no longer shows four leftover "Download/View" buttons
 * (a widget label from the WordPress source) and renders as a proper FAQ list with ONE "Request a Quote"; no page shows a "Download/View"
 * control unless it links to a file.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readdirSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const text=(n:unknown):string=>typeof n==='string'?n:((n as {children?:unknown[]}).children??[]).map(text).join('')
/** The anchors whose visible text is exactly "Download/View": [href] per page path, from the imported documents. */
const downloadViewPages=():string[]=>{
  const dir=path.join(APP,'content/salmon/documents'),paths=new Set<string>()
  const walk=(n:unknown,page:string)=>{
    if(!n||typeof n==='string')return
    const node=n as {tag:string;children?:unknown[]}
    if(node.tag==='a'&&text(node).trim()==='Download/View')paths.add(page)
    for(const c of node.children??[])walk(c,page)
  }
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.json'))){
    const raw=readFileSync(path.join(dir,f),'utf8')
    if(!raw.includes('Download/View'))continue
    const doc=JSON.parse(raw) as {targetPath:string;children:unknown[]}
    for(const c of doc.children)walk(c,doc.targetPath)
  }
  return [...paths]
}

describe('LOCATION-FAQ-FIX-1',()=>{
  it('Thailand: no "Download/View" buttons, the FAQ is a list of native disclosures with one Request a Quote button',async()=>{
    const html=await render('/cooling-tower-thailand/')
    expect(html).not.toContain('Download/View')
    expect(html).not.toContain('data-rfq-source-control="Download/View"')
    const start=html.indexOf('r5b-faq-band'),band=html.slice(start,html.indexOf('</section>',start))
    expect(band).toContain('Frequently Asked Questions')
    expect(band.match(/<details>/g)?.length).toBe(5)
    for(const q of ['How much does a cooling tower cost in Thailand?','How long does a cooling tower project take?','Is regular maintenance required?','Can you support locations outside Bangkok?',"Do you supply parts for towers you didn't build?"])
      expect(band,q).toContain(`<summary>${q.replace("'",'&#x27;')}</summary>`)
    expect(band.match(/Request a Quote/g)?.length).toBe(1)
    expect(band).toContain('dr4-btn dr4-btn--white')
  },300000)
  it('the FAQ list styles: left-aligned, one 760 px column, bold 18 px questions, 17 px answers; band colours kept',()=>{
    const sheet=readFileSync(path.join(APP,'src/app/(site)/design-r5b.css'),'utf8')
    expect(sheet).toMatch(/\.dr4 \.page-faq-list \{[^}]*max-inline-size: 760px;[^}]*text-align: start;/)
    expect(sheet).toMatch(/\.dr4 \.page-faq-list summary \{[^}]*font-size: 18px;[^}]*font-weight: 600;/)
    expect(sheet).toMatch(/\.dr4 \.page-faq-list p \{[^}]*font-size: 17px;/)
  })
  it('sitewide: no public page renders a "Download/View" button or link unless it links to a file',async()=>{
    const pages=downloadViewPages()
    expect(pages.length).toBeGreaterThan(5)
    const FILE=/\.(?:pdf|docx?|xlsx?|pptx?|zip|csv)(?:[?#].*)?$/i
    for(const p of pages){
      let html:string
      try{html=await render(p)}catch{continue} // a held or redirected route renders nothing
      for(const m of html.matchAll(/<(a|button)\b([^>]*)>((?:(?!<\/\1>)[\s\S])*?)<\/\1>/g)){
        const label=m[3]!.replace(/<[^>]+>/g,'').trim()
        if(label!=='Download/View')continue
        const href=/href="([^"]*)"/.exec(m[2]!)?.[1]
        expect(href&&FILE.test(href),`${p}: "Download/View" must link to a file, not ${href}`).toBe(true)
      }
    }
  },600000)
})
