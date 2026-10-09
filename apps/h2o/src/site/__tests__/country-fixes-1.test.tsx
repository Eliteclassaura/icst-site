/**
 * COUNTRY-FIXES-1 (DD country-page review, CT 2026-10-09): M1 the literal "(remove)" text on the Thailand page, M2 the Thailand call link, M4 the Japan
 * page's restored FAQ section with its FAQPage structured data.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {pageFaq,pageFaqJsonLd} from '../page-faq'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))

describe('COUNTRY-FIXES-1',()=>{
  it('M1 + M2: the Thailand page shows no "(remove)" text and every Thailand call link is tel:+6626617723',async()=>{
    const html=await render('/cooling-tower-thailand/')
    expect(html).not.toContain('(remove)')
    const tels=[...html.matchAll(/href="(tel:[^"]*)"/g)].map(m=>m[1])
    expect(tels).toContain('tel:+6626617723')
    expect(tels.filter(t=>/\+66/.test(t)&&t!=='tel:+6626617723'),'never the +66 2- grouping').toEqual([])
    expect(html).not.toContain('260-6598')
    expect(html).toContain('Call +662-661-7723')
  })
  it('M4: the Japan page restores the live page\'s five questions and answers as native disclosure controls, after the page sections',async()=>{
    const faq=pageFaq('/cooling-tower-japan/')!
    expect(faq.items).toHaveLength(5)
    const html=await render('/cooling-tower-japan/')
    const section=/<section class="dr4-section page-faq"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1]??''
    expect(section).toContain('Frequently Asked Questions')
    const details=[...section.matchAll(/<details><summary>([^<]*)<\/summary><p>([^<]*)<\/p><\/details>/g)]
    expect(details).toHaveLength(5)
    expect(details.map(d=>d[1])).toEqual(faq.items.map(i=>i.q.replace(/&/g,'&amp;')))
    expect(html.indexOf('class="dr4-section page-faq"')).toBeGreaterThan(html.lastIndexOf('data-salmon-section=')) // after the page sections
    expect(section).not.toMatch(/HVAC|commercial building/i)
    // the same questions as the live page record
    const live=JSON.parse(readFileSync(path.join(APP,'content/salmon/documents/SALMON-LIVE-pages-2294.json'),'utf8')) as {text:string}
    for(const i of faq.items)expect(live.text.replace(/\s+/g,' '),i.q).toContain(i.q)
  })
  it('M4: the FAQPage structured data lists the same five questions, valid JSON in the head; other pages have none',async()=>{
    const html=await render('/cooling-tower-japan/')
    const m=/<script data-page-faq="" type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
    expect(m).not.toBeNull()
    const ld=JSON.parse(m![1]!) as {'@type':string;mainEntity:Array<{name:string;acceptedAnswer:{text:string}}>}
    expect(ld['@type']).toBe('FAQPage')
    expect(ld.mainEntity.map(q=>q.name)).toEqual(pageFaq('/cooling-tower-japan/')!.items.map(i=>i.q))
    expect(ld).toEqual(pageFaqJsonLd('/cooling-tower-japan/'))
    expect(await render('/cooling-tower-thailand/')).not.toContain('data-page-faq')
  })
  it('M4 R2 (OGCS): the five Japan answers are the approved wording, and the FAQPage structured data carries the same answers',async()=>{
    const APPROVED=[
      'Timelines depend on the size of the tower, the scope of work and site access. Send us your project details and we will discuss the schedule with your quote.',
      'Yes. ICS works on both open-circuit and closed-circuit systems, depending on the facility\u2019s process requirements.',
      'Each project is designed to the project specification and to the seismic and building code requirements that apply at the site. Send us your specification and we will confirm the standards for your project.',
      'Yes. We supply cooling tower parts including fill media, drift eliminators and fan components for existing towers, including towers we did not install. Send us the tower details or part numbers and we will confirm what we can supply.',
      'Yes. Contact our Japan team with the details of the problem and we will advise on the repair options.',
    ]
    expect(pageFaq('/cooling-tower-japan/')!.items.map(i=>i.a)).toEqual(APPROVED)
    const html=await render('/cooling-tower-japan/')
    const ld=JSON.parse(/<script data-page-faq="" type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!) as {mainEntity:Array<{acceptedAnswer:{text:string}}>}
    expect(ld.mainEntity.map(q=>q.acceptedAnswer.text)).toEqual(APPROVED)
    const section=/<section class="dr4-section page-faq"[^>]*>([\s\S]*?)<\/section>/.exec(html)![1]!
    expect([...section.matchAll(/<p>([^<]*)<\/p>/g)].map(m=>m[1])).toEqual(APPROVED)
    expect(JSON.stringify(ld)+section).not.toMatch(/Japan Cooling Tower Institute|weeks to several months|most major manufacturers/i)
  })
  it('F6: the Japan and Malaysia photos carry factual alt text (subject only, no place claims, no HVAC); the empty alt is gone from their photos',async()=>{
    for(const p of ['/cooling-tower-japan/','/cooling-tower-malaysia/']){
      const html=await render(p)
      const big=[...html.matchAll(/<img\b[^>]*>/g)].map(m=>m[0]).filter(i=>/data-source-kind="img"/.test(i)) // the page's own body photos in the R5b location template (the footer badges are decorative)
      expect(big.length,p).toBeGreaterThanOrEqual(p.includes('japan')?1:2)
      for(const i of big){const alt=/alt="([^"]*)"/.exec(i)?.[1]??'';expect(alt.length,`${p}: ${i.slice(0,120)}`).toBeGreaterThan(10);expect(alt).toMatch(/^(?:Large |Steel-framed )?(?:[Ii]ndustrial|Row of industrial)/);expect(alt).not.toMatch(/HVAC|Japan|Malaysia|Singapore|Thailand|world-class/i)}
    }
  })
})
