/**
 * Design R5a (CT GO 2026-10-07): the parts hub, the parts category and series templates and the product detail on the
 * R4 system. Source text only; URL, title, H1 and meta unchanged; link sets per page as recorded in the R5a evidence.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {salmonFamilyFor,salmonFamilyModel} from '../salmon-family-adapter'
import {PartsIndex} from '../Wave3Presentation'
import {partsCategories,productIndexRecords,productPanels} from '../Wave3Products'
import {R5PartsFamilyPage,R5_PARTS_FAMILIES,partsChips} from '../r5/R5PartsPages'
import {R5ProductDetail,R5_GALLERY_WITHHELD,productGallery,specTable} from '../r5/R5Product'
import {salmonDocument,salmonRoutes,type SalmonDocument} from '../salmon'
import {pageText} from '../../../ops/seo-pass/claims-text.mjs'

const APP=path.resolve(__dirname,'../../..')
const byPath=(target:string):SalmonDocument=>salmonDocument(salmonRoutes().find(route=>route.targetPath===target)!)
const mainOf=(html:string)=>html.slice(html.indexOf('<main'),html.indexOf('</main>'))
const textOf=(html:string)=>html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
const PARTS=['/cooling-tower-fan-stacks/','/drive-shafts-assembles/','/fans/','/fill-media/','/frp-members/','/gear-box/','/motors/','/nozzles/','/tower-hardware/']
const CLASSES=['/class-1000/','/class-10000-heavy-duty-standard-chord/','/class-10000-minimum-acoustic-geometry/','/class-10000-xc/','/class-20000/']
const HUB='/cooling-tower-parts-online/'
const env={id:process.env.H2O_TYPEFORM_FORM_ID,origin:process.env.H2O_TYPEFORM_ORIGIN,exp:process.env.H2O_PUBLIC_EXPORT}
beforeEach(()=>{process.env.H2O_TYPEFORM_FORM_ID='F22cAgx3';process.env.H2O_TYPEFORM_ORIGIN='https://form.typeform.com'})
afterEach(()=>{for(const [key,value] of [['H2O_TYPEFORM_FORM_ID',env.id],['H2O_TYPEFORM_ORIGIN',env.origin],['H2O_PUBLIC_EXPORT',env.exp]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value}})

describe('R5a parts category and series templates',()=>{
  it('covers exactly the 9 category and 5 series routes; the editorial pages keep their template',()=>{
    for(const target of PARTS)expect(salmonFamilyFor(byPath(target))?.family,target).toBe('parts-landing')
    for(const target of CLASSES)expect(salmonFamilyFor(byPath(target))?.family,target).toBe('component-class')
    expect([...R5_PARTS_FAMILIES].sort()).toEqual(['component-class','parts-landing'])
    for(const target of ['/cooling-tower-spares/','/fans/moore-fans/'])expect(R5_PARTS_FAMILIES.has(salmonFamilyFor(byPath(target))!.family),target).toBe(false)
  })
  it('renders one H1 with the source H1 and every source heading, in order and at its level',()=>{
    for(const target of [...PARTS,...CLASSES]){
      const doc=byPath(target)
      const model=salmonFamilyModel(doc,salmonFamilyFor(doc)!)
      const main=mainOf(renderToStaticMarkup(<R5PartsFamilyPage doc={doc}/>))
      expect(main,target).toContain('class="dr4 r5"')
      expect((main.match(/<h1\b/g)??[]).length,target).toBe(1)
      const rendered=[...main.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m=>`${m[1]} ${textOf(m[2]!).trim()}`).filter(h=>!/^h3 /.test(h)&&!(target==='/fans/'&&h==='h2 Fans by brand')) // CLIENT-FIX-1: the Fans by brand tiles are the one added heading (not source copy)
      const source:string[]=[]
      const walk=(b:{type:string;level?:number;text?:Array<{text:string}>;children?:unknown[]}):void=>{if(b.type==='heading'&&b.level!<=2)source.push(`h${b.level} ${b.text!.map(t=>t.text).join('').replace(/\s+/g,' ').trim()}`);(b.children as typeof b[]|undefined)?.forEach(walk)}
      model.sections.forEach(section=>walk(section.root as never))
      expect(rendered,target).toEqual(source)
    }
  },120000)
  it('the chip row is the hub category links (same href and label), All Parts first, the current page marked',()=>{
    const hub=partsCategories(byPath(HUB))
    expect(partsChips()).toEqual([{href:HUB,label:'All Parts'},...hub])
    for(const target of PARTS){
      const main=mainOf(renderToStaticMarkup(<R5PartsFamilyPage doc={byPath(target)}/>))
      const chips=main.slice(main.indexOf('<nav class="r5-chips"'),main.indexOf('</nav>',main.indexOf('<nav class="r5-chips"')))
      expect([...chips.matchAll(/<a href="([^"]+)"/g)].map(m=>m[1])).toEqual(partsChips().map(c=>c.href))
      expect(chips,target).toContain(`<a href="${target}" aria-current="page">`)
    }
  })
  it('OGCS addendum (a): "Contact for pricing" is the quote action "Request a quote"; no Contact link replaces it',()=>{
    for(const target of PARTS){
      const main=mainOf(renderToStaticMarkup(<R5PartsFamilyPage doc={byPath(target)}/>))
      expect(main,target).not.toMatch(/Contact for pricing/i)
      expect(main,target).toMatch(/r5-note-action[\s\S]*?data-rfq-placement="editorial_inline"[\s\S]*?>Request a quote</)
    }
  })
  it('series pages show one render (the first source image) and every key-feature and application line',()=>{
    for(const target of CLASSES){
      const doc=byPath(target)
      const main=mainOf(renderToStaticMarkup(<R5PartsFamilyPage doc={doc}/>))
      expect((main.match(/<img\b/g)??[]).length,target).toBe(1)
      const model=salmonFamilyModel(doc,salmonFamilyFor(doc)!)
      const items:string[]=[]
      const walk=(b:{type:string;items?:Array<{text:Array<{text:string}>}>;children?:unknown[]}):void=>{if(b.type==='list')b.items!.forEach(i=>items.push(i.text.map(t=>t.text).join('').trim()));(b.children as typeof b[]|undefined)?.forEach(walk)}
      model.sections.forEach(section=>walk(section.root as never))
      for(const item of items)expect(textOf(main),`${target} ${item}`).toContain(item.replace(/\s+/g,' '))
    }
  })
})

describe('R5a parts hub',()=>{
  it('keeps the static catalog hooks (183 cards, search, count, pagination, empty state) and one H1',()=>{
    process.env.H2O_PUBLIC_EXPORT='1'
    const html=renderToStaticMarkup(<PartsIndex doc={byPath(HUB)}/>)
    expect((html.match(/data-static-product="/g)??[]).length).toBe(183)
    for(const hook of ['class="wave3-catalog"','id="wave3-query"','class="wave3-pagination"','data-static-parts-empty','183 products'])expect(html,hook).toContain(hook)
    expect((mainOf(html).match(/<h1\b/g)??[]).length).toBe(1)
  },120000)
  it('renders the hub\'s own source renders at or below their caps (hero 460 per DD R5A.1 P1, intro 420, why 520, copy 420)',()=>{
    const main=mainOf(renderToStaticMarkup(<PartsIndex doc={byPath(HUB)}/>))
    const sizes=[...main.matchAll(/style="inline-size:min\(100%, (\d+)px\)"[^>]*width="(\d+)"/g)].map(m=>[Number(m[1]),Number(m[2])])
    expect(sizes.length).toBe(4)
    for(const [shown,native] of sizes)expect(shown).toBeLessThanOrEqual(native!)
    expect(sizes.map(s=>s[0])).toEqual([460,420,520,420])
  })
})

describe('R5a product detail',()=>{
  it('no product renders a price, an Offer or a Product JSON-LD',()=>{
    for(const {doc} of productIndexRecords()){
      const html=renderToStaticMarkup(<R5ProductDetail doc={doc}/>)
      expect(textOf(mainOf(html)),doc.targetPath).not.toMatch(/[$€£]\s*\d/)
      for(const json of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g))expect(json[1],doc.targetPath).not.toMatch(/"@type":"(Product|Offer|AggregateOffer)"/)
    }
  },120000)
  it('the spec table: label rows, price lines withheld, unlabelled lines kept as a list',()=>{
    const frp=byPath('/product/frp-angles/')
    const frpTable=specTable(frp,productPanels(frp).find(p=>p.kind==='specifications')!.nodes)
    expect(frpTable.rows.map(r=>r.labelText)).toEqual(['Product Type','Material','Profile Shape','Manufacturing Process','Standard Style','Available Thickness','Available Size','Available Size','Available Size','Custom Options'])
    expect(frpTable.report.price).toHaveLength(3)
    const gear=byPath('/product/amarillo-a-series-single-reduction-gearbox/')
    const gearTable=specTable(gear,productPanels(gear).find(p=>p.kind==='specifications')!.nodes)
    expect(gearTable.rows.map(r=>[r.labelText,r.values.length])).toEqual([['Model',1]])
    expect(gearTable.report.listed.length).toBeGreaterThan(5)
    const main=mainOf(renderToStaticMarkup(<R5ProductDetail doc={gear}/>))
    expect(main).toMatch(/<th scope="row">Model<span class="r5-visually-hidden" aria-hidden="true">:<\/span><\/th>/)
    // the claims read-back text of a row is unchanged: "Label: value"
    expect(pageText(main)).toContain('Model: A Series Single Reduction Gearbox')
    expect(main).toContain('class="r5-spec-notes"')
  })
  it('keeps the RFQ with product context and the owner-kept "Ask an engineer" pill to Contact',()=>{
    const main=mainOf(renderToStaticMarkup(<R5ProductDetail doc={byPath('/product/baldor-motor/')}/>))
    expect(main).toContain('<a class="r5-ghost-pill wave3-contact-link" href="/contact-us/">Ask an engineer</a>')
    expect(main).toMatch(/r5-product-actions[\s\S]*?class="rfq/)
  })
  it('the gallery is the product\'s own source images, once each, withheld files excluded',()=>{
    for(const {doc} of productIndexRecords()){
      const gallery=productGallery(doc)
      expect(new Set(gallery.map(g=>g.sha256)).size,doc.targetPath).toBe(gallery.length)
      for(const image of gallery)expect(R5_GALLERY_WITHHELD.has(image.sha256),doc.targetPath).toBe(false)
    }
    expect(productGallery(byPath('/product/addax-drive-shaft-composite-coupling-lrr450-275/')).some(g=>g.sha256.startsWith('a5acc497'))).toBe(false)
  },120000)
})

describe('R5a stylesheet',()=>{
  const css=readFileSync(path.join(APP,'src/app/(site)/design-r5.css'),'utf8')
  it('colours are tokens, logical properties only',()=>{
    for(const line of css.split('\n').filter(l=>/^\s*(color|background(-color)?|border(-[a-z-]+)?|outline|box-shadow)\s*:/.test(l)))expect(line,line).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
    expect(css).not.toMatch(/\b(margin|padding)-(left|right|top|bottom)\s*:|\b(top|left|right|bottom)\s*:/)
  })
  it('at 390 the chip row scrolls and the spec table stacks',()=>{
    expect(css).toMatch(/@media \(width < 768px\) \{\s*\.r5 \.r5-chips \{[^}]*overflow-x: auto;/)
    expect(css).toMatch(/@media \(width < 600px\) \{\s*\.r5 \.r5-spec-table,[^{]*\{\s*display: block;/)
  })
})
