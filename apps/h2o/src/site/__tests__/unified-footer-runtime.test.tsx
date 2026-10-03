import {afterEach,describe,expect,it,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import * as chrome from '../site-chrome-content'
import {LuxuryFooter} from '../LuxuryShell'
import {contactOffices} from '../contact'

afterEach(()=>vi.restoreAllMocks())
describe('accepted four-column footer with published Runtime chrome',()=>{
  it('keeps geometry and owner phones while rendering edited allowed copy and links',()=>{
    const edited=structuredClone(chrome.DEFAULT_SITE_CHROME)
    edited.footer.heading='Synthetic published footer heading'
    edited.footer.contactLabel='Synthetic contact label'
    edited.footer.columns[0]!.links=[{label:'Synthetic resources label',href:'/resources/'}]
    vi.spyOn(chrome,'renderableChrome').mockReturnValue(edited)
    const html=renderToStaticMarkup(<LuxuryFooter routePath="/fans/"/>)
    expect(html).toContain('data-footer-architecture="SALMON_FOOTER_R1"')
    for(const cls of ['sp-footer-about','sp-footer-list','sp-footer-category','sp-footer-phone'])expect(html).toContain(cls)
    expect(html).toContain('Synthetic published footer heading')
    expect(html).toContain('class="sp-footer-contact" href="/contact-us/">Synthetic contact label')
    expect(html).toContain('href="/resources/">Synthetic resources label')
    for(const office of contactOffices){expect(html).toContain(office.telephoneHref);expect(html).toContain(office.telephoneDisplay)}
    // Owner decision 2026-10-02 (Control Tower ruling): CTI appears only as the membership badge below About ICS; ICS stays the footer identity.
    expect(html.replace(/<div class="sp-footer-cti"><img [^>]*><\/div>/,'')).not.toContain('CTI')
  })
})
