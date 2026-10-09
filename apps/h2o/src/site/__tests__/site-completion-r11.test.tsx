import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup as renderMarkup} from 'react-dom/server'
import {physicalHtml} from './physical-html'
import {LuxuryFooter,LuxuryHeader} from '../LuxuryShell'
import {LuxuryCanonical} from '../LuxuryCanonical'
import {serviceCompositions} from '../ServiceComposition'
import {reconcileCommercialScope} from '../SalmonCanonical'
import {salmonDocument,salmonRoutes} from '../salmon'
import {contactOffices} from '../contact'
const renderToStaticMarkup=(...args:Parameters<typeof renderMarkup>)=>physicalHtml(renderMarkup(...args))

const documentFor=(id:string)=>salmonDocument(salmonRoutes().find(route=>route.routeId===id)!)

describe('site completion R1.1 boundaries',()=>{
  it('uses the current Homepage-authoritative logo and footer with owner contact facts',()=>{
    const header=renderToStaticMarkup(<LuxuryHeader routePath="/"/>),footer=renderToStaticMarkup(<LuxuryFooter routePath="/"/>)
    expect(header).toContain('/media/salmon/a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png')
    expect(header).not.toContain('salmon-header-language')
    expect(header).toContain('lux-header-rfq')
    expect(footer).toContain('salmon-parity-footer')
    expect(footer).toContain('a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png')
    // Owner decision 2026-10-02 (Control Tower ruling): CTI appears only as the membership badge below About ICS; ICS stays the footer identity.
    expect(footer.replace(/<div class="sp-footer-cti"><img [^>]*><\/div>/,'')).not.toContain('c0060d855e27dfa01cb59100bba1dd217e2e6796d995aaa0e4ef4fa73d9b006c.png')
    // SALMON_FULL_PAGE_VISUAL_PARITY_REMEDIATION_R1: Salmon block hierarchy replaces the R1.1 column labels.
    for(const label of ['About ICS','Useful Links','Towers &amp; Services','Product Category','Phone','Privacy Policy',...contactOffices.map(office=>office.telephoneDisplay)])expect(footer).toContain(label)
    expect(footer).not.toContain('+66-2-260-6598')
  })
  it('removes only the misleading Air Coolers hero photograph (Design R4: the owner-approved edited hero, general imagery)',()=>{
    expect(serviceCompositions['SALMON-pages-1668'].inside[1]).toBeUndefined()
    const html=renderToStaticMarkup(<LuxuryCanonical doc={documentFor('SALMON-pages-1668')}/>)
    expect(html).toContain('data-r4-media="aircoolers.hero"')
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
