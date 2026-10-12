/** FBG-CODE-1 (OGCS audit fix-before-go, CT 2026-10-11): FBG-03 About caption, FBG-06 Parts category labels, FBG-10 repair-page caption, FBG-11 product attribute table. */
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import {ATTRIBUTE_LABELS,sortAttributeValues,tidyAdditionalInfo} from '../product-attributes'
import {PARTS_CATEGORY_LABELS,partsCategories,productPanels} from '../Wave3Products'
import {salmonDocument,salmonNodeText,salmonRoutes,type SalmonNode} from '../salmon'

const env={...process.env}
beforeEach(()=>{process.env.H2O_PUBLIC_EXPORT='1'})
afterEach(()=>{process.env={...env}})
const render=async(p:string)=>renderToStaticMarkup(await Page({params:Promise.resolve({slug:p.split('/').filter(Boolean)}),searchParams:Promise.resolve({})}))
type El={tag:string;attrs:Record<string,string>;children:SalmonNode[]}
const el=(tag:string,children:SalmonNode[],attrs:Record<string,string>={}):El=>({tag,attrs,children})
const row=(label:string,value:string)=>el('tr',[el('th',[label]),el('td',[el('p',[value])])])
const cells=(nodes:SalmonNode[]):string[]=>{const out:string[]=[];const walk=(n:SalmonNode)=>{if(typeof n==='string')return;if(n.tag==='th'||n.tag==='td')out.push(salmonNodeText(n).trim());else n.children.forEach(walk)};nodes.forEach(walk);return out}
const text=(nodes:SalmonNode[])=>cells(nodes).join('|')
const links=(...values:string[]):El[]=>values.flatMap((v,i)=>[...(i?[', ' as unknown as El]:[]),el('a',[v])])

describe('FBG-11: product Additional information',()=>{
  it('value lists sort ascending by number; a mixed list keeps its text values after the numbers; one value or no number is unchanged',()=>{
    expect(sortAttributeValues('10,\u00a011,\u00a012,\u00a06,\u00a07,\u00a08,\u00a09')).toBe('6, 7, 8, 9, 10, 11, 12')
    expect(sortAttributeValues('4, 5, 6, 7, 8, 9, 10, 11, 12')).toBe('4, 5, 6, 7, 8, 9, 10, 11, 12')
    expect(sortAttributeValues('30 ft, 20 ft, 22 ft, 9 ft')).toBe('9 ft, 20 ft, 22 ft, 30 ft')
    expect(sortAttributeValues('12, Custom, 6, 9, Special order')).toBe('6, 9, 12, Custom, Special order')
    expect(sortAttributeValues('Crossflow')).toBe('Crossflow')
    expect(sortAttributeValues('TECO / Westinghouse')).toBe('TECO / Westinghouse')
    expect(sortAttributeValues('Counterflow, Crossflow')).toBe('Counterflow, Crossflow') // no numbers: as is
  })
  it('the four attribute slugs read as labels; other labels, brand values and links are untouched; the same array comes back when nothing changes',()=>{
    const table=[el('table',[row('brand','Hudson'),row('diameters','20 ft, 9 ft'),row('tower-type','Crossflow'),row('number-of-blades','10, 6, 8'),row('Other','b, a')])]
    const out=tidyAdditionalInfo(table)
    expect(text(out)).toBe('Brand|Hudson|Diameters|9 ft, 20 ft|Tower type|Crossflow|Number of blades|6, 8, 10|Other|b, a')
    expect(Object.values(ATTRIBUTE_LABELS)).toEqual(['Brand','Diameters','Tower type','Number of blades'])
    const clean=[el('table',[row('Brand','Hudson'),row('Weight','1, 2')])]
    expect(tidyAdditionalInfo(clean)).toBe(clean)
    // the real markup: a value cell of attribute links (no href after the link adapter) separated by ", " text nodes
    const real=[el('table',[el('tr',[el('th',['number-of-blades']),el('td',links('10','11','12','6','7','8','9'))])])]
    const sorted=tidyAdditionalInfo(real)
    expect(text(sorted)).toBe('Number of blades|6, 7, 8, 9, 10, 11, 12')
    const mixed=[el('table',[el('tr',[el('th',['diameters']),el('td',links('26 ft','Custom','9 ft','20 ft'))])])]
    expect(text(tidyAdditionalInfo(mixed))).toBe('Diameters|9 ft, 20 ft, 26 ft, Custom')
    const inOrder=[el('table',[el('tr',[el('th',['Diameters']),el('td',links('9 ft','20 ft'))])])]
    expect(tidyAdditionalInfo(inOrder)).toBe(inOrder)
  })
  it('a TUF-LITE page, a Howden page and a brand-only page render labelled, sorted tables',async()=>{
    const tuf=await render('/product/tuf-lite-iii-5000k-series-hub-fan-assemblies/')
    expect(tuf).toContain('Number of blades')
    const plain=tuf.replace(/<[^>]+>/g,'')
    expect(plain).toContain('6, 7, 8, 9, 10, 11, 12')
    expect(plain).not.toContain('number-of-blades')
    expect(plain).not.toMatch(/10,[\s\u00a0]*11,[\s\u00a0]*12,[\s\u00a0]*6/)
    const howden=await render('/product/howden-pro-d-series-26-36-7-93m-10-98m-fans/')
    expect(howden).toMatch(/Brand/)
    expect(howden).not.toMatch(/>(?:brand|diameters|tower-type|number-of-blades)</)
    const brandOnly=await render('/product/baldor-motor/')
    expect(brandOnly).not.toMatch(/>brand</)
  },300000)
  it('across every product page: no Additional information panel carries a raw attribute slug, and no value list is out of order',()=>{
    let panels=0
    for(const route of salmonRoutes().filter(r=>/^SALMON-product-\d+$/.test(r.routeId))){
      const doc=salmonDocument(route)
      for(const panel of productPanels(doc).filter(p=>p.kind==='additional')){
        panels++
        const rows:string[][]=[]
        const walk=(n:SalmonNode)=>{if(typeof n==='string')return;if(n.tag==='tr'){const cells=n.children.filter((c):c is El=>typeof c!=='string'&&(c.tag==='th'||c.tag==='td')).map(c=>salmonNodeText(c).trim());rows.push(cells)}n.children.forEach(walk)}
        panel.nodes.forEach(walk)
        for(const [label,value] of rows){
          expect(Object.keys(ATTRIBUTE_LABELS),`${route.targetPath} ${label}`).not.toContain(label)
          if(value)expect(sortAttributeValues(value.replace(/\u00a0/g,' ')),`${route.targetPath} ${label}`).toBe(value.replace(/\u00a0/g,' ').replace(/,\s*/g,', '))
        }
      }
    }
    expect(panels).toBeGreaterThan(150)
  },300000)
})

describe('FBG-03 / FBG-10 / FBG-06: captions and category labels',()=>{
  it('FBG-03: the About video caption is "A cooling tower rebuilt cell by cell on site." (no duration, no narration note)',async()=>{
    const html=await render('/about-ics/')
    expect(html).toContain('>A cooling tower rebuilt cell by cell on site.<')
    expect(html).not.toMatch(/28 seconds|no narration/)
  })
  it('FBG-10: the six repair pages carry "Typical decision path. The scope for your tower is confirmed after inspection." and no placeholder caption',async()=>{
    for(const p of ['/crossflow-cooling-tower-repair-maintenance/','/counterflow-cooling-tower-repair-maintenance/','/wet-hybrid-dry-cooling-tower-repair/','/low-drift-cooling-tower-solutions/','/emergency-cooling-tower-repair/','/cooling-tower-rebuilds-new-towers/']){
      const html=await render(p)
      expect(html,p).toContain('Typical decision path. The scope for your tower is confirmed after inspection.')
      expect(html,p).not.toMatch(/Illustrative operating|Confirm the arrangement on the installed tower/)
    }
  })
  it('FBG-06: the Parts hub category chips read Fan Stacks, Drive Shafts & Assemblies, Fill Media, FRP Members, Gearboxes, Nozzles, Tower Hardware',()=>{
    const hub=salmonDocument(salmonRoutes().find(r=>r.targetPath==='/cooling-tower-parts-online/')!)
    const cats=partsCategories(hub)
    for(const [href,label] of Object.entries(PARTS_CATEGORY_LABELS))expect(cats.find(c=>c.href===href)?.label,href).toBe(label)
    expect(cats.map(c=>c.label).join('|')).not.toMatch(/FAN STACKS|ASSEMBLES|GEAR BOX|Cooling Tower FAN/)
  })
})
