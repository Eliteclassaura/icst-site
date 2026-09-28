import {contactOffices} from './contact'
import type {ReactNode} from 'react'
import {ClientSocialLinks} from './ClientReview'
import type {CohortPage} from './cohort'
import type {SalmonDocument} from './salmon'
import {RfqMount} from './RfqMount'
import {SiteNavigation} from './SiteNavigation'
export const commercialNavigation=[['Cooling Towers','/cooling-tower/'],['Repair & Upgrades','/cooling-tower-maintenance-repair-upgrade/'],['Parts','/cooling-tower-parts-online/'],['Air Coolers','/air-coolers/'],['Projects','/all-projects/'],['Resources','/resources/'],['About','/about-ics-industrial-cooling-solutions/']]
export const quoteAction=(mountId:'header_action'|'footer_rfq_band',page:CohortPage|null,wrapperClass?:string,routePath?:string,product?:SalmonDocument)=>{
  if(product)return <span className={wrapperClass}><RfqMount mountId={mountId} product={product}/></span>
  if(page)return <span className={wrapperClass}><RfqMount mountId={mountId} page={page}/></span>
  if(routePath)return <span className={wrapperClass}><RfqMount mountId={mountId} routePath={routePath}/></span>
  return null
}
export function LuxuryHeader({page=null,routePath,product}:{page?:CohortPage|null;routePath?:string;product?:SalmonDocument;salmonParity?:boolean}){return <div className="salmon-copy global-chrome"><header className="lux-header">
  <a href="/" className="lux-logo" aria-label="ICS homepage"><img src="/media/salmon/a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a>
  <SiteNavigation mobileQuote={quoteAction('header_action',page,'lux-menu-rfq',routePath,product)} salmonParity/>
  {quoteAction('header_action',page,'lux-header-rfq',routePath,product)}
</header></div>}
export function LuxurySearch({label,submit}:{label?:ReactNode;submit?:ReactNode}){return <form className="lux-search" action="/search/" role="search"><label className={label?'lux-search-label':'sr-only'} htmlFor="lux-query">{label??'Search ICS'}</label><input id="lux-query" name="q" type="search" placeholder="Search" required maxLength={200}/><button type="submit">{submit??'Search'}</button></form>}
/** Homepage-authoritative global footer; facts still come from the owner contact record. */
export function LuxuryFooter({page=null,routePath,product}:{page?:CohortPage|null;routePath?:string;product?:SalmonDocument}){return <div className="salmon-copy global-chrome"><footer className="salmon-parity-footer" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
  <div className="salmon-footer-top"><h2>Let’s Build Efficient Industrial Cooling Systems</h2><div className="salmon-footer-actions">{quoteAction('footer_rfq_band',page,undefined,routePath,product)}<a className="salmon-footer-contact" href="/contact-us/">Contact us</a></div></div>
  <div className="salmon-footer-main">
   <div className="salmon-footer-brand"><a className="salmon-footer-logo" href="/" aria-label="ICS homepage"><img src="/media/salmon/a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a><p>ICS specializes in industrial cooling solutions, including cooling towers, evaporative cooling systems, and heat exchangers designed for efficient thermal management and industrial reliability.</p><ClientSocialLinks/></div>
   <nav aria-label="Company"><h3>Company</h3><a href="/about-ics-industrial-cooling-solutions/">About ICS</a><a href="/all-projects/">Projects</a></nav>
   <nav aria-label="Towers and services"><h3>Towers &amp; services</h3><a href="/cooling-tower/">New Cooling Towers</a><a href="/cooling-tower-replacement/">Cooling Tower Replacement</a><a href="/thermal-upgrade/">Thermal Upgrade</a><a href="/cooling-tower-maintenance-repair-upgrade/">Repair &amp; Maintenance</a><a href="/disaster-recovery/">Disaster Recovery</a><a href="/dry-soda-blasting/">Dry Soda Blasting</a><a href="/air-coolers/">Air Coolers</a></nav>
   <nav aria-label="Parts"><h3>Parts</h3><a href="/cooling-tower-parts-online/">All Cooling Tower Parts</a><a href="/cooling-tower-fan-stacks/">Fan stacks</a><a href="/fans/">Fans</a><a href="/fill-media/">Fill media</a><a href="/drive-shafts-assembles/">Drive shafts</a><a href="/gear-box/">Gear boxes</a><a href="/motors/">Motors</a><a href="/nozzles/">Nozzles</a><a href="/frp-members/">FRP members</a><a href="/tower-hardware/">Tower hardware</a></nav>
   <nav aria-label="Resources"><h3>Resources</h3><a href="/tech-articles/">Technical Articles</a><a href="/cooling-tower-brochures/">Brochures</a><a href="/cooling-tower-resources/tools/">Tools</a><a href="/resources/">Resources Library</a><a href="/search/">Search</a></nav>
   <section className="salmon-footer-offices" aria-label="Contact"><h3>Contact</h3><a href="/contact-us/">Contact us</a>{contactOffices.map(office=><address key={office.officeKey}><strong>{office.officeKey==='usa'?'United States':office.countryName}</strong><a href={office.telephoneHref}>{office.telephoneDisplay}</a></address>)}</section>
  </div>
  <div className="salmon-footer-legal"><span>Copyright © Industrial Cooling Solutions</span><a href="/privacy-policy/">Privacy Policy</a></div>
 </footer></div>}
