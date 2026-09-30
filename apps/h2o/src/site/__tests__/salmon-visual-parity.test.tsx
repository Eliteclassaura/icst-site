/**
 * SALMON_FULL_PAGE_VISUAL_PARITY_REMEDIATION_R1 — visual discrimination gates.
 *
 * These do not replace rendered screenshots. They fail when an audited Salmon family silently
 * falls back to the generic article renderer or loses the structural signals that made the
 * screenshots pass: photographic hero, product cards, grouped project portfolio, photo-first
 * project detail, Dry Soda's own composition, country photo panels and the Salmon footer.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {SalmonFamilyPage,salmonFamilyFor,salmonFamilyRouteIds} from '../SalmonFamilies'
import {OWNER_QUOTE_LABELS,SOURCE_EXCLUSIONS,salmonFamilyModel} from '../salmon-family-adapter'
import {LuxuryFooter} from '../LuxuryShell'
import {PartsIndex} from '../Wave3Presentation'
import {Wave4ArticleIndex,Wave4Library} from '../Wave4Presentation'
import {EnglishServicePage,englishServicePages} from '../EnglishServices'
import {LuxuryCanonical,luxuryIds} from '../LuxuryCanonical'
import {serviceCompositions} from '../ServiceComposition'
import {cssBackground} from '../salmon-source'
import {contactOffices} from '../contact'
import {salmonDocument,salmonNodeText,salmonRoutes,type SalmonDocument,type SalmonNode} from '../salmon'

const doc=(id:string):SalmonDocument=>salmonDocument(salmonRoutes().find(route=>route.routeId===id)!)
const byPath=(target:string):SalmonDocument=>salmonDocument(salmonRoutes().find(route=>route.targetPath===target)!)
const page=(source:SalmonDocument)=>{const config=salmonFamilyFor(source);if(!config)throw new Error(`No Salmon family: ${source.targetPath}`);return renderToStaticMarkup(<SalmonFamilyPage doc={source} config={config}/>)}
const count=(html:string,pattern:RegExp)=>(html.match(pattern)??[]).length
const mainOf=(html:string)=>html.slice(html.indexOf('<main'),html.indexOf('</main>'))
const env={id:process.env.H2O_TYPEFORM_FORM_ID,origin:process.env.H2O_TYPEFORM_ORIGIN}
beforeEach(()=>{process.env.H2O_TYPEFORM_FORM_ID='F22cAgx3';process.env.H2O_TYPEFORM_ORIGIN='https://form.typeform.com'})
afterEach(()=>{for(const [key,value] of [['H2O_TYPEFORM_FORM_ID',env.id],['H2O_TYPEFORM_ORIGIN',env.origin]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value}})

const PARTS=['/cooling-tower-fan-stacks/','/drive-shafts-assembles/','/fans/','/fill-media/','/frp-members/','/gear-box/','/motors/','/nozzles/','/tower-hardware/']
const COUNTRY=['/cooling-tower-japan/','/cooling-tower-malaysia/','/cooling-tower-singapore/','/cooling-tower-thailand/','/cooling-tower-usa/']
const CLASSES=['/class-1000/','/class-10000-heavy-duty-standard-chord/','/class-10000-minimum-acoustic-geometry/','/class-10000-xc/','/class-20000/']
const ledger=JSON.parse(readFileSync(path.join(process.cwd(),'content/release/route-ledger.json'),'utf8')) as {routes:Array<{path:string;routeId:string;state:string;export:boolean}>}
const projectDetails=ledger.routes.filter(row=>row.state==='PUBLIC'&&row.export&&/^\/all-projects\/[^/]+\/$/.test(row.path))

describe('Salmon family routing replaces the generic article fallback',()=>{
  it('maps every audited P0/P1 Salmon family document to a Salmon presentation',()=>{
    for(const target of [...PARTS,...COUNTRY,...CLASSES,'/cooling-tower-spares/','/fans/moore-fans/','/industries/','/solutions/','/dry-soda-blasting/','/all-projects/','/privacy-policy/','/testimonial-detail/','/about-ics/'])expect(salmonFamilyFor(byPath(target)),target).toBeDefined()
    expect(projectDetails).toHaveLength(22)
    for(const row of projectDetails)expect(salmonFamilyFor(doc(row.routeId))?.family,row.path).toBe('project-detail')
  })
  it('never renders an audited family through <main class="shell article">',()=>{
    for(const id of salmonFamilyRouteIds()){const html=page(doc(id));expect(html,id).not.toContain('class="shell article"');expect(count(html,/<main\b/g),id).toBe(1);expect(count(html,/<h1\b/g),id).toBe(doc(id).seo.h1.length?1:0)}
  })
})

describe('Parts landing architecture',()=>{
  it('renders the photographic hero, the source foreground and a card grid for all nine siblings',()=>{
    for(const target of PARTS){
      const source=byPath(target),html=page(source)
      expect(html,target).toContain('data-salmon-family="parts-landing"')
      expect(html,target).toMatch(/sp-section--hero[\s\S]*?sp-photo[\s\S]*?f3f4a80cef5bfa1020981c19487cca105b7975d12b1139a01fb6d89fddc63019/)
      expect(cssBackground(source.routeId,'4325a21'),target).toBeDefined()
      expect(html,target).toContain(cssBackground(source.routeId,'4325a21')!.sha256)
      expect(count(html,/data-salmon-product-card=""/g),target).toBeGreaterThanOrEqual(6)
      expect(html,target).toContain('sp-parts-related')
      expect(html,target).not.toMatch(/>\s*(?:Buy|Order) Now\s*</)
    }
  })
  it('binds product cards to the verified product slug and id only',()=>{
    const html=page(byPath('/nozzles/'))
    const contexts=[...html.matchAll(/typeform\.com\/to\/F22cAgx3#([^"]+)"/g)].map(match=>new URLSearchParams(match[1].replaceAll('&amp;','&')))
    const products=contexts.filter(context=>context.has('product_slug'))
    expect(products.length).toBeGreaterThanOrEqual(9)
    for(const context of products)expect(context.get('page_path')).toBe(`/product/${context.get('product_slug')}/`)
  })
  it('keeps the owner P0 routes on their own recovered hero foregrounds',()=>{
    const expected:Record<string,string>={'/drive-shafts-assembles/':'e32edc6a709644','/nozzles/':'a0f225bea07978','/motors/':'6121ee4805ca19'}
    for(const [target,prefix] of Object.entries(expected))expect(page(byPath(target)),target).toContain(`/media/salmon/${prefix}`)
  })
  it('gives the 183-product index the Salmon hero without dropping its catalog',()=>{
    const html=renderToStaticMarkup(<PartsIndex doc={byPath('/cooling-tower-parts-online/')}/>)
    expect(html).toContain('data-salmon-family="parts-index"')
    expect(html).toMatch(/sp-section--hero[\s\S]*?sp-photo/)
    expect(html).toContain('183 products')
    expect(count(html,/<h1\b/g)).toBe(1)
  })
})

describe('Projects portfolio and project detail',()=>{
  it('renders a grouped photographic portfolio that links every public project detail',()=>{
    const html=page(byPath('/all-projects/'))
    expect(html).toContain('data-salmon-family="project-portfolio"')
    expect(html).not.toContain('authority-project-list')
    for(const country of ['United states','Philippines','Thailand','Malaysia','Indonesia','Vietnam'])expect(html,country).toContain(country)
    expect(count(html,/sp-bg"|sp-media"|sp-media sp-media--panel/g)).toBeGreaterThanOrEqual(22)
    for(const row of projectDetails)expect(html,row.path).toContain(`href="${row.path}"`)
  })
  it('opens every project detail photo-first with title, year and compact fact cards',()=>{
    for(const row of projectDetails){
      const html=page(doc(row.routeId))
      const main=html.slice(html.indexOf('<main'))
      expect(main.indexOf('<img'),row.path).toBeGreaterThan(-1)
      expect(main.indexOf('<img'),row.path).toBeLessThan(main.indexOf('<h1'))
      expect(count(main,/class="sp-iconbox/g),row.path).toBeGreaterThanOrEqual(4)
      expect(main,row.path).not.toContain('project-detail-hero')
    }
  })
})

describe('Dry Soda route-specific Salmon authority',()=>{
  it('renders Dry Soda through its own Salmon family, not the six-service composition',()=>{
    const html=page(byPath('/dry-soda-blasting/'))
    expect(html).toContain('data-salmon-family="dry-soda"')
    expect(html).not.toContain('wave2-service')
    expect(html).not.toContain('english-service')
    expect(html).toMatch(/sp-section--hero[\s\S]*?sp-photo[\s\S]*?<h1/)
  })
  it('leaves the six accepted Figma service routes and five Figma compositions untouched',()=>{
    expect(englishServicePages()).toHaveLength(6)
    for(const service of englishServicePages()){const html=renderToStaticMarkup(<EnglishServicePage service={service}/>);expect(html).toContain('english-service-hero');expect(html).not.toContain('salmon-family')}
    for(const id of ['SALMON-pages-1446','SALMON-pages-1534','SALMON-pages-1555','SALMON-pages-1572','SALMON-pages-1668']){expect(luxuryIds.has(id)).toBe(true);expect(salmonFamilyFor(doc(id))).toBeUndefined();expect(renderToStaticMarkup(<LuxuryCanonical doc={doc(id)}/>)).toContain('wave2-service')}
    expect(serviceCompositions['SALMON-pages-1446']).toBeDefined()
  })
})

describe('Country, class and company presentations',()=>{
  it('restores the regional photo panel with a held Salmon background on all five country pages',()=>{
    for(const target of COUNTRY){const source=byPath(target),html=page(source);expect(html,target).toContain('data-salmon-family="country-service"');expect(html,target).toContain(cssBackground(source.routeId,'1fba171')!.sha256);expect(html,target).toMatch(/sp-photo/)}
  })
  it('keeps the component image prominent on all five class pages',()=>{
    for(const target of CLASSES){
      const html=page(byPath(target)),main=html.slice(html.indexOf('<main'))
      expect(html,target).toContain('data-salmon-family="component-class"')
      expect(main.indexOf('<img'),target).toBeGreaterThan(-1)
      expect(main.indexOf('<img'),target).toBeLessThan(main.indexOf('Overview'))
    }
  })
  it('renders Industries and Solutions as image-led capability sections',()=>{
    // Counted inside <main> only (footer logo/flags excluded); exact retained/withheld element IDs
    // are asserted in the R1.1.1 block below.
    for(const target of ['/industries/','/solutions/']){const html=page(byPath(target));expect(html,target).toContain('data-salmon-family="company-capability"');expect(count(mainOf(html),/<img\b/g),target).toBeGreaterThanOrEqual(2)}
  })
})

describe('P1 presentations keep their accepted function',()=>{
  it('About keeps the owner geography filter and presence module',()=>{
    const html=page(byPath('/about-ics/'))
    expect(html).toContain('data-salmon-family="about"')
    expect(html).not.toMatch(/Saudi Arabia is ICS’s newest regional office|registered company in the Kingdom of Saudi Arabia/)
    expect(html).toContain('Confirmed ICS presence')
  })
  it('library pages use their own held Salmon hero backgrounds and keep downloads',()=>{
    for(const id of ['SALMON-pages-1761','SALMON-pages-1797','SALMON-pages-1870']){const html=renderToStaticMarkup(<Wave4Library doc={doc(id)}/>);expect(html,id).toContain(cssBackground(id,'8f448f5')!.sha256);expect(html,id).toContain('wave4-document')}
    const articles=renderToStaticMarkup(<Wave4ArticleIndex doc={doc('SALMON-pages-1875')}/>)
    expect(articles).toContain('sp-articles-band')
    expect(articles).toContain('action="/search/"')
  })
})

describe('Global Salmon footer',()=>{
  it('follows the Salmon block hierarchy with current facts and functions only',()=>{
    const html=renderToStaticMarkup(<LuxuryFooter routePath="/nozzles/"/>)
    expect(html).toContain('data-footer-architecture="SALMON_FOOTER_R1"')
    for(const label of ['Let’s Build Efficient Industrial Cooling Systems','About ICS','Useful Links','Product Category','Phone'])expect(html,label).toContain(label)
    for(const office of contactOffices){expect(html).toContain(office.telephoneDisplay);expect(html).toContain(office.telephoneHref)}
    for(const forbidden of ['+66-2-260-6598','66-2-260-6598','c0060d855e27dfa01cb59100bba1dd217e2e6796d995aaa0e4ef4fa73d9b006c','Cooling Technology Institute','type="email"','Enter your email','English','Email Sequence'])expect(html,forbidden).not.toContain(forbidden)
    expect(html).toContain('typeform.com/to/F22cAgx3')
    expect(html).toContain('href="/contact-us/"')
    for(const href of ['/about-ics-industrial-cooling-solutions/','/all-projects/','/cooling-tower/','/cooling-tower-replacement/','/thermal-upgrade/','/cooling-tower-maintenance-repair-upgrade/','/disaster-recovery/','/dry-soda-blasting/','/air-coolers/','/cooling-tower-parts-online/','/cooling-tower-fan-stacks/','/fans/','/fill-media/','/drive-shafts-assembles/','/gear-box/','/motors/','/nozzles/','/frp-members/','/tower-hardware/','/tech-articles/','/cooling-tower-brochures/','/cooling-tower-resources/tools/','/resources/','/search/','/privacy-policy/'])expect(html,href).toContain(`href="${href}"`)
  })
})

describe('R1.1 bounded corrections (Control Tower review 2026-09-29)',()=>{
  it('V2: renders every project year as a readable non-interactive label, never a glass button',()=>{
    for(const row of projectDetails){
      const html=page(doc(row.routeId)),main=html.slice(html.indexOf('<main'))
      const model=salmonFamilyModel(doc(row.routeId),salmonFamilyFor(doc(row.routeId))!)
      const json=JSON.stringify(model)
      // Wherever the source carries a year, it is a label (one project has no year in source).
      if(/"type":"label","key":"[^"]+","text":"\d{4}/.test(json))expect(main,row.path).toMatch(/<span class="sp-label">\d{4}(?:[–-]\d{2,4})?<\/span>/)
      expect(main,row.path).not.toMatch(/sp-btn--(?:glass|pill|solid|outline) sp-btn--inert/)
      expect(json,row.path).not.toMatch(/"type":"button","key":"[^"]+","label":"\d{4}/)
    }
  })
  it('F1: project navigation and family quote requests use the approved adapter with genuine context',()=>{
    for(const row of projectDetails){
      const main=page(doc(row.routeId)).split('<main')[1]
      const nav=main.slice(main.indexOf('sp-project-next'))
      expect(nav,row.path).toContain(`typeform.com/to/F22cAgx3#page_path=${encodeURIComponent(row.path)}&amp;cta_placement=editorial_inline`)
      expect(nav,row.path).not.toMatch(/href="\/contact-us\/"[^>]*>Request a Quote/)
    }
    for(const id of salmonFamilyRouteIds()){
      const main=page(doc(id)).split('<main')[1]!.split('</main>')[0]!
      // Explicit quote requests never bypass the adapter; ordinary Contact links are allowed.
      expect(main,id).not.toMatch(/href="\/contact-us\/"[^>]*>(?:Request|Get)\b[^<]*\bQuote/i)
    }
  })
  it('C1: withholds the unsupported Industries testimony and the mismatched cards from render and model',()=>{
    const source=byPath('/industries/'),html=page(source),model=salmonFamilyModel(source,salmonFamilyFor(source)!)
    for(const text of ['Feedback','ICS cooling systems kept our plant running','exceeded our expectations','Chemical Plants','food safety','hostinger-ai-theme'])expect(html.slice(html.indexOf('<main')),text).not.toContain(text)
    expect(JSON.stringify(model.sections)).not.toContain('hostinger-ai-theme')
    // The three R1.1 exclusions are retained unchanged (R1.1.1 adds one more on this route).
    expect(model.exclusions.filter(item=>item.ruling.startsWith('CT_R1_REVIEW_2026_09_29_C1')).map(item=>item.elementId).sort()).toEqual(['11cbd29','f3b2417','f5dbc72'])
    expect(model.contractVersion).toBe('1.1.0')
  })
  it('V1: Parts heroes carry the Salmon foreground as a shaded, top-anchored cover panel',()=>{
    for(const target of PARTS){
      const html=page(byPath(target))
      expect(html,target).toMatch(/sp-media sp-media--panel sp-overlay--blue-fade"[^>]*background-size:cover;background-position:top center/)
    }
  })
  it('V3: the footer has exactly four desktop column blocks and keeps every destination',()=>{
    const html=renderToStaticMarkup(<LuxuryFooter routePath="/nozzles/"/>)
    const main=html.slice(html.indexOf('sp-footer-main'),html.indexOf('sp-footer-legal'))
    expect((main.match(/<(?:section|nav) class="sp-footer-(?:about|list|phone)/g)??[]).length).toBe(4)
    expect(main).toContain('<h3>Product Category</h3>')
    expect((main.slice(main.indexOf('sp-footer-category'),main.indexOf('sp-footer-phone')).match(/<a href=/g)??[]).length).toBe(17)
  })
})

/* ---------------- R1.1.1 bounded closeout (Control Tower review of R1.1, 2026-09-29) ---------------- */
type Json=unknown
const walk=(value:Json,visit:(node:Record<string,unknown>)=>void):void=>{if(Array.isArray(value))value.forEach(item=>walk(item,visit));else if(value&&typeof value==='object'){visit(value as Record<string,unknown>);Object.values(value).forEach(item=>walk(item,visit))}}
const modelOf=(source:SalmonDocument)=>salmonFamilyModel(source,salmonFamilyFor(source)!)
const containerIds=(model:ReturnType<typeof modelOf>)=>{const ids:string[]=[];walk(model.sections,node=>{if(typeof node.elementId==='string')ids.push(node.elementId)});return ids}
const TEN_QUOTE_ROUTES=[...PARTS,'/cooling-tower-parts-online/'].sort()
const renderRoute=(target:string)=>target==='/cooling-tower-parts-online/'?renderToStaticMarkup(<PartsIndex doc={byPath(target)}/>):page(byPath(target))
const typeformHref=(target:string)=>`typeform.com/to/F22cAgx3#page_path=${encodeURIComponent(target)}&amp;cta_placement=editorial_inline`
/** Source-year census taken from the frozen Salmon documents (button widgets), independent of the model. */
const SOURCE_YEARS:Record<string,string|null>={'bacman-1-2':'2011','cawayan-bacman-3':'2011','cooling-tower-disaster-recovery':null,'cooling-tower-replacement':'2012-13','edc-n2n-relocation-project':'2011','edc':'2018','empire-farms':'2011','kbr':'2015','keramasan-power-project':'2012','lanxess':'2011','mak-ban-6':'2008','palinpinon-2':'2012-13','palinpinon-3':'2012-13','patuha':'2011','pertonas-rapid':'2015','ptt-cracker-project':'2012','ptt-csp3':'2018','ptt-ldpe-ii-project':'2011','pttcsp':'2018','pvc-plant-freeport-texas':'2015','thailand-projects':'2012','vinachem':'2011'}

describe('R1.1.1 bounded closeout',()=>{
  it('A: withholds exactly the seven ruled elements from model and rendered main, keeping meaningful content',()=>{
    const expected:Record<string,{withheld:string[];kept:string[];text:string[];gone:string[]}>={
      '/industries/':{withheld:['11cbd29','cacba3b','f3b2417','f5dbc72'],kept:['36a0b95','ba864a0','64afe52'],text:['Our Promise','Power Plants','Data Centers'],gone:['Manufacturing','Chemical Plants','Feedback']},
      '/solutions/':{withheld:['4492d17','90732f5','9c34e97'],kept:['8b05dc1','694368d','76384ba','425a1bf'],text:['Power Plant','Chemical Plant','Custom Cooling','Stay Cool'],gone:['Data Center','Manufacturing']},
    }
    expect(SOURCE_EXCLUSIONS.length).toBe(7)
    for(const [target,rule] of Object.entries(expected)){
      const source=byPath(target),model=modelOf(source),main=mainOf(page(source)),ids=containerIds(model)
      expect(model.exclusions.map(item=>item.elementId).sort(),target).toEqual(rule.withheld)
      expect(model.exclusions.filter(item=>rule.withheld.includes(item.elementId)&&!['11cbd29'].includes(item.elementId)).every(item=>item.reason==='IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING'),target).toBe(true)
      for(const id of rule.withheld){expect(ids,`${target} model ${id}`).not.toContain(id);expect(main,`${target} main ${id}`).not.toContain(`data-salmon-element="${id}"`)}
      for(const id of rule.kept){expect(ids,`${target} model keeps ${id}`).toContain(id);expect(main,`${target} main keeps ${id}`).toContain(`data-salmon-element="${id}"`)}
      for(const text of rule.text)expect(main,`${target} keeps "${text}"`).toContain(text)
      for(const text of rule.gone)expect(main,`${target} withholds "${text}"`).not.toMatch(new RegExp(`>\\s*${text}\\s*<`))
      // No empty container is left behind by a withheld card.
      walk(model.sections,node=>{if(node.type==='container')expect((node.children as unknown[]).length,`${target} empty container ${String(node.key)}`).toBeGreaterThan(0)})
    }
  })
  it('D: source-year census — 22 project details, 21 source years rendered, the missing one not invented',()=>{
    expect(projectDetails.length).toBe(22)
    expect(Object.keys(SOURCE_YEARS).sort()).toEqual(projectDetails.map(row=>row.path.split('/')[2]).sort())
    expect(Object.values(SOURCE_YEARS).filter(Boolean).length).toBe(21)
    for(const row of projectDetails){
      const slug=row.path.split('/')[2]!,year=SOURCE_YEARS[slug]
      // The census is re-derived from the raw source, not from the candidate model.
      const sourceYears:string[]=[];walk(doc(row.routeId).children,node=>{const attrs=node.attrs as {class?:string}|undefined;if(attrs?.class?.includes('elementor-widget-button')){const text=salmonNodeText(node as SalmonNode).replace(/\s+/g,' ').trim();if(/^\d{4}(?:-\d{2,4})?$/.test(text))sourceYears.push(text)}})
      expect(sourceYears[0]??null,`${row.path} source`).toBe(year)
      const labels=[...mainOf(page(doc(row.routeId))).matchAll(/<span class="sp-label">([^<]+)<\/span>/g)].map(match=>match[1])
      if(year)expect(labels,row.path).toContain(year)
      else expect(labels.filter(label=>/\d{4}/.test(label!)),row.path).toEqual([])
    }
  })
  it('B: the ten component "Contact Us for a Quote" CTAs use the approved adapter with real page_path and editorial_inline',()=>{
    expect([...OWNER_QUOTE_LABELS]).toEqual(['contact us for a quote'])
    for(const target of TEN_QUOTE_ROUTES){
      const main=mainOf(renderRoute(target))
      const actions=[...main.matchAll(/<a [^>]*href="([^"]+)"[^>]*>Contact Us for a Quote<\/a>/g)].map(match=>match[1]!)
      expect(actions.length,target).toBe(1)
      expect(actions[0],target).toContain(typeformHref(target))
      expect(main,target).toMatch(/sp-btn-row sp-btn-row--rfq sp-btn-row--outline[^"]*"><span class="rfq rfq-signal" data-rfq-public-route="[^"]+" data-rfq-placement="editorial_inline">/)
      // Landing pages carry no fabricated product identity (product cards keep their own verified context).
      expect(actions[0],target).not.toMatch(/product_(?:slug|id)/)
    }
    // Exactly these ten routes carry the owner-classified label; nothing else was rewritten.
    const carriers=[...salmonFamilyRouteIds().map(id=>doc(id).targetPath),'/cooling-tower-parts-online/'].filter(target=>mainOf(renderRoute(target)).includes('>Contact Us for a Quote<')).sort()
    expect(carriers).toEqual(TEN_QUOTE_ROUTES)
  })
  it('B: the ten CTAs keep the adapter failure fallback to /contact-us/ with their own label',()=>{
    delete process.env.H2O_TYPEFORM_FORM_ID
    for(const target of TEN_QUOTE_ROUTES){
      const main=mainOf(renderRoute(target))
      expect(main,target).toContain('<a class="lux-button" href="/contact-us/">Contact Us for a Quote</a>')
      expect(main,target).not.toContain('typeform.com')
    }
  })
  it('B: ordinary Contact links in the families remain /contact-us/ links',()=>{
    let ordinary=0
    for(const id of salmonFamilyRouteIds()){
      const source=doc(id),model=modelOf(source),main=mainOf(page(source))
      walk(model.sections,node=>{
        if(node.type!=='button'||node.intent==='quote'||node.rfqOnly)return
        const label=String(node.label)
        if(!/contact/i.test(label)||node.href!=='/contact-us/')return
        ordinary++
        expect(main,`${source.targetPath} ${label}`).toMatch(new RegExp(`href="/contact-us/"[^>]*>${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}<`))
      })
    }
    expect(ordinary).toBeGreaterThan(0)
  })
})

describe('R1.1.2 Dry Soda phone hero',()=>{
  const SHA='3b4cd65dd5b87c0245c1314fe4ebf90c4e87dc40b05dc98e85cd5e0df5d4c214'
  it('crops the source letterbox bands on phones only, keyed to the hero photograph',()=>{
    const main=mainOf(page(byPath('/dry-soda-blasting/')))
    const hero=main.slice(0,main.indexOf('</section>'))
    expect(hero).toMatch(new RegExp(`<img class="sp-photo-img"[^>]*data-source-sha256="${SHA}"`))
    const css=readFileSync(path.join(process.cwd(),'src/app/(site)/salmon-families.css'),'utf8')
    const rule=css.slice(css.lastIndexOf('@media (max-width: 767.98px)'))
    expect(rule).toContain(`.sp-photo-img[data-source-sha256="${SHA}"]`)
    expect(rule).toMatch(/inset-block: -18\.58% auto;\s*block-size: 133\.69%;/)
    // Desktop/tablet rules never reference the file (the crop cannot leak to wider layouts).
    expect(css.split(SHA).length-1).toBe(1)
  })
})
