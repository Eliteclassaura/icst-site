/**
 * Fix bundle 2 (CT 2026-10-07): HOME-FIX (DD home parity 40fef549 H1–H5), R16-A11Y-01 (inline prose links), the 404 page
 * (owner; OGCS copy), the site-wide launcher placement (QA pre-pass S3, Codex crawl R1 (d)), DD R5A.1 (F1 duplicate spec
 * lines, F2 launcher at ≥1024, P1 hub render) and QA R16 M1/M2.
 */
import {afterEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup as renderMarkup} from 'react-dom/server'
import {physicalHtml} from './physical-html'
import {salmonDocument,salmonRoutes} from '../salmon'
import {LuxuryCanonical} from '../LuxuryCanonical'
import {LuxuryHeader} from '../LuxuryShell'
import NotFound,{metadata as notFoundMetadata} from '../../app/(site)/not-found'
import Page from '../../app/(site)/[[...slug]]/page'
import {R5ProductDetail,specTable} from '../r5/R5Product'
import {productPanels} from '../Wave3Products'
import {PartCard,PartsIndex,partsHubPage} from '../Wave3Presentation'
import {generateMetadata} from '../../app/(site)/[[...slug]]/page'
const renderToStaticMarkup=(...args:Parameters<typeof renderMarkup>)=>physicalHtml(renderMarkup(...args))

const APP=process.cwd()
const css=readFileSync(path.join(APP,'src/app/(site)/design-r5.css'),'utf8')
const home=()=>renderToStaticMarkup(<LuxuryCanonical doc={salmonDocument(salmonRoutes().find(r=>r.targetPath==='/')!)}/>)
const mainOf=(html:string)=>html.slice(html.indexOf('<main'),html.indexOf('</main>'))
const text=(s:string)=>s.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()

describe('HOME-FIX',()=>{
  const main=mainOf(home())
  it('H5: one H1, shown at every width; the hidden duplicate heading is gone',()=>{
    const h1=[...main.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>text(m[1]!))
    expect(h1).toEqual(['Industrial Cooling Solutions for High-Performance Facilities'])
    expect(main).not.toContain('elementor-element-be98584')
    expect(main).toMatch(/class="elementor-element elementor-element-81bef94 (?![^"]*elementor-hidden-mobile)[^"]*"/)
    const headings=[...main.matchAll(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>/g)].map(m=>text(m[1]!))
    expect(headings).not.toContain(h1[0])
  })
  it('H4: product card titles in the loop grids are H3; the section headings stay H2',()=>{
    const loopH2=[...main.matchAll(/e-loop-item[\s\S]*?<(h[23])\b/g)].map(m=>m[1])
    expect(loopH2.length).toBeGreaterThan(60)
    expect(loopH2.every(t=>t==='h3')).toBe(true)
    expect((main.match(/<h2\b/g)??[]).length).toBeLessThan(20)
    expect([...main.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map(m=>text(m[1]!))).toContain('Cooling Tower Spare Parts')
  })
  it('H1: the credential row shows the four original ICS files with real alts (hashes recorded)',()=>{
    const ledger=JSON.parse(readFileSync(path.join(APP,'content/design/home-credentials.json'),'utf8')) as {logos:Array<{src:string;sha256:string;alt:string;replacesSha256:string}>}
    expect(ledger.logos.map(l=>l.alt)).toEqual(['Cooling Technology Institute (CTI) member','ISO 9001:2015 certified company','Geothermal Resources Council (GRC) member','ISNetworld member'])
    for(const logo of ledger.logos){
      expect(createHash('sha256').update(readFileSync(path.join(APP,'public',logo.src))).digest('hex')).toBe(logo.sha256)
      expect(main).toContain(`src="${logo.src}"`)
      expect(main).toContain(`alt="${logo.alt}"`)
      expect(main).not.toContain(logo.replacesSha256+'.png')
    }
  })
  it('M5: every product photo in a card is named by its card; no content image is left without alt',()=>{
    // the owner's featured testimonials carry three decorative quote marks (alt="" aria-hidden, TESTIMONIALS-RESTORE-1.1): not content images
    const empty=[...main.matchAll(/<img\b[^>]*alt=""[^>]*>/g)].filter(m=>!/client-testimonial-quote-mark/.test(m[0])).length
    expect(empty).toBeLessThanOrEqual(3) // the three decorative twins of named links (aria-hidden)
    expect(main).toMatch(/<img[^>]*alt="Sumitomo Hansen P4 Gearboxes"/)
  })
  it('H2: the Precision band\'s middle quote button carries the primary variant through the shared hooks (tokens only; see the band block below)',()=>{
    expect(css).toMatch(/\.elementor-element-1e67569 \{[^}]*--h2o-cta-fg: var\(--df-ink-navy\);[^}]*--h2o-cta-radius: 999px;/)
  })
})

describe('R16-A11Y-01: links inside running text are underlined everywhere (not colour alone)',()=>{
  it('the rule covers prose anchors in every template and leaves buttons and navigation alone',()=>{
    expect(css).toMatch(/main :is\(p, li, td, dd, blockquote, figcaption\) a:not\(\[class\], nav a, \[role='button'\]\),\n\.salmon-copy \.elementor :is\(p, li, td, dd, blockquote, figcaption\) a:not\(\[class\], nav a, \[role='button'\]\) \{\s*text-decoration-line: underline;/)
    // the Salmon home sets `.salmon-copy .elementor a { text-decoration: none }` at a higher specificity, so the rule is repeated there
  })
})

describe('404',()=>{
  const html=renderToStaticMarkup(<NotFound/>)
  it('carries the OGCS copy, the four ruled links, noindex and the site chrome',()=>{
    expect(notFoundMetadata.title).toEqual({absolute:'Page Not Found - ICS'})
    expect(notFoundMetadata.robots).toEqual({index:false,follow:true})
    expect(text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1]!)).toBe('Page not found')
    expect(html).toContain('The page you’re looking for may have moved or no longer exists.')
    for(const [href,label] of [['/','Home'],['/cooling-tower-parts-online/','Cooling Tower Parts'],['/cooling-tower-maintenance-repair-upgrade/','Services'],['/contact-us/','Contact Us']])expect(html).toMatch(new RegExp(`<a href="${href}"><span>${label}</span>`))
    expect(html).toContain('class="lux-header"')
    expect(html).toContain('sp-footer')
    expect(html).not.toContain('not part of this build')
    // the decorative numeral is generated content (not text): it is neither read nor contrast-checked
    expect(html).not.toContain('nf-code')
    expect(css).toMatch(/\.nf \.nf-hero::after \{[^}]*content: '404';/)
  })
})

describe('Launcher placement site-wide',()=>{
  it('every page header mounts the placement; below 768 the launcher is the icon circle and holds while the first screen or the quote form is in view',()=>{
    expect(readFileSync(path.join(APP,'src/site/LuxuryShell.tsx'),'utf8')).toContain('<LauncherPlacement/>')
    renderToStaticMarkup(<LuxuryHeader/>)
    const src=readFileSync(path.join(APP,'src/site/LauncherPlacement.tsx'),'utf8')
    expect(src).toContain("document.getElementById('request-a-quote')")
    expect(src).toContain('y<window.innerHeight*0.6')
    expect(css).toMatch(/@media \(width < 768px\) \{\s*body \[data-rfq-launcher\] \{[^}]*block-size: 48px;/)
    expect(css).toMatch(/:root\[data-launcher-hold\] \[data-rfq-launcher\] \{[^}]*visibility: hidden;/)
  })
})

const byPath=(target:string)=>salmonDocument(salmonRoutes().find(route=>route.targetPath===target)!)
const env={...process.env}
afterEach(()=>{process.env={...env}})

describe('DD R5A.1',()=>{
  it('F1: a trailing line whose value is already in the table is not listed again; it is reported as a suppressed duplicate',()=>{
    const frp=byPath('/product/frp-angles/')
    const table=specTable(frp,productPanels(frp).find(p=>p.kind==='specifications')!.nodes)
    expect(table.report.suppressed).toEqual(['2 Inch Price: $3.29 per foot','3 Inch Price: $4.45 per foot','4 Inch Price: $5.49 per foot'])
    expect(table.notes).toEqual([])
    const main=mainOf(renderToStaticMarkup(<R5ProductDetail doc={frp}/>))
    expect(main).not.toContain('r5-spec-notes')
    expect(text(main)).toMatch(/Available Size:\s*2 inch/)
    // other unlabelled lines keep today's behaviour
    const gear=byPath('/product/amarillo-a-series-single-reduction-gearbox/')
    const gearTable=specTable(gear,productPanels(gear).find(p=>p.kind==='specifications')!.nodes)
    expect(gearTable.report.suppressed).toEqual([])
    expect(gearTable.notes.length).toBe(gearTable.report.listed.length+gearTable.report.price.length)
  })
  it('F2(a): at ≥1024 the launcher is held while a product header is in view; its placement is unchanged (F2(b) withdrawn)',()=>{
    expect(css).toMatch(/:root\[data-r4-reveal\]:not\(\[data-r4-hero-out\]\) body:has\(\.r5-product-head\) \[data-rfq-launcher\] \{[^}]*visibility: hidden;/)
    expect(css).not.toMatch(/@media \(width >= 1024px\) \{\s*body \[data-rfq-launcher\]/)
    expect(readFileSync(path.join(APP,'src/site/r4/R4LauncherReveal.tsx'),'utf8')).toContain('.r5-product-head')
  })
  it('P1: the hub render is capped at 460 px (≤ native) without the 300 px height cap',()=>{
    expect(readFileSync(path.join(APP,'src/site/Wave3Presentation.tsx'),'utf8')).toContain('render={parts.render} renderCap={460}/>')
    expect(css).toMatch(/\.r5 \.r5-hero--hub \.r5-hero-render \{\s*max-block-size: none;/)
  })
})

describe('QA R16',()=>{
  it('M1: a product card\'s quote link is named with its product; the visible label is unchanged',()=>{
    process.env.H2O_NATIVE_INTAKE='on'
    const doc=byPath('/product/frp-angles/')
    const card=renderToStaticMarkup(<PartCard doc={doc}/>)
    expect(card).toMatch(/<a href="\/contact-us\/#request-a-quote"[^>]*>Request a Quote<span class="visually-hidden"> for FRP Angles<\/span><\/a>/)
    // the product page's own quote buttons keep their plain label
    const head=renderToStaticMarkup(<R5ProductDetail doc={doc}/>)
    expect(head.slice(head.indexOf('r5-product-actions'),head.indexOf('r5-product-actions')+600)).not.toContain('visually-hidden')
  })
  it('M2: every All Projects card photo has an alt (the project name when the source has none); flags stay decorative',async()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const html=await (async()=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:['all-projects']}),searchParams:Promise.resolve({})})))()
    const photos=[...html.matchAll(/<img class="dr4-proj-img"[^>]*>/g)].map(m=>m[0])
    expect(photos.length).toBeGreaterThan(10)
    for(const img of photos)expect(img).toMatch(/alt="[^"]+"/)
    for(const flag of html.matchAll(/<img class="dr4-proj-flag"[^>]*>/g))expect(flag[0]).toContain('alt=""')
  })
})

describe('SEO R17 prep (Codex offline check): parts hub page value and social head (M-01 hreflang moved to Main-B, SEO-CONTENT-2)',()=>{
  const HUB='/cooling-tower-parts-online/'
  const meta=async(search:{q?:string;page?:string})=>generateMetadata({params:Promise.resolve({slug:['cooling-tower-parts-online']}),searchParams:Promise.resolve(search)})
  it('SF-02: one validated, clamped, filter-aware page value for the content and the metadata',async()=>{
    expect(partsHubPage('','2junk')).toBe(1)
    expect(partsHubPage('','2.5')).toBe(1)
    expect(partsHubPage('','-3')).toBe(1)
    expect(partsHubPage('',undefined)).toBe(1)
    const last=partsHubPage('','9999')
    expect(last).toBeGreaterThan(2)
    expect(partsHubPage('','2')).toBe(2)
    // filter-aware: a search with one page of results clamps to 1
    expect(partsHubPage('zzqxnomatch','5')).toBe(1)
    const junk=await meta({page:'2junk'})
    expect(JSON.stringify(junk.title)).not.toContain('Page ')
    const big=await meta({page:'9999'})
    expect(JSON.stringify(big.title)).toContain(`Page ${last}`)
    expect(JSON.stringify(big.title)).not.toContain('9999')
    expect(JSON.stringify((await meta({page:'2'})).title)).toContain('Page 2')
    // the base-hub canonical is kept
    expect(JSON.stringify((await meta({page:'2'})).alternates?.canonical??'')).toBe(JSON.stringify((await meta({})).alternates?.canonical??''))
  },120000)
  it('SF-03: the social title and description of ?page=N carry "Page N", like the head; page 1 is unchanged',()=>{
    process.env.H2O_PUBLIC_EXPORT='0'
    const doc=byPath(HUB)
    const social=(html:string,key:string)=>html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1]
    const one=renderToStaticMarkup(<PartsIndex doc={doc} pageNumber={1}/>)
    const two=renderToStaticMarkup(<PartsIndex doc={doc} pageNumber={2}/>)
    for(const key of ['og:title','twitter:title'])expect(social(two,key),key).toMatch(/ - Page 2$/)
    for(const key of ['og:description','twitter:description'])expect(social(two,key),key).toMatch(/^Page 2: /)
    for(const key of ['og:title','twitter:title','og:description','twitter:description']){expect(social(one,key),key).toBeTruthy();expect(social(one,key)).not.toMatch(/Page 2/)}
  },120000)
})

describe('QA R17B',()=>{
  it('S2: on a phone the launcher is held while scrolling down and returns on scroll-up and at the page end, which the footer keeps clear',()=>{
    const src=readFileSync(path.join(APP,'src/site/LauncherPlacement.tsx'),'utf8')
    expect(src).toContain('(down&&!atEnd())')
    expect(src).toContain('if(y>lastY+6)down=true')
    expect(src).toContain('else if(y<lastY-6)down=false')
    expect(css).toMatch(/body:not\(:has\(\.dr3-sticky\)\) \.sp-footer \{\s*padding-block-end: calc\(80px \+ env\(safe-area-inset-bottom\)\);/)
  })
  it('M3: product gallery, hero and series renders are named when the source has no alt; thumbnails stay decorative (their button is labelled)',async()=>{
    process.env.H2O_NATIVE_INTAKE='on'
    const frp=renderToStaticMarkup(<R5ProductDetail doc={byPath('/product/frp-angles/')}/>)
    const main=frp.slice(frp.indexOf('r5-gallery-frame'),frp.indexOf('r5-gallery-frame')+700)
    expect(main).toMatch(/alt="FRP Angles – view 1"/)
    expect([...frp.matchAll(/<button[^>]*aria-label="Show image \d of \d"[^>]*><img[^>]*alt=""/g)].length).toBeGreaterThan(1)
    process.env.H2O_PUBLIC_EXPORT='1'
    for(const target of ['/fans/','/tower-hardware/','/class-1000/']){
      const html=await (async()=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:target.split('/').filter(Boolean)}),searchParams:Promise.resolve({})})))()
      const named=[...html.matchAll(/<img\b[^>]*class="r5-hero-render"[^>]*>|<div class="r5-series-media"><img\b[^>]*>/g)].map(m=>m[0])
      expect(named.length,target).toBeGreaterThan(0)
      for(const img of named)expect(img,target).toMatch(/alt="[^"]+"/)
    }
  },120000)
})

describe('Precision band buttons and the shared RFQ trigger default (owner report, CT 2026-10-08)',()=>{
  const fixes=readFileSync(path.join(APP,'src/app/(site)/design-fixes.css'),'utf8')
  const token=(source:string,name:string)=>{const m=new RegExp(`${name}: rgb\\((\\d+) (\\d+) (\\d+)\\)`).exec(source);if(!m)throw new Error(`token ${name}`);return [Number(m[1]),Number(m[2]),Number(m[3])] as const}
  const lum=([r,g,b]:readonly [number,number,number])=>{const f=(v:number)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)}
  const ratio=(a:readonly [number,number,number],b:readonly [number,number,number])=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x!+0.05)/(y!+0.05)}
  const WHITE=token(fixes,'--df-white'),NAVY=token(css,'--df-ink-navy'),BLUE=token(fixes,'--df-blue'),BAND=token(fixes,'--df-step-number')
  it('the primary (white pill, navy text) and the ghost pills (white on the band blue) and the default pill all clear 4.5:1',()=>{
    expect(ratio(NAVY,WHITE)).toBeGreaterThan(12)
    expect(ratio(WHITE,BAND)).toBeGreaterThanOrEqual(4.5) // the band's blue is the step-number blue, rgb(11 85 165)
    expect(ratio(WHITE,BLUE)).toBeGreaterThanOrEqual(4.5)
  })
  it('"Request a Quote" is the primary pill with the arrow circle; "View More" is the ghost pill like its siblings (no semi-filled fill, no square block)',()=>{
    expect(css).toMatch(/elementor-element-1e67569 :is\([^)]*a\.elementor-button\) \{[^}]*background: var\(--df-white\);[^}]*border-radius: 999px;[^}]*color: var\(--df-ink-navy\);[^}]*min-block-size: 48px;/)
    expect(css).toMatch(/elementor-element-1e67569 :is\([^)]*a\.elementor-button\)::after \{[^}]*background: var\(--df-ink-navy\);[^}]*border-radius: 50%;[^}]*content: '→';/)
    expect(css).toMatch(/elementor-element-3893a46, \.elementor-element-94e87a9, \.elementor-element-3914202\) a\.elementor-button \{\s*background: transparent;\s*border: 1px solid var\(--df-white\);\s*border-radius: 999px;/)
  })
  it('"View More" overrides the earlier semi-filled fill rule (the page really shows it transparent)',()=>{
    expect(css).toMatch(/\.salmon-copy\.salmon-copy\.salmon-copy\.salmon-page-home a\.elementor-button\.elementor-button\[data-salmon-node='body\.9\.5\.1'\] \{\s*background-color: transparent;/)
  })
  it('any RFQ trigger no context themes takes the system pill (blue, white text, 999 radius), never the browser default',()=>{
    expect(css).toMatch(/\.luxury-site,\s*\.salmon-canonical \{[^}]*--h2o-cta-bg: var\(--df-blue\);[^}]*--h2o-cta-fg: var\(--df-white\);[^}]*--h2o-cta-radius: 999px;/)
    // the adapter and the native trigger read exactly these hooks
    for(const f of ['src/rfq-native/NativeRfq.module.css','src/conversion/QuoteCta.module.css'])expect(readFileSync(path.join(APP,f),'utf8')).toMatch(/var\(--h2o-cta-radius,/)
    expect(css).toMatch(/\.figma-wave4 \.wave4-article-rfq\.wave4-article-rfq :is\(a, \.rfq a\) \{\s*border-radius: 999px;/)
    // no legacy orange or pink anywhere in the site's stylesheets that this bundle ships
    expect(css).not.toMatch(/b2461c|cc3366|rgb\(178 70 28\)|rgb\(204 51 102\)/i)
  })
})

describe('Home hero text contrast (DD 2026-10-08)',()=>{
  it('one flat navy 32% layer lies between the photo and the text, follows the card\'s corners, never catches clicks, and the content sits above it',()=>{
    expect(css).toMatch(/--df-hero-scrim: rgb\(13 41 69 \/ 32%\);/)
    expect(css).toMatch(/\.elementor-element-2e9b867::after \{\s*background: var\(--df-hero-scrim\);\s*border-radius: inherit;\s*content: '';\s*inset: 0;\s*pointer-events: none;\s*position: absolute;\s*z-index: 0;/)
    expect(css).toMatch(/\.elementor-element-2e9b867 > \* \{\s*position: relative;\s*z-index: 1;/)
    // the layer is the navy of the R4 hero scrim, so the measured worst pixel (3.31 → 5.26 at 1440, 3.58 → 5.58 at 390) reproduces
    expect(css).toMatch(/--df-ink-navy: rgb\(13 41 69\);/)
  })
})

describe('R5.1 (DD 2026-10-08): band pills',()=>{
  it('the four pills are one width on a phone and use DM Sans 600',()=>{
    expect(css).toMatch(/elementor-element-3914202\) \{\s*align-self: center;\s*inline-size: min\(320px, calc\(100vw - 70px\)\);/)
    expect(css).toMatch(/elementor-element-3914202\) :is\(a\.elementor-button, a\[data-rfq-native\], \.rfq a, \.elementor-button-text\) \{\s*font-family: 'DM Sans', 'IBM Plex Sans', sans-serif;\s*font-weight: 600;/)
  })
})
