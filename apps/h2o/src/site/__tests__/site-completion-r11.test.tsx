import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {LuxuryFooter,LuxuryHeader} from '../LuxuryShell'
import {LuxuryCanonical} from '../LuxuryCanonical'
import {serviceCompositions} from '../ServiceComposition'
import {reconcileCommercialScope} from '../SalmonCanonical'
import {salmonDocument,salmonRoutes} from '../salmon'

const documentFor=(id:string)=>salmonDocument(salmonRoutes().find(route=>route.routeId===id)!)

describe('site completion R1.1 boundaries',()=>{
  it('keeps the full-color header and puts the approved white identity plus exact CTI source in the footer',()=>{
    const header=renderToStaticMarkup(<LuxuryHeader/>),footer=renderToStaticMarkup(<LuxuryFooter/>)
    expect(header).toContain('/media/luxury/ics-logo-original.webp')
    expect(footer).toContain('/media/luxury/ics-logo-white-transparent.png')
    expect(footer).not.toContain('/media/luxury/ics-logo-original.webp')
    expect(footer).toContain('c0060d855e27dfa01cb59100bba1dd217e2e6796d995aaa0e4ef4fa73d9b006c.png')
    expect(footer).toContain('CTI member')
    for(const label of ['Services','Parts &amp; Resources','Company','Offices','Privacy Policy'])expect(footer).toContain(label)
  })
  it('removes only the misleading Air Coolers hero photograph',()=>{
    expect(serviceCompositions['SALMON-pages-1668'].inside[1]).toBeUndefined()
    const html=renderToStaticMarkup(<LuxuryCanonical doc={documentFor('SALMON-pages-1668')}/>)
    expect(html).toContain('data-air-cooler-hero="TYPE_LED"')
    expect(html).not.toContain('figma-image-d01e70f05845e3dd.png')
    expect(html).toContain('High-Performance Industrial Air Cooler Solutions')
  })
  it('preserves the exact Salmon homepage Parts intro word boundary',()=>{
    const html=renderToStaticMarkup(<LuxuryCanonical doc={documentFor('SALMON-pages-48')}/>)
    expect(html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ')).toContain('ready to ship. Reliable')
    expect(html).not.toContain('ship.Reliable')
  })
  it('removes business-scope positioning but labels product compatibility',()=>{
    const product=documentFor('SALMON-product-4779')
    expect(reconcileCommercialScope(product,'Commercial HVAC cooling towers')).toBe('Product compatibility: commercial HVAC cooling towers')
    expect(reconcileCommercialScope(product,'HVAC and Industrial Cooling Towers')).toBe('HVAC and Industrial Cooling Towers')
    const article=documentFor('SALMON-posts-3815')
    expect(reconcileCommercialScope(article,'HVAC thermal capacity')).toBe('HVAC thermal capacity')
  })
})
