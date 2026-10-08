/**
 * OGCS project titles (CT accepted 2026-10-08, PROJECT_TITLES.tsv ac24774d), presentation part: Freeport, Texas and Nevada are
 * places in the United States, not country groups; Singapore gets a chip; location lines; every registered project card still maps.
 */
import {describe,expect,it} from 'vitest'
import {portfolioView} from '../r4/R4Portfolio'
import {salmonFamilyFor,salmonFamilyModel} from '../salmon-family-adapter'
import {salmonDocument,salmonRoutes} from '../salmon'
import {projectMediaRegistry} from '../project-media'

const view=()=>{const doc=salmonDocument(salmonRoutes().find(r=>r.routeId==='SALMON-pages-1353')!);return portfolioView(salmonFamilyModel(doc,salmonFamilyFor(doc)!))}

describe('/all-projects/ grouping after the OGCS project titles',()=>{
  it('no Texas or Nevada section remains; their cards sit under the United States section with location lines',()=>{
    const v=view()
    expect(v.countries.map(c=>c.anchor)).not.toContain('texa')
    expect(v.countries.map(c=>c.anchor)).not.toContain('neva')
    const usa=v.countries.find(c=>c.anchor==='usa')!
    const hrefs=usa.cards.map(c=>c.href)
    expect(hrefs).toEqual(expect.arrayContaining(['/all-projects/kbr/','/all-projects/pvc-plant-freeport-texas/','/all-projects/empire-farms/']))
    const loc=(h:string)=>usa.cards.find(c=>c.href===h)!.location
    expect(loc('/all-projects/pvc-plant-freeport-texas/')).toBe('Freeport, Texas, USA')
    expect(loc('/all-projects/empire-farms/')).toBe('Nevada, USA')
    expect(loc('/all-projects/kbr/')).toBe('United States')
  })
  it('Singapore has a section whose card carries its location line, and a chip that links to it',()=>{
    const v=view()
    const sg=v.countries.find(c=>c.cards.some(card=>card.href==='/all-projects/lanxess/'))!
    expect(sg.cards.find(c=>c.href==='/all-projects/lanxess/')!.location).toBe('Jurong Island, Singapore')
    const chip=v.chips.find(c=>c.href==='#'+sg.anchor)
    expect(chip,'a chip for the Singapore section').toBeTruthy()
    expect(v.chips.map(c=>c.label)).toContain(sg.heading)
  })
  it('every chip anchor exists as a section; every registered project still has exactly one card',()=>{
    const v=view()
    const anchors=new Set(v.countries.map(c=>c.anchor))
    for(const c of v.chips)expect(anchors.has(c.href.slice(1)),c.href).toBe(true)
    const cards=v.countries.flatMap(c=>c.cards.map(card=>card.href))
    for(const p of Object.keys(projectMediaRegistry().projects))expect(cards.filter(h=>h===p),p).toHaveLength(1)
  })
})
