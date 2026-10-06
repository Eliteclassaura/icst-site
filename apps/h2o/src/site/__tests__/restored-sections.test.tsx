/**
 * Restored sections (content model change, owner + Control Tower 2026-10-05; SEO parity Part 2 R2). Typed blocks at explicit
 * anchors become ordinary page nodes: every template renders them once, the contents, search text and structured data see
 * them, and an anchor that does not resolve is refused, never appended.
 */
import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {renderToStaticMarkup} from 'react-dom/server'
import {composePublicDocument,type RouteRecord} from '../../content/compose'
import {applyRestoredSections,validateRestoredSections,type RestoredGroup} from '../../content/restored-sections'
import {publicBodyText} from '../../content/projection-text'
import {contentHashOf} from '../../content/collections/public-routes'
import {repairDocumentText} from '../text-repair'
import {salmonRoutes,liveRoutes,type SalmonDocument} from '../salmon'
import {articleTocLinks,matchedWave4Article} from '../wave4'
import {Wave4ArticleDetail,LiveEnglishDetail} from '../Wave4Presentation'
import {ArchivePage,isArchiveDocument} from '../ArchivePresentation'
import {PartsIndex,ProductDetail} from '../Wave3Presentation'
import {SalmonFamilyPage,salmonFamilyFor} from '../SalmonFamilies'
import {LuxuryCanonical,luxuryIds} from '../LuxuryCanonical'
import {SalmonCanonical} from '../SalmonCanonical'

const APP=process.cwd()
const restored=JSON.parse(readFileSync(path.join(APP,'ops/seo-pass/data/restored-sections.json'),'utf8')) as Record<string,{routeId:string;h1?:string;groups:RestoredGroup[]}>
const routes=[...salmonRoutes(),...liveRoutes()]
const source=(p:string)=>{const r=routes.find(x=>x.targetPath===p)!;return JSON.parse(readFileSync(path.join(APP,'content/salmon',r.file),'utf8')) as Record<string,unknown>&{routeId:string;title:string}}
const compose=(p:string,groups:RestoredGroup[]|null=restored[p]!.groups,title?:string):SalmonDocument=>{
  const document=source(p)
  const record={routeId:document.routeId,path:p,family:document.routeId.startsWith('LIVE-')?'live':'salmon',title:title??document.title,document,restoredSections:groups} as RouteRecord
  return repairDocumentText(composePublicDocument(record) as unknown as SalmonDocument)
}
/** The catch-all's dispatch order (src/app/(site)/[[...slug]]/page.tsx). */
const render=(doc:SalmonDocument)=>{
  const family=salmonFamilyFor(doc)
  const el=family?<SalmonFamilyPage doc={doc} config={family}/>:isArchiveDocument(doc)?<ArchivePage doc={doc}/>:doc.routeId.startsWith('LIVE-')?<LiveEnglishDetail doc={doc}/>:doc.targetPath==='/cooling-tower-parts-online/'?<PartsIndex doc={doc}/>:doc.type==='product'&&doc.routeId.startsWith('SALMON-product-')?<ProductDetail doc={doc}/>:matchedWave4Article(doc)?<Wave4ArticleDetail doc={doc}/>:luxuryIds.has(doc.routeId)?<LuxuryCanonical doc={doc}/>:<SalmonCanonical doc={doc}/>
  return renderToStaticMarkup(el)
}
const headingsOf=(groups:RestoredGroup[])=>groups.flatMap(g=>g.blocks).flatMap(b=>b.blockType==='restoredHeading'?[b.text]:[])
const count=(html:string,text:string)=>html.split(text.replace(/&/g,'&amp;')).length-1

describe('restored-sections batch data',()=>{
  it('carries the 19 pages decided by OGCS R1.2 and the 4 F1 product panels (CT 2026-10-05), every anchor resolving on the imported page',()=>{
    expect(Object.keys(restored)).toHaveLength(23)
    for(const [p,page] of Object.entries(restored)){
      const document=source(p)
      expect(page.routeId,p).toBe(document.routeId)
      expect(validateRestoredSections(document,page.groups),p).toEqual([])
    }
  })
  it('never carries the wrong company name, contact details or commerce wording; prices only on the cost article',()=>{
    for(const [p,page] of Object.entries(restored)){
      const text=JSON.stringify(page.groups)
      expect(text,p).not.toMatch(/international\s+cooling\s+solutions|industrail|@[a-z0-9-]+\.[a-z]{2,}|buy now|order online|add to cart|price list/i)
      if(p!=='/cooling-tower-replacement-cost/')expect(text,p).not.toMatch(/\$\s?\d/)
    }
    // Cost ranges read as market guidance, never as ICS prices.
    expect(JSON.stringify(restored['/cooling-tower-replacement-cost/']!.groups)).toMatch(/not (?:an )?ICS price/)
  })
})

describe('every template renders restored sections exactly once',()=>{
  const cases=['/cooling-tower-efficiency-calculation/','/cooling-tower-blowdown-calculation/','/cooling-tower-approach/','/chiller-and-cooling-tower/','/product-category/gearboxes/','/product/addax-drive-shaft-composite-coupling-lrx650-625/','/cooling-tower-malaysia/','/air-coolers/','/cooling-tower-parts-online/']
  for(const p of cases)it(p,()=>{
    const doc=compose(p,restored[p]!.groups,restored[p]!.h1)
    const html=render(doc)
    for(const heading of headingsOf(restored[p]!.groups))expect(count(html,heading),`${p}: ${heading}`).toBe(1)
    // Search indexes the composed document's public text: restored text is part of it.
    const first=headingsOf(restored[p]!.groups)[0]
    if(first)expect(publicBodyText('salmon',doc as unknown as Record<string,unknown>)).toContain(first)
    // One BreadcrumbList still.
    expect(html.match(/"BreadcrumbList"/g)??[]).toHaveLength(1)
  },60000)
})

describe('placement',()=>{
  it('after-section lands after the whole anchor section, and the contents list it in document order',()=>{
    const doc=compose('/cooling-tower-efficiency-calculation/')
    const html=render(doc)
    const at=(t:string)=>html.indexOf(t)
    expect(at('Cooling Tower Heat Rejection Calculation')).toBeGreaterThan(at('Example Cooling Tower Efficiency Calculation'))
    expect(at('Cooling Tower Heat Rejection Calculation')).toBeLessThan(at('What Affects Cooling Tower Efficiency?'))
  })
  it('an article with a source table of contents lists restored H2s in document order',()=>{
    const route=routes.find(r=>{try{return readFileSync(path.join(APP,'content/salmon',r.file),'utf8').includes('wp-block-rank-math-toc-block')}catch{return false}})!
    const plain=compose(route.targetPath,null)
    const before=articleTocLinks(plain)
    expect(before.length).toBeGreaterThan(1)
    const anchor=before[0]!.label
    const doc=compose(route.targetPath,[{mode:'after-section',anchor,blocks:[{blockType:'restoredHeading',text:'Restored Probe Section',level:'2'}]}])
    const toc=articleTocLinks(doc).map(link=>link.label)
    expect(toc.indexOf('Restored Probe Section')).toBe(toc.indexOf(anchor)+1+toc.slice(toc.indexOf(anchor)+1).findIndex(label=>label==='Restored Probe Section'))
    expect(toc.indexOf('Restored Probe Section')).toBeGreaterThan(toc.indexOf(anchor))
    expect(toc.indexOf('Restored Probe Section')).toBeLessThan(toc.indexOf(before[1]!.label))
  })
  it('replace-body serves the live ranking body and H1 at the winner URL, without the staging version',()=>{
    const doc=compose('/cooling-tower-fill-media-replacement/',restored['/cooling-tower-fill-media-replacement/']!.groups,restored['/cooling-tower-fill-media-replacement/']!.h1)
    const html=render(doc)
    expect(html).toContain('<h1>Cooling Tower Fill Media Replacement: Protocol &amp; Diagnosis</h1>')
    expect(html).not.toContain('2026 Diagnostic: 5 Signs Your Fill Media Has Failed')
    for(const heading of headingsOf(restored['/cooling-tower-fill-media-replacement/']!.groups).slice(0,3))expect(html).toContain(heading.replace(/&/g,'&amp;'))
  })
  it('the restored product description replaces the held placeholder panels',()=>{
    const html=render(compose('/product/addax-drive-shaft-composite-coupling-lrx650-625/'))
    expect(html).toContain('data-restored-slot-render="description"')
    expect(html).not.toMatch(/Flow rate: 10/)
  })
})

describe('anchors are explicit: unknown anchors are refused, never appended',()=>{
  const doc=source('/cooling-tower-efficiency-calculation/')
  const block=[{blockType:'restoredHeading' as const,text:'Probe section',level:'2' as const}]
  it('validation names every unresolvable group',()=>{
    expect(validateRestoredSections(doc,[{mode:'after-section',anchor:'No Such Heading',blocks:block}])[0]).toMatch(/anchor heading not found/)
    expect(validateRestoredSections(doc,[{mode:'template-slot',anchor:'sidebar',blocks:block}])[0]).toMatch(/unknown template slot/)
    expect(validateRestoredSections(doc,[{mode:'replace-body',anchor:'Cooling Tower Efficiency Formula',blocks:block}])[0]).toMatch(/not the first heading/)
    const external={blockType:'restoredParagraph' as const,content:{root:{type:'root',children:[{type:'paragraph',children:[{type:'link',fields:{url:'https://example.com/',newTab:false,linkType:'custom'},children:[{type:'text',text:'x',format:0}]}]}]}}} as never
    expect(validateRestoredSections(doc,[{mode:'before-heading',anchor:'Conclusion',blocks:[external]}]).join()).toMatch(/internal path/)
  })
  it('composition skips a group it cannot place',()=>{
    const out=applyRestoredSections(doc,[{mode:'after-section',anchor:'No Such Heading',blocks:block}])
    expect(JSON.stringify(out)).not.toContain('Probe section')
  })
})

describe('publication: restored sections are content',()=>{
  it('change the content hash only when present (existing records keep their hash)',()=>{
    const base={title:'T',seo:null,document:{a:1},slots:null,lead:null,sections:null,disposition:{state:'PUBLIC'},path:'/x/'}
    expect(contentHashOf({...base,restoredSections:[]})).toBe(contentHashOf(base))
    expect(contentHashOf({...base,restoredSections:[{mode:'template-slot',anchor:'intro',blocks:[]}]})).not.toBe(contentHashOf(base))
  })
})
