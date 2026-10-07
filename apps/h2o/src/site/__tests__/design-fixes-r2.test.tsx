/**
 * Design Fixes R2 (Control Tower 2026-10-05; design audit R1 #7, #14, #15, #25, #10). Presentation only: no wording changes
 * except the hero quote label, which is data (content/design/hero-actions.json).
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {heroActionFor} from '../hero-actions'

const APP=process.cwd()
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1';delete process.env.H2O_TYPEFORM_FORM_ID;delete process.env.H2O_TYPEFORM_ORIGIN})
afterEach(()=>{process.env={...env}})
const authority=JSON.parse(readFileSync(path.join(APP,'content/design/hero-actions.json'),'utf8')) as {routes:Record<string,{label:string;sourceLabel?:string}>}
const LEGACY:Record<string,string>={'/cooling-tower-replacement/':'Contact Us','/thermal-upgrade/':'Talk to a Cooling Tower Specialist','/cooling-tower-maintenance-repair-upgrade/':'Contact Us','/disaster-recovery/':'Request a Consultation','/air-coolers/':'Discuss Your Air Cooler Project'}
/** The hero stage of a wave2 service page. */
const heroOf=(html:string)=>{
  // Design R4 (CT GO 2026-10-07): the R4 pages carry the shared R4 hero; the same quote contract holds there.
  const r4=html.indexOf('<section class="dr4-hero ')
  if(r4>=0)return html.slice(r4,html.indexOf('</section>',r4))
  const start=html.indexOf('data-wave2-section="hero"');return html.slice(start,html.indexOf('data-wave2-section=',start+30))
}
const css=readFileSync(path.join(APP,'src/app/(site)/design-fixes.css'),'utf8')
const r2=css.slice(css.indexOf('Design Fixes R2'))

describe('#7 legacy service pages: the hero’s primary action is the quote action, its label data',()=>{
  it('the authority names the five legacy service pages and /cooling-tower/ (R2.1 adds the six crossflow-template pages), every label “Request a Quote”',()=>{
    for(const route of [...Object.keys(LEGACY),'/cooling-tower/'])expect(authority.routes,route).toHaveProperty([route])
    expect(Object.keys(authority.routes)).toHaveLength(12)
    for(const [route,action] of Object.entries(authority.routes)){expect(action.label,route).toBe('Request a Quote');expect(heroActionFor(route)).toEqual(action)}
    expect(heroActionFor('/cooling-tower-parts-online/')).toBeUndefined()
  })
  it('without a resolved RFQ configuration the hero carries the verified /contact-us/ fallback with the data label, once',async()=>{
    for(const [route,old] of Object.entries(LEGACY)){
      const hero=heroOf(await render(route))
      expect(hero.match(/data-hero-action="quote"/g),route).toHaveLength(1)
      expect(hero,route).toMatch(/data-hero-action="quote"[^>]*><a class="lux-button" href="\/contact-us\/" data-source-node="hero-primary">Request a Quote<\/a>/)
      expect(hero,route).not.toContain('>'+old+'<')
    }
  })
  it('with the approved configuration the hero mounts the existing RFQ adapter (editorial_inline, actual page path)',async()=>{
    process.env.H2O_TYPEFORM_FORM_ID='F22cAgx3';process.env.H2O_TYPEFORM_ORIGIN='https://form.typeform.com'
    for(const route of Object.keys(LEGACY)){
      const hero=heroOf(await render(route))
      expect(hero,route).toContain(`data-rfq-public-route="${route}" data-rfq-placement="editorial_inline"`)
      expect(hero,route).toContain('https://form.typeform.com/to/F22cAgx3')
      expect(hero,route).toContain('>Request a Quote<')
    }
  })
  it('/cooling-tower/: the source quote link becomes the quote action with the data label (A2 styling unchanged)',async()=>{
    const html=await render('/cooling-tower/')
    const block=html.slice(html.indexOf('elementor-element-708f65e3'),html.indexOf('elementor-element-708f65e3')+1500)
    expect(block).toContain('>Request a Quote<')
    expect(html.slice(html.indexOf('<main'))).not.toContain('>Request a New Cooling Tower Quote<')
  })
  it('the legacy buttons use the crossflow component: solid, 999px, no gradient, no shadow; radius tokens 42/26/20/28px',()=>{
    expect(r2).toMatch(/\.wave2-service \.wave2-stage \.lux-section \.lux-signal \{[^}]*border-radius: 999px !important;[^}]*background: var\(--df-blue\) !important;[^}]*box-shadow: none;/)
    expect(r2).toMatch(/\.wave2-stage--hero \.lux-section \{\s*border-radius: 42px;/)
    expect(r2).toMatch(/@media \(width <= 800px\) \{\s*\.wave2-service \.wave2-stage--hero \.lux-section \{\s*border-radius: 26px;/)
    expect(r2).toMatch(/\.wave2-media--circle, \.wave2-media--pill[^{]*\{\s*border-radius: 20px;/)
    for(const line of r2.split('\n').filter(l=>/^\s*(background|box-shadow)\s*:/.test(l)))expect(line,line).not.toMatch(/gradient|box-shadow: (?!none)/)
  })
})

describe('#14 /contact-us/',()=>{
  it('no grey strip, a full-height right-half photo panel (its transparent bands cropped), the lead on the navy half, Japan card to content',()=>{
    expect(r2).toMatch(/\.salmon-canonical\.figma-contact \{\s*background: var\(--df-white\);/)
    const panel=/@media \(width > 768px\) \{([^]*?)\n\}/.exec(r2)![1]!
    expect(panel).toMatch(/inset-inline: 50% 0;\s*inline-size: 50%;\s*block-size: 162\.36%;/)
    expect(panel).toMatch(/padding-inline-end: calc\(50% \+ 40px\);/)
    expect(r2).toMatch(/address\[data-office="japan"\] \{\s*align-self: start;\s*min-block-size: 0;/)
  })
  it('the photo crop matches the file (R2.1: source rows 350–1790 of 2338, above the date stamp at 1825–1885)',()=>{
    expect((2338/1440*100).toFixed(2)).toBe('162.36')
    expect((350/1440*100).toFixed(2)).toBe('24.31')
    expect(r2).toContain('inset-block: -24.31% auto;')
  })
  it('the page text is the OGCS copy (R2.1, page-copy data); the Japan office telephone unchanged',async()=>{
    const html=await render('/contact-us/')
    expect(html).toContain('Tell us what your tower is doing and what you need it to do.')
    // Design R3 (CT 2026-10-06, direct copy ruling): the Japan card reads "Japan" with the bare number, like the other cards;
    // its address holds the phone only
    expect(html).toMatch(/data-office="japan"><div class="dr3-office-title"><div><h3>Japan<\/h3>/)
    expect(html).toMatch(/<address data-office="japan"><a class="dr3-phone-pill" href="tel:\+819042046742">\+81-90-4204-6742<span aria-hidden="true">↗<\/span><\/a><\/address>/)
  })
})

describe('#15 crossflow template: four equal process steps',()=>{
  it('step 03 carries the same surface and colours as the other steps',()=>{
    const base=readFileSync(path.join(APP,'src/app/(site)/english-completion.css'),'utf8')
    expect(base).toContain('.english-service-process article{min-height:155px;padding:23px;border-radius:8px;background:#f2f6fa}')
    expect(base).toContain(".english-service-process article span{color:#0b55a5;")
    expect(css).toContain('--df-step: rgb(242 246 250);')
    expect(css).toContain('--df-step-number: rgb(11 85 165);')
    expect(r2).toMatch(/\.english-service-process article:nth-child\(3\) \{\s*background: var\(--df-step\);/)
    expect(r2).toMatch(/\.english-service-process article:nth-child\(3\) span \{\s*color: var\(--df-step-number\);/)
  })
})

describe('#25 RFQ dialog',()=>{
  it('translucent navy scrim; navy ghost close with an 18px glyph on a 44px target; the scrim button stays transparent',()=>{
    expect(r2).toContain('--df-dialog-scrim: rgb(7 24 48 / 72%);')
    expect(r2).toMatch(/:has\(> \[role="dialog"\]\[aria-modal="true"\]\) \{[^}]*background: var\(--df-dialog-scrim\) !important;/)
    expect(r2).toMatch(/> button\[tabindex="-1"\]:is\(:hover, :focus, :active\) \{\s*border: 0 !important;\s*background: transparent !important;/)
    expect(r2).toMatch(/> div:first-child > button \{[^}]*inline-size: 44px;\s*block-size: 44px;[^}]*background: transparent;\s*color: var\(--df-dialog-navy\);/)
    expect(r2).toMatch(/> span\[aria-hidden="true"\] \{\s*font-size: 18px;/)
  })
  it('the dialog markup those selectors address is unchanged (role, aria-modal, the bar’s close button, the tabindex -1 scrim)',()=>{
    const tsx=readFileSync(path.join(APP,'src/conversion/QuoteCta.tsx'),'utf8')
    expect(tsx).toMatch(/className=\{styles\.backdrop\}>[^]*?aria-label="Close"\s*className=\{styles\.scrim\}[^]*?tabIndex=\{-1\}/)
    expect(tsx).toMatch(/aria-modal="true"[^]*?role="dialog"[^]*?<div className=\{styles\.bar\}>[^]*?<button className=\{styles\.close\}[^]*?<span aria-hidden="true">&times;<\/span>/)
  })
})

describe('#10 article hero',()=>{
  it('48px above (article margin 32px + 16px) and below the hero tile; the tile itself unchanged',async()=>{
    expect(r2).toMatch(/\.wave4-detail-body > div:first-child:not\(:has\(:is\(p, h2, h3, li\)\)\) img \{\s*margin-block: 16px 48px;/)
    const html=await render('/cooling-tower-efficiency-calculation/')
    // R2.1 (C6): the tile is now its recorded photo-only crop
    expect(html).toContain('data-source-sha256="a8a1a4e647c20aaa5692a1ae77911a5f7582fb1ddbcdea65f5f92b0d57efdfbd"')
  })
})
