import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {EnglishServicePage,englishServicePages} from '../EnglishServices'
import {LuxuryCanonical} from '../LuxuryCanonical'
import {SalmonCanonical} from '../SalmonCanonical'
import {Wave4Library} from '../Wave4Presentation'
import {salmonDocument,salmonRoutes} from '../salmon'

const documentFor=(id:string)=>salmonDocument(salmonRoutes().find(route=>route.routeId===id)!)

describe('English completion release boundary',()=>{
  it('publishes six dedicated Figma-intent service destinations with unique H1s and complete buyer journeys',()=>{
    const services=englishServicePages()
    expect(services).toHaveLength(6)
    expect(new Set(services.map(service=>service.path)).size).toBe(6)
    for(const service of services){
      const html=renderToStaticMarkup(<EnglishServicePage service={service}/>)
      expect(html).toContain(`data-english-service="${service.id}"`)
      expect(html).toContain(`data-figma-node="${service.figmaNode}"`)
      expect((html.match(/<h1\b/g)??[])).toHaveLength(1)
      expect(html).toContain(service.title)
      expect((html.match(/class="english-service-scope-grid"/g)??[])).toHaveLength(1)
      expect((html.match(/class="english-service-faq\b/g)??[])).toHaveLength(1)
      expect(html).toContain('href="/contact-us/"')
      expect(html).not.toContain('<form')
      expect(html).toContain('salmon-parity-footer')
      expect(html).toContain('data-source-sha256')
    }
  })
  it('gives all six maintenance cards exact, non-self service destinations',()=>{
    const html=renderToStaticMarkup(<LuxuryCanonical doc={documentFor('SALMON-pages-1446')}/>)
    for(const service of englishServicePages())expect(html).toContain(`href="${service.path}"`)
    expect((html.match(/>View More <span aria-hidden="true">↗<\/span><\/a>/g)??[])).toHaveLength(6)
    expect(html).not.toContain('href="/cooling-tower-maintenance-repair-upgrade/">View More')
  })
  it('keeps all thirteen Resources documents and gives the three approved library pathways',()=>{
    const html=renderToStaticMarkup(<Wave4Library doc={documentFor('SALMON-pages-1761')}/>)
    expect(html).toContain('wave4-photo-hero')
    expect(html).toContain('RESOURCE LIBRARY / 13 source-listed documents')
    for(const href of ['/cooling-tower-brochures/','/cooling-tower-resources/tools/','/tech-articles/'])expect(html).toContain(`href="${href}"`)
    expect((html.match(/class="wave4-document(?: wave4-document-flat)?"/g)??[])).toHaveLength(13)
  })
  it('uses Contact variant A Start Here without adding a native form or stale phone',()=>{
    const beforeId=process.env.H2O_TYPEFORM_FORM_ID,beforeOrigin=process.env.H2O_TYPEFORM_ORIGIN
    process.env.H2O_TYPEFORM_FORM_ID='F22cAgx3';process.env.H2O_TYPEFORM_ORIGIN='https://form.typeform.com'
    try{
      const html=renderToStaticMarkup(<SalmonCanonical doc={documentFor('SALMON-pages-1891')}/>)
      expect(html).toContain('Start Here')
      expect(html).toContain('https://form.typeform.com/to/F22cAgx3')
      expect(html).toContain('figma-contact-hero-photo')
      expect(html).not.toContain('+66-2-260-6598')
      expect(html).not.toContain('<form')
    }finally{
      if(beforeId===undefined)delete process.env.H2O_TYPEFORM_FORM_ID;else process.env.H2O_TYPEFORM_FORM_ID=beforeId
      if(beforeOrigin===undefined)delete process.env.H2O_TYPEFORM_ORIGIN;else process.env.H2O_TYPEFORM_ORIGIN=beforeOrigin
    }
  })
  it('never serves the BEE HTML response as a public PDF',()=>{
    const invalid='311bdf0bf6ce45b6f8a2130ca6f91c5c05ee471174071731304b4ed309b1ca60.pdf'
    expect(existsSync(path.join(process.cwd(),'public/media/salmon',invalid))).toBe(false)
    const media=JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon/media-identities.json'),'utf8')) as Array<{url:string;state:string;file?:string}>
    expect(media.find(row=>row.url==='https://beeindia.gov.in/sites/default/files/3Ch7.pdf')).toMatchObject({state:'SOURCE_UNAVAILABLE'})
  })
  it('keeps the 183-product release cohort and gives every new service an indexable canonical route',()=>{
    const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeClass:string;indexable:boolean;sitemap:boolean;canonical:string}>}
    expect(ledger.routes.filter(route=>route.routeClass==='product'&&route.indexable)).toHaveLength(183)
    for(const service of englishServicePages())expect(ledger.routes.find(route=>route.path===service.path)).toMatchObject({routeClass:'service',indexable:true,sitemap:true,canonical:'https://h2ocooling.com'+service.path})
  })
})
