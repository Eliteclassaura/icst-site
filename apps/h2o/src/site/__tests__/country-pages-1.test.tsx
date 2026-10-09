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

describe('COUNTRY-PAGES-1.1',()=>{
  it('F4: the Thailand, United States and Japan pages carry an office band with the contact authority\'s own address and number (tel link unchanged), none elsewhere',async()=>{
    const th=await render('/cooling-tower-thailand/')
    expect(th).toContain('Our Thailand office')
    for(const line of ['159 Serm-Mit Tower, 9th Floor','Sukhumvit 21, Asoke Road','North Klongtoey, Wattana','Bangkok 10110'])expect(th,line).toContain(line)
    expect(th).toContain('<a class="r5b-office-phone" href="tel:+6626617723">+662-661-7723</a>')
    const us=await render('/cooling-tower-construction-repair-in-united-states/')
    expect(us).toContain('Our U.S. office')
    for(const line of ['1457 Ammons Street, Suite 206','Lakewood, CO 80214'])expect(us,line).toContain(line)
    expect(us).toContain('href="tel:+13034622000">+1-303-462-2000</a>')
    const jp=await render('/cooling-tower-japan/')
    expect(jp).toContain('Call our Japan team')
    expect(jp).toContain('href="tel:+819042046742">+81-90-4204-6742</a>')
    for(const p of ['/cooling-tower-malaysia/','/cooling-tower-construction-repair-in-singapore/'])expect(await render(p),p).not.toContain('r5b-office')
  },300000)
  it('empty columns: no split row is left with a blank text column, and a lone last card takes the full row',async()=>{
    for(const p of COUNTRY){
      const html=await render(p)
      expect(html,p).not.toMatch(/<div class="dr4-split-text">\s*<\/div>/)
    }
    expect(css('design-r5b.css')).toMatch(/\.dr4 \.r5b-location-main \.dr4-cards--2 > \.dr4-card:last-child:nth-child\(odd\) \{\s*grid-column: 1 \/ -1;/)
    expect(css('design-r5b.css')).toMatch(/\.dr4 \.r5b-split-cards \.dr4-cards \{\s*grid-template-columns: 1fr;/)
  },300000)
  it('hero H1: a title longer than 55 characters takes the smaller size from 768 px; short titles keep the full size',async()=>{
    for(const p of ['/cooling-tower-malaysia/','/cooling-tower-thailand/','/cooling-tower-japan/'])expect(await render(p),p).toContain('class="dr4-hero-title dr4-hero-title--long"')
    for(const p of ['/cooling-tower-construction-repair-in-singapore/','/cooling-tower-construction-repair-in-united-states/'])expect(await render(p),p).toContain('class="dr4-hero-title"')
    expect(css('design-r5b.css')).toMatch(/@media \(width >= 768px\) \{\s*\.dr4 \.dr4-hero-title--long \{\s*font-size: clamp\(44px, 4\.4vw, 64px\);/)
    expect(css('design-r5b.css')).toMatch(/@media \(width < 768px\) \{\s*\.dr4 \.dr4-hero-title--long \{\s*font-size: clamp\(36px, 11vw, 44px\);/)
  },300000)
  it('Petronas block: the label line uses the small-label style and the closing paragraph keeps 32 px below the cards',()=>{
    const groups=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/restored-sections.json'),'utf8'))['/cooling-tower-malaysia/'].groups
    const doc=applyRestoredSections(salmonDocument(salmonRoutes().find(r=>r.targetPath==='/cooling-tower-malaysia/')!) as never,groups) as never
    const html=renderToStaticMarkup(<R5bLocationPage doc={doc}/>)
    expect(html).toMatch(/<p class="r5b-kicker">(?:<strong[^>]*>)?Key Highlights of the Project:/)
    expect(css('design-r5b.css')).toMatch(/\.dr4 \.r5b-featured \.dr4-cards \+ \.dr4-prose \{\s*margin-block-start: 32px;/)
  })
  it('mobile Projects list: "All Projects" is the bold landing row and the countries are regular',()=>{
    const sheet=css('english-completion.css')
    expect(sheet).toContain('.site-mobile-group-links>a[href="/all-projects/"]{font-weight:700}')
    expect(sheet).toContain('a:first-child:not([href="/all-projects/"]){font-weight:500}')
  })
})
