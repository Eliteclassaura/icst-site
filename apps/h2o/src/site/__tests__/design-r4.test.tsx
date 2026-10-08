/**
 * Design R4 (CT GO 2026-10-07; DD specs H2O_DESIGN_R4_SPEC_*.md). Phase 1: the shared R4 system on Repair, Thermal, Dry Soda
 * and Resources, plus the site-wide R4a fixes (blue pill RFQ on product pages and cards, parts hub frame). Phase 2:
 * Replacement, Air Coolers, All Projects and the parts-hub intro layout.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {salmonDocument,salmonNodeText,salmonRoutes,type SalmonNode} from '../salmon'
import {r4Builders,r4PlacesRestored} from '../r4/R4Pages'
import {portfolioView} from '../r4/R4Portfolio'
import {salmonFamilyFor,salmonFamilyModel} from '../salmon-family-adapter'
import {R4Tabs} from '../r4/R4Tabs'
import {r4Copy,r4Media} from '../design-r4-media'

const APP=process.cwd()
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean).map(decodeURIComponent)}),searchParams:Promise.resolve({})}))
const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const PAGES:Record<string,string>={'SALMON-pages-1446':'/cooling-tower-maintenance-repair-upgrade/','SALMON-pages-1555':'/thermal-upgrade/','SALMON-pages-1722':'/dry-soda-blasting/','SALMON-pages-1572':'/cooling-tower-replacement/','SALMON-pages-1668':'/air-coolers/'}
const norm=(s:string)=>s.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()
type LayoutNode={ref?:string;refs?:string[];slice?:{ref:string};children?:LayoutNode[]}
const docFor=(id:string)=>salmonDocument(salmonRoutes().find(r=>r.routeId===id)!)
/** The source texts the previous luxury layout rendered for the page (every ref in content/luxury/<id>.json). */
function layoutTexts(id:string):Map<string,string>{
  const model=JSON.parse(readFileSync(path.join(APP,'content/luxury',id.split('-').at(-1)+'.json'),'utf8')) as {tree:LayoutNode[]}
  const doc=docFor(id),nodes=new Map<string,SalmonNode>()
  const index=(n:SalmonNode,k:string)=>{nodes.set(k,n);if(typeof n!=='string')n.children.forEach((c,i)=>index(c,k+'.'+i))}
  doc.children.forEach((n,i)=>index(n,'body.'+i))
  const out=new Map<string,string>()
  const walk=(n:LayoutNode)=>{for(const r of [n.ref,...(n.refs??[]),n.slice?.ref].filter(Boolean) as string[]){const v=nodes.get(r);if(v!==undefined){const t=salmonNodeText(v).replace(/\s+/g,' ').trim();if(t)out.set(r,t)}}n.children?.forEach(walk)}
  model.tree.forEach(walk)
  return out
}
/**
 * Source texts R4 deliberately does not render, by CT ruling or by the hero contract: hero source CTA labels (the quote
 * action replaces them since Design Fixes R2), section numerals the old layout borrowed from the maintenance chips (R4 draws
 * decorative CSS numerals), the duplicate "View More" labels (the R4 cards carry their own), and the Dry Soda line the OGCS
 * QUALIFY StatBar replaces (with its source quote label).
 */
const NOT_RENDERED:Record<string,string[]>={
  'SALMON-pages-1446':['body.11.5.1.1.11.1.1.1','body.11.7.1.1.1.1.1.1.1','body.11.7.1.1.3.1.1.1.1','body.11.7.1.1.5.1.1.1.1','body.11.7.1.1.7.1.1.1.1'],
  'SALMON-pages-1555':['body.1.1.1.5.1.1.1'],
  'SALMON-pages-1722':['body.3.1.1.1.3.4.0','body.3.1.1.1.5.1.1.1'],
  'SALMON-pages-1572':[],
  'SALMON-pages-1668':['body.1.1.1.5.1.1.1'],
}

describe('R4 pages render the page’s own source text in the shared system',()=>{
  it('dispatches the five service routes to R4 and keeps one unchanged H1 each',async()=>{
    for(const [id,route] of Object.entries(PAGES)){
      expect(r4Builders[id],id).toBeDefined()
      const html=await render(route)
      expect(html,route).toContain(`data-r4-route="${route}"`)
      const h1s=[...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>norm(m[1]!))
      expect(h1s,route).toEqual([norm(docFor(id).seo.h1[0]??'')])
    }
  })
  it('every source text of the previous layout is still on the page, except at most the ruled list',async()=>{
    for(const [id,route] of Object.entries(PAGES)){
      const text=norm(await render(route))
      const missing=[...layoutTexts(id)].filter(([,t])=>!text.includes(norm(t))&&!/^View More$/.test(t)).map(([k])=>k)
      expect(missing.filter(k=>!NOT_RENDERED[id]!.includes(k)),route).toEqual([])
      expect(layoutTexts(id).size,route).toBeGreaterThan(20)
    }
  })
  it('Dry Soda carries the OGCS QUALIFY StatBar (footnote always visible) and two unique result charts, no stat cards',async()=>{
    const html=await render('/dry-soda-blasting/')
    const stat=r4Copy().statBar
    for(const t of [stat.stat,stat.label,stat.footnote,stat.ctaText])expect(norm(html)).toContain(norm(t))
    expect(norm(html)).not.toContain('Need to improve your ACHE performance by up to 40%')
    expect(html).not.toMatch(/32% Reduction|13% Increase/)
    expect((html.match(/class="dr4-chart"/g)??[])).toHaveLength(2)
    expect(html).toContain('Crew handling stacked cooling tower fill packs on an industrial site')
  })
  it('Resources keeps its thirteen documents, three pathways and the hub hero',async()=>{
    const html=await render('/resources/')
    expect(html).toContain('dr4-hero dr4-hero--hub')
    expect((html.match(/class="wave4-document(?: wave4-document-flat)?"/g)??[])).toHaveLength(13)
    for(const href of ['/cooling-tower-brochures/','/cooling-tower-resources/tools/','/tech-articles/'])expect(html).toContain(`href="${href}"`)
  })
  it('numerals are decorative CSS text, not headings or raster images',async()=>{
    for(const route of Object.values(PAGES)){
      const html=await render(route)
      expect(html,route).not.toMatch(/<h[1-6][^>]*>\s*0\d\s*<\/h[1-6]>/)
      expect(html,route).not.toContain('Group-1000004927')
    }
  })
})

describe('R4 tabbed list (Repair)',()=>{
  it('is eight disclosure buttons, one open, every body in the DOM, under the source heading tag',async()=>{
    const html=await render('/cooling-tower-maintenance-repair-upgrade/')
    expect((html.match(/class="dr4-tab-button"/g)??[])).toHaveLength(8)
    expect((html.match(/aria-expanded="true"/g)??[])).toHaveLength(1)
    expect((html.match(/class="dr4-tab-panel"[^>]*hidden=""/g)??[])).toHaveLength(7)
    expect(html).toMatch(/<h3 class="dr4-tab-heading"><button/)
    for(const t of ['Fill Replacement','Cold Water Basin Repair'])expect(html).toContain(t)
  })
  it('server-renders with the first item open',()=>{
    const html=renderToStaticMarkup(<R4Tabs label="t" items={[{key:'a',title:'A',body:'one'},{key:'b',title:'B',body:'two'}]}/>)
    expect(html).toMatch(/aria-expanded="true"[^>]*id="dr4-tab-a"/)
    expect(html).toContain('two')
  })
})

describe('R4 media',()=>{
  const ledger=JSON.parse(readFileSync(path.join(APP,'content/design/design-r4-media.json'),'utf8')) as {slots:Record<string,{variants:{w:number;h:number;src:string;sha256:string}[];source:{width:number};crop:{w:number}|null;alt:string;kind:string}>}
  it('every variant exists with its recorded SHA-256 and never exceeds its source (or crop) width',()=>{
    for(const [slot,m] of Object.entries(ledger.slots)){
      const max=m.crop?.w??m.source.width
      for(const v of m.variants){
        expect(v.w,slot).toBeLessThanOrEqual(max)
        expect(createHash('sha256').update(readFileSync(path.join(APP,'public',v.src))).digest('hex'),v.src).toBe(v.sha256)
      }
    }
  })
  it('no alt text names a project, client or place, and owner AI images are general imagery',()=>{
    // Recorded exceptions, each with its exact alt (any other slot naming a place, project or client fails):
    //   replacement.case: CT 2026-10-07 (location verified by CT, EXIF TG-620 2013-09-12; louvered crossflow cells visible).
    const NAMED_ALT_EXCEPTIONS:Record<string,string>={
      'replacement.case':'Crossflow cooling tower cells at the Palinpinon geothermal power plant',
    }
    for(const [slot,alt] of Object.entries(NAMED_ALT_EXCEPTIONS))expect(ledger.slots[slot]!.alt,slot).toBe(alt)
    for(const [slot,m] of Object.entries(ledger.slots).filter(([slot])=>!(slot in NAMED_ALT_EXCEPTIONS)))expect(m.alt,slot).not.toMatch(/Palinpinon|KBR|Dyno|International Paper|PTT|Navanakorn|Mak Ban|Lanxess|PETRONAS|Thailand|USA/i)
    for(const slot of ['repair.hero','thermal.hero','resources.hero','drysoda.hero','aircoolers.hero'])expect(['owner','figma']).toContain(r4Media(slot).kind)
  })
  it('heroes load eagerly at high priority with explicit dimensions and a srcset capped at native',async()=>{
    const html=await render('/thermal-upgrade/')
    expect(html).toMatch(/<img class="dr4-hero-img" src="\/media\/design-r4\/thermal-hero-1448\.webp" srcSet="[^"]*thermal-hero-960\.webp 960w, [^"]*thermal-hero-1448\.webp 1448w"[^>]*width="1448" height="1086"[^>]*loading="eager" fetchPriority="high"/)
  })
})

describe('R4 OGCS copy review (CT 2026-10-07)',()=>{
  it('Dry Soda: no mark on Dry ice; the result charts trace to the LIVE ICS original',async()=>{
    const html=await render('/dry-soda-blasting/')
    expect([...html.matchAll(/<span class="dr4-compare-mark" aria-hidden="true">([^<]*)<\/span>/g)].map(m=>m[1])).toEqual(['✕','✓'])
    for(const slot of ['drysoda.chart1','drysoda.chart2'])expect((r4Media(slot) as unknown as {dataProvenance:{liveOriginal:{sha256:string}}}).dataProvenance.liveOriginal.sha256,slot).toBe('047f12d6ae3876de02bab3ac1e2707e29548010b25ca726b34d56a3efdc2e250')
  })
  it('Thermal problem photo alt per OGCS',()=>{
    expect(r4Media('thermal.problem').alt).toBe('Technicians with new fan blades staged on a fan deck')
  })
})

describe('DD R4 phase 1 revisions (CT 2026-10-07)',()=>{
  const css=readFileSync(path.join(APP,'src/app/(site)/design-r4.css'),'utf8')
  const card='\\.sp-family--parts-index \\.sp-section--hero \\.sp-overlay--dark > \\.sp-photo-content > \\.sp-con\\.sp-overlay--blue'
  it('M1: the parts hero is one card (the inner panel loses its box and shade; the card photo stays the one layer)',()=>{
    expect(css).toMatch(new RegExp(`${card} \\.sp-media--panel \\{\\s*border-radius: 0;\\s*\\}`))
    expect(css).toMatch(new RegExp(`${card} \\.sp-media--panel > \\.sp-photo-shade \\{\\s*display: none;\\s*\\}`))
    expect(css).toMatch(new RegExp(`${card} > \\.sp-photo-shade \\{\\s*opacity: 0\\.75;\\s*\\}`))
  })
  it('M2: below 768 the launcher is a 48 px icon circle 16 px from the corner on R4 pages, its name kept',()=>{
    const m=css.match(/@media \(width < 768px\) \{\s*body:has\(\[data-r4-route\]\) \[data-rfq-launcher\] \{([^}]*)\}\s*body:has\(\[data-r4-route\]\) \[data-rfq-launcher\] > span \{([^}]*)\}/)!
    for(const d of ['block-size: 48px;','inline-size: 48px;','inset-block-end: calc(16px + env(safe-area-inset-bottom));','inset-inline-end: 16px;'])expect(m[1]).toContain(d)
    expect(m[2]).toContain('clip-path: inset(50%);')
    expect(css).toMatch(/\.dr4\[data-r4-route\] \{\s*padding-block-end: calc\(80px \+ env\(safe-area-inset-bottom\)\);/)
  })
  it('P1: the Resources hero height and H1 per Figma 3:24',()=>{
    expect(css).toMatch(/\.dr4 \.dr4-hero--resources \{\s*min-block-size: clamp\(440px, 48vh, 560px\);/)
    expect(css).toMatch(/\.dr4 \.dr4-hero--resources \.dr4-hero-title \{\s*font-size: clamp\(56px, 6\.5vw, 104px\);/)
  })
})

describe('DD R4 final review (07ef220a, 2026-10-07)',()=>{
  const css=readFileSync(path.join(APP,'src/app/(site)/design-r4.css'),'utf8')
  it('F1: below 768 the launcher waits until the hero is out of view; without the script the hero keeps 64 px clear',()=>{
    for(const f of ['src/site/LuxuryCanonical.tsx','src/site/r4/R4Portfolio.tsx','src/site/Wave4Presentation.tsx'])expect(readFileSync(path.join(APP,f),'utf8'),f).toContain('<R4LauncherReveal/>')
    const src=readFileSync(path.join(APP,'src/site/r4/R4LauncherReveal.tsx'),'utf8')
    expect(src).toContain('new IntersectionObserver(')
    // Design R5a: the R5 heroes (parts hub/category, series head, product head) count as the page hero too.
    expect(src).toMatch(/document\.querySelector\('\[data-r4-route\] :is\(\.dr4-hero, \.r5-hero, \.r5-series-head, \.r5-product-head\)'\)/)
    expect(css).toMatch(/:root\[data-r4-reveal\]:not\(\[data-r4-hero-out\]\) \[data-rfq-launcher\] \{\s*opacity: 0;\s*pointer-events: none;\s*visibility: hidden;/)
    expect(css).toMatch(/:root:not\(\[data-r4-reveal\]\) \[data-r4-route\] \.dr4-hero :is\(\.dr4-hero-lead, \.dr4-actions\) \{\s*padding-inline-end: 64px;/)
    expect(css).toMatch(/@media \(width < 768px\) and \(prefers-reduced-motion: reduce\) \{\s*:root\[data-r4-reveal\] \[data-rfq-launcher\] \{\s*transition: none;/)
  })
  it('F2: the All Projects hero is the verified LIVE Japan-Project original, generic alt, and repeats no card photo',async()=>{
    const m=r4Media('projects.hero')
    expect(m.source.sha256).toBe('969aa66a977b121960cbd88b4114857920e7afb729b211d32a574c8196e44b80')
    expect(m.alt).toBe('Multi-cell industrial cooling tower with fan stacks at a plant site')
    expect(m.position).toBe('60% 45%')
    const doc=docFor('SALMON-pages-1353')
    const cards=portfolioView(salmonFamilyModel(doc,salmonFamilyFor(doc)!)).countries.flatMap(c=>c.cards)
    const registry=JSON.parse(readFileSync(path.join(APP,'content/projects/project-media.json'),'utf8')) as {projects:Record<string,{media:{sha256:string};original?:{sha256:string}}>}
    const cardSources=new Set(cards.flatMap(c=>{const r=registry.projects[c.href];return [c.photo?.sha256,r?.media.sha256,r?.original?.sha256].filter(Boolean) as string[]}))
    expect(cardSources.has(m.source.sha256)).toBe(false)
    expect(css).toMatch(/\.dr4 \.dr4-hero--portfolio::before \{\s*background-image: linear-gradient\(90deg, var\(--dr4-scrim-strong\) 0, var\(--dr4-scrim-84\) 700px, var\(--dr4-scrim-15\) 100%\);/)
  })
  it('F3: the sections of a shared country row start on one top line with one heading block height',()=>{
    expect(css).toMatch(/\.dr4 \.dr4-country-row > \.dr4-section--country \{[^}]*padding-block-start: var\(--dr4-rhythm\);/)
    expect(css).toMatch(/\.dr4 \.dr4-country-row \.dr4-country-head \{\s*align-items: end;\s*min-block-size: 96px;/)
  })
})

describe('R4 phase 2',()=>{
  const css=readFileSync(path.join(APP,'src/app/(site)/design-r4.css'),'utf8')
  it('Replacement: the Palinpinon photo carries the CT location-only caption, never as before/after or the replacement work',async()=>{
    const html=await render('/cooling-tower-replacement/')
    const fig=html.match(/<figure class="dr4-figure">([\s\S]*?)<\/figure>/)![1]!
    expect(norm(fig.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)![1]!)).toBe('Cooling towers at the Palinpinon geothermal power plant, Philippines')
    expect(fig).toContain('alt="Crossflow cooling tower cells at the Palinpinon geothermal power plant"')
    const words=[...fig.matchAll(/alt="([^"]*)"|<figcaption[^>]*>([^<]*)</g)].map(m=>m[1]??m[2]).join(' ')
    expect(words).not.toMatch(/before|after|replace/i)
    expect((html.match(/<figcaption/g)??[]).length).toBe(1)
  })
  it('Replacement: the DD §2 fallback hero (verified LIVE Palinpinon-Day) differs from Thermal; the CTA band differs from both',()=>{
    const src=(slot:string)=>r4Media(slot).source.sha256
    expect(src('replacement.hero')).toBe('ac03ee03ffdce3185fae7236796da15cb0be3094fdd87375c441e26836286454')
    expect(src('replacement.hero')).not.toBe(src('thermal.hero'))
    expect(new Set([src('replacement.hero'),src('replacement.cta'),src('replacement.case'),src('replacement.overview')]).size).toBe(4)
    expect(r4Media('replacement.hero').alt).not.toMatch(/Palinpinon|Philippines/i)
  })
  it('Air Coolers: split hero never upscales the 1024 px image; the duplicate chip is gone; restored sections are placed once',async()=>{
    const html=await render('/air-coolers/')
    expect(html).toMatch(/<section class="dr4-hero dr4-hero--split"[\s\S]*?sizes="\(min-width: 1024px\) 600px, calc\(100vw - 32px\)"/)
    expect(r4Media('aircoolers.hero').variants.at(-1)!.w).toBe(1024)
    expect(css).toMatch(/\.dr4 \.dr4-hero--split \.dr4-hero-img \{[^}]*max-inline-size: 1024px;/)
    expect((norm(html).match(/Repair\/Reconstruction/g)??[]).length).toBe(1)
    expect(html).not.toContain('5ec646134677cdcb')
    expect(r4PlacesRestored.has('SALMON-pages-1668')).toBe(true)
    expect(html).toContain('3f951b67f51c948d')
  })
  it('no photo repeats within an R4 page',async()=>{
    for(const route of [...Object.values(PAGES),'/all-projects/']){
      const srcs=[...(await render(route)).matchAll(/<main[\s\S]*<\/main>/g)].flatMap(m=>[...m[0].matchAll(/<img[^>]*?\ssrc="([^"]+)"/g)].map(x=>x[1]!)).filter(src=>!/\/salmon\/[0-9a-f]{64}\.png$/.test(src))
      expect(srcs.length-new Set(srcs).size,route).toBe(0)
    }
  })
  it('All Projects: one H1 first, country chips without state chips, Texas and Nevada after the United States',async()=>{
    const doc=docFor('SALMON-pages-1353')
    const v=portfolioView(salmonFamilyModel(doc,salmonFamilyFor(doc)!))
    expect(v.chips.map(c=>c.href)).toEqual(['#usa','#philip','#thai','#indo','#viet','#mala'])
    expect(v.countries.slice(0,3).map(c=>c.anchor)).toEqual(['usa','texa','neva'])
    const html=await render('/all-projects/')
    expect(html).toContain('data-r4-route="/all-projects/"')
    const heads=[...html.matchAll(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/g)].map(m=>`h${m[1]} ${norm(m[2]!)}`)
    expect(heads[0]).toBe(`h1 ${norm(doc.seo.h1[0]??'')}`)
    expect((html.match(/<h1/g)??[]).length).toBe(1)
    for(const c of v.countries)expect(html,c.anchor).toContain(`id="${c.anchor}"`)
  })
  it('All Projects: every project link of the source is kept, and each card shows its own photo (never a neighbour’s)',async()=>{
    const doc=docFor('SALMON-pages-1353')
    const v=portfolioView(salmonFamilyModel(doc,salmonFamilyFor(doc)!))
    const cards=v.countries.flatMap(c=>c.cards)
    const model=salmonFamilyModel(doc,salmonFamilyFor(doc)!)
    const source=new Set([...JSON.stringify(model.sections).matchAll(/"href":"(\/all-projects\/[a-z0-9-]+\/)"/g)].map(m=>m[1]!))
    expect(new Set(cards.map(c=>c.href))).toEqual(source)
    const photo=(href:string)=>cards.find(c=>c.href===href)!.photo?.sha256?.slice(0,8)
    expect(photo('/all-projects/edc/')).toBe('812239ea')
    expect(photo('/all-projects/cooling-tower-disaster-recovery/')).toBe('be858908')
    expect(photo('/all-projects/pttcsp/')).toBeUndefined()
    const shas=cards.map(c=>c.photo?.sha256).filter(Boolean)
    expect(shas.length).toBe(new Set(shas).size)
    // Cards never draw a photo wider than its file: columns cap at 369 px = the smallest held width (353) + the 2×8 px frame.
    expect(Math.min(...cards.flatMap(c=>c.photo?.width?[c.photo.width]:[]))).toBe(353)
    expect(css).toMatch(/\.dr4 \.dr4-proj-grid,\n\.dr4 \.dr4-country-row \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 300px\), 369px\)\);/)
    expect(css).toMatch(/\.dr4 \.dr4-proj \{[^}]*padding: 8px;/)
  })
  it('parts hub: the restored intro is a two-column grid (no empty column), one column below 1100',()=>{
    expect(css).toMatch(/\.wave3-site section\.wave3-index-intro\[data-restored-slot-render='intro'\] \{[^}]*grid-auto-flow: column;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
    expect(css).toMatch(/@media \(width < 1100px\) \{\s*\.wave3-site section\.wave3-index-intro\[data-restored-slot-render='intro'\] \{[^}]*grid-template-columns: minmax\(0, 1fr\);/)
  })
})

describe('R4a site-wide',()=>{
  const css=readFileSync(path.join(APP,'src/app/(site)/design-r4.css'),'utf8')
  it('the product detail and product card quote controls take the blue pill (no orange)',()=>{
    expect(css).toMatch(/\.wave3-site \.wave3-detail-action \.rfq a\[data-rfq-native\],\n\.wave3-site \.wave3-card-rfq \.rfq a\[data-rfq-native\],[^{]*\{[^}]*background: var\(--dr4-blue\);[^}]*border-radius: 999px;/)
  })
  it('the parts hub hero loses its outer frame',()=>{
    expect(css).toMatch(/\.sp-family--parts-index \.sp-section--hero \.sp-section-inner > \.sp-con\.sp-overlay--dark > \.sp-photo-img,[^{]*\{\s*display: none;/)
  })
  it('is imported last, colours are tokens, logical properties only',()=>{
    const imports=[...readFileSync(path.join(APP,'src/app/(site)/layout.tsx'),'utf8').matchAll(/^import '\.\/([^']+\.css)'/gm)].map(m=>m[1])
    expect(imports.slice(-4)).toEqual(['design-r4.css','design-r5.css','design-r5b.css','design-lang.css']) // Design R5a, R5b (CT 2026-10-07), then LANG-1, load after R4
    for(const line of css.split('\n').filter(l=>/^\s*(color|background(-color)?|border(-color)?|outline|box-shadow)\s*:/.test(l)))expect(line,line).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
    expect(css).not.toMatch(/\b(margin|padding)-(left|right|top|bottom)\s*:/)
  })
  it('the R4 strings carry no forbidden content',()=>{
    const copy=readFileSync(path.join(APP,'content/design/design-r4-copy.json'),'utf8')
    for(const bad of ['+66-2-260-6598','HVAC','guarantee','OEM','Buy Now','Email Sequence'])expect(copy,bad).not.toContain(bad)
  })
})
