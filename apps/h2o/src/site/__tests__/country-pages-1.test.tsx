/**
 * COUNTRY-PAGES-1 (owner priority via CT 2026-10-09; DD country-pages review): the five country pages are one family. Japan, Malaysia and
 * Thailand (/cooling-tower-thailand/) take the location template (photo hero, filled CTA) the Singapore and US pages use; the template's
 * content width is the R4 container's (M6); promoted card titles are H3 (M3); a restored "Featured project" is a normal section before the
 * closing call to action (M5); no "Back to resources" on a country page (F3). Wording, phone numbers and links are unchanged.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonDocument,salmonRoutes} from '../salmon'
import {R5bLocationPage,r5bLocationHeroes} from '../r5b/R5bLocation'
import {applyRestoredSections} from '../../content/restored-sections'

const APP=process.cwd()
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
const COUNTRY=['/cooling-tower-japan/','/cooling-tower-malaysia/','/cooling-tower-thailand/','/cooling-tower-construction-repair-in-singapore/','/cooling-tower-construction-repair-in-united-states/']
const css=(file:string)=>readFileSync(path.join(APP,'src/app/(site)',file),'utf8')

describe('COUNTRY-PAGES-1',()=>{
  it('every country page uses the location template: photo hero, one H1, filled white quote button, no "Back to resources" (F1, F3)',async()=>{
    for(const p of COUNTRY){
      expect(r5bLocationHeroes[p],p).toBeTruthy()
      const html=await render(p)
      expect(html,p).toContain('class="dr4-hero dr4-hero--photo"')
      expect(html.match(/<h1\b/g)?.length,p).toBe(1)
      expect(html,p).toContain('dr4-btn dr4-btn--white')
      expect(html,p).not.toContain('Back to resources')
      expect(html,p).not.toContain('r5b-back')
    }
  },300000)
  it('the Japan, Malaysia and Thailand pages keep their own text in source order (headings and links unchanged)',async()=>{
    const japan=await render('/cooling-tower-japan/')
    for(const t of ['Cooling Tower Japan','Industrial Applications of Cooling Towers in Japan','How We Build a Cooling Tower in Japan','Get Your Cooling Tower Project Started in Japan'])expect(japan,t).toContain(t)
    const thailand=await render('/cooling-tower-thailand/')
    for(const t of ['Why Location Matters for Your Cooling Tower Project','End-to-End Cooling Tower Project Process','Get Cooling Tower Support From Our Bangkok Team'])expect(thailand,t).toContain(t)
    expect(thailand).not.toMatch(/\+66\s*2-661-7723\b.*tel:\+66%202/)
  },300000)
  it('M6: the template main takes the R4 container width (no extra article inset) and the header/footer stay full width',()=>{
    const sheet=css('design-r5b.css')
    expect(sheet).toMatch(/\.figma-wave4 \.dr4 main\.r5b-location-main \{\s*inline-size: 100%;/)
    const wave4=readFileSync(path.join(APP,'src/app/(site)/figma-wave4.css'),'utf8')
    expect(wave4).toContain('.figma-wave4 main.wave4-detail{width:min(1188px,calc(100% - 80px))}') // the article rule the template main must out-rank
    expect(css('design-r4.css')).toMatch(/\.dr4 \{[^}]*max-inline-size: 1308px;[^}]*padding-inline: clamp\(16px, 3vw, 24px\)/)
  })
  it('M3: Malaysia card titles are H3 card titles that never break a word (same words as the source H2s)',async()=>{
    const html=await render('/cooling-tower-malaysia/')
    for(const t of ['Proven Industrial Expertise','First-Class Service Standards','OEM Capabilities','Built for Longevity']){
      expect(html,t).toMatch(new RegExp(`<h3 class="dr4-card-title">\\s*[^<]*${t}`))
      expect(html,t).not.toMatch(new RegExp(`<h2[^>]*>\\s*[^<]*${t}`))
    }
    expect(css('design-r5b.css')).toMatch(/\.dr4 \.dr4-card-title \{\s*hyphens: manual;\s*overflow-wrap: normal;/)
  },300000)
  it('M5: the restored Petronas RAPID featured project is a template section before the closing call to action',()=>{
    const groups=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/restored-sections.json'),'utf8'))['/cooling-tower-malaysia/'].groups
    const doc=applyRestoredSections(salmonDocument(salmonRoutes().find(r=>r.targetPath==='/cooling-tower-malaysia/')!) as never,groups) as never
    const html=renderToStaticMarkup(<R5bLocationPage doc={doc}/>)
    const featured=html.indexOf('r5b-featured'),closing=html.indexOf('r5b-closing')
    expect(featured).toBeGreaterThan(0)
    expect(closing).toBeGreaterThan(featured)
    const section=html.slice(featured,closing)
    expect(section).toContain('Featured Project: Petronas RAPID Cooling Tower Installation')
    expect(section).toMatch(/<h2[^>]*>[^<]*Featured Project/)
    expect(section).toContain('Key Highlights of the Project:')
    for(const t of ['Custom-Designed Cooling Towers','Built to Last','Low-Noise, Efficient Design'])expect(section,t).toMatch(new RegExp(`<h3 class="dr4-card-title">[^<]*${t}`))
    expect(section).toContain('href="/all-projects/pertonas-rapid/"')
    expect(html.indexOf('Featured Project')).toBe(html.lastIndexOf('Featured Project')) // once
  })
})
