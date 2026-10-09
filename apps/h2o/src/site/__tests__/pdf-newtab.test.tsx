/**
 * PDF-NEWTAB (owner, 2026-10-08): every link to a PDF opens in a new tab with rel="noopener noreferrer", set at the shared link-render layer
 * (src/site/link-attrs.ts) so new products and articles inherit it. Non-PDF links are unchanged.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {isPdfHref,pdfLinkProps} from '../link-attrs'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const ledger=JSON.parse(readFileSync(path.join(APP,'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean}>}
const pub=ledger.routes.filter(r=>r.state==='PUBLIC'&&r.export)
const anchors=(html:string)=>[...html.matchAll(/<a\b[^>]*>/g)].map(m=>m[0])
const hrefOf=(a:string)=>/\shref="([^"]*)"/.exec(a)?.[1]??''
const SAMPLES=[
  '/resources/','/cooling-tower-brochures/',
  ...pub.filter(r=>/^SALMON-product-49(0\d|10)$/.test(r.routeId)).map(r=>r.path),
  ...pub.filter(r=>/^\/product\/(?!tuf-lite)/.test(r.path)).slice(0,6).map(r=>r.path),
  ...pub.filter(r=>r.routeId.startsWith('SALMON-posts-')||/^\/tech-articles\/[^/]+\/$/.test(r.path)).slice(0,8).map(r=>r.path),
]

describe('PDF-NEWTAB',()=>{
  it('the helper recognises PDF hrefs only',()=>{
    for(const h of ['/wp-content/uploads/2021/11/A.pdf','https://files.example.com/x/y.PDF','/a.pdf?v=1','/a.pdf#page=2'])expect(isPdfHref(h),h).toBe(true)
    for(const h of ['/contact-us/','/pdf-guide/','/a.pdfx','https://example.com/doc','',undefined,null])expect(isPdfHref(h),String(h)).toBe(false)
    expect(pdfLinkProps('/a.pdf')).toEqual({target:'_blank',rel:'noopener noreferrer'})
    expect(pdfLinkProps('/a/')).toEqual({})
  })
  it('every rendered PDF link on the resources page, the brochures, product pages and articles has target=_blank and rel=noopener noreferrer; other links are not given a target',async()=>{
    let pdfLinks=0,nonPdf=0
    for(const p of new Set(SAMPLES)){
      const html=await render(p)
      for(const a of anchors(html)){
        const href=hrefOf(a)
        if(isPdfHref(href)){
          pdfLinks++
          expect(a,`${p}: ${href}`).toMatch(/\starget="_blank"/)
          expect(a,`${p}: ${href}`).toMatch(/\srel="[^"]*noopener[^"]*noreferrer[^"]*"/)
        }else if(href.startsWith('/')&&!/\.[a-z0-9]{2,4}(?:[?#]|$)/i.test(href)){
          nonPdf++
          expect(a,`${p}: ${href}`).not.toMatch(/\sdata-pdf-newtab/)
        }
      }
    }
    expect(pdfLinks).toBeGreaterThan(20)
    expect(nonPdf).toBeGreaterThan(100)
  },300000)
  it('internal navigation links keep their same-tab behaviour (no target on /contact-us/ or product links)',async()=>{
    const html=await render('/resources/')
    const nav=anchors(html).filter(a=>/href="\/(contact-us|cooling-tower-brochures)\/"/.test(a))
    expect(nav.length).toBeGreaterThan(0)
    for(const a of nav)expect(a).not.toMatch(/target="_blank"/)
  })
  it('the TUF-LITE IV family page (external manufacturer PDFs) and the /resources/ library PDFs open in a new tab',async()=>{
    for(const p of ['/product/tuf-lite-iv-fan-assemblies/','/resources/']){
      const pdfs=anchors(await render(p)).filter(a=>isPdfHref(hrefOf(a)))
      expect(pdfs.length,p).toBeGreaterThan(5)
      for(const a of pdfs){expect(a,`${p} ${hrefOf(a)}`).toMatch(/\starget="_blank"/);expect(a,`${p} ${hrefOf(a)}`).toMatch(/\srel="noopener noreferrer"/)}
    }
  },120000)
  it('site-wide: every .pdf href on every public page renders with target=_blank and rel=noopener noreferrer',async()=>{
    let pdfLinks=0,skipped=0
    for(const r of pub){
      let html:string
      try{html=await render(r.path)}catch(e){if(/NEXT_HTTP_ERROR_FALLBACK|NEXT_REDIRECT/.test(String(e))){skipped++;continue};throw e}
      for(const a of anchors(html)){
        const href=hrefOf(a)
        if(!isPdfHref(href))continue
        pdfLinks++
        expect(a,`${r.path}: ${href}`).toMatch(/\starget="_blank"/)
        expect(a,`${r.path}: ${href}`).toMatch(/\srel="noopener noreferrer"/)
      }
    }
    expect(pdfLinks).toBeGreaterThan(100)
    expect(skipped).toBeLessThan(pub.length/4)
  },1800000)
})
