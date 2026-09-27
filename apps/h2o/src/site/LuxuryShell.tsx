import {contactOffices} from './contact'
import type {ReactNode} from 'react'
import {ClientSocialLinks} from './ClientReview'
import type {CohortPage} from './cohort'
import {RfqMount} from './RfqMount'
import {SiteNavigation} from './SiteNavigation'
const countryFlags:Record<string,string>={usa:'🇺🇸',japan:'🇯🇵',thailand:'🇹🇭'}
export const commercialNavigation=[['Cooling Towers','/cooling-tower/'],['Repair & Upgrades','/cooling-tower-maintenance-repair-upgrade/'],['Parts','/cooling-tower-parts-online/'],['Air Coolers','/air-coolers/'],['Projects','/all-projects/'],['Resources','/resources/'],['About','/about-ics-industrial-cooling-solutions/']]
const quoteAction=(mountId:string,page:CohortPage|null,wrapperClass?:string)=>page?<span className={wrapperClass}><RfqMount mountId={mountId} page={page}/></span>:<a className={['lux-button',wrapperClass].filter(Boolean).join(' ')} href="/contact-us/">Request a Quote</a>
export function LuxuryHeader({page=null}:{page?:CohortPage|null;salmonParity?:boolean}){return <div className="salmon-copy global-chrome"><header className="lux-header">
  <a href="/" className="lux-logo" aria-label="ICS homepage"><img src="/media/salmon/a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a>
  <SiteNavigation mobileQuote={quoteAction('header_action',page,'lux-menu-rfq')} salmonParity/>
  <span className="salmon-header-language"><img src="/media/salmon-parity/en-us.png" width="16" height="16" alt=""/> English</span>
  {quoteAction('header_action',page,'lux-header-rfq')}
</header></div>}
export function LuxurySearch({label,submit}:{label?:ReactNode;submit?:ReactNode}){return <form className="lux-search" action="/search/" role="search"><label className={label?'lux-search-label':'sr-only'} htmlFor="lux-query">{label??'Search ICS'}</label><input id="lux-query" name="q" type="search" placeholder="Search" required maxLength={200}/><button type="submit">{submit??'Search'}</button></form>}
/** Homepage-authoritative global footer; facts still come from the owner contact record. */
export function LuxuryFooter({page=null}:{page?:CohortPage|null}){return <div className="salmon-copy global-chrome"><footer className="salmon-parity-footer" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
  <div className="salmon-footer-top"><h2>Let’s Build Efficient Industrial Cooling Systems</h2>{page?<RfqMount mountId="footer_rfq_band" page={page}/>:<a href="/contact-us/">Request a Quote</a>}</div>
  <div className="salmon-footer-main">
   <div className="salmon-footer-brand"><img src="/media/salmon/c0060d855e27dfa01cb59100bba1dd217e2e6796d995aaa0e4ef4fa73d9b006c.png" width="952" height="272" alt="Cooling Technology Institute"/><h3>About ICS</h3><p>ICS specializes in industrial cooling solutions, including cooling towers, evaporative cooling systems, and heat exchangers designed for efficient thermal management and industrial reliability.</p><ClientSocialLinks/></div>
   <nav aria-label="Useful links"><h3>Useful Links</h3><a href="/">Expert Industrial Cooling Solutions</a><a href="/about-ics-industrial-cooling-solutions/">About ICS</a><a href="/air-coolers/">Air Coolers</a><a href="/resources/">Resources</a><a href="/all-projects/">All Projects</a><a href="/cooling-tower/">Cooling Towers</a></nav>
   <nav aria-label="Services and parts"><h3>Product Category</h3><a href="/cooling-tower-parts-online/">Cooling Tower Parts</a><a href="/cooling-tower/">Cooling Tower Systems</a><a href="/cooling-tower-maintenance-repair-upgrade/">Repair &amp; Maintenance</a><a href="/thermal-upgrade/">Thermal Upgrades</a><a href="/cooling-tower-replacement/">Cooling Tower Replacement</a><a href="/cooling-tower-brochures/">Brochures</a></nav>
   <section className="salmon-footer-offices" aria-label="Approved offices"><h3>Phone</h3>{contactOffices.map(office=><address key={office.officeKey}><strong><span aria-hidden="true">{countryFlags[office.officeKey]}</span> {office.displayLabel}</strong><a href={office.telephoneHref}>{office.telephoneDisplay}</a></address>)}</section>
  </div>
  <div className="salmon-footer-legal"><span>Copyright © Industrial Cooling Solutions</span><a href="/privacy-policy/">Privacy Policy</a></div>
 </footer></div>}
