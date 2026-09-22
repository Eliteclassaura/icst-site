import {contactOffices} from './contact'
import type {ReactNode} from 'react'
import {ClientSocialLinks} from './ClientReview'
import type {CohortPage} from './cohort'
import {RfqMount} from './RfqMount'
const countryFlags:Record<string,string>={usa:'🇺🇸',japan:'🇯🇵',thailand:'🇹🇭'}
export const commercialNavigation=[['Cooling Towers','/cooling-tower/'],['Repair & Upgrades','/cooling-tower-maintenance-repair-upgrade/'],['Parts','/cooling-tower-parts-online/'],['Air Coolers','/air-coolers/'],['Projects','/all-projects/'],['About','/about-ics/']]
const quoteAction=(mountId:string,page:CohortPage|null,wrapperClass?:string)=>page?<span className={wrapperClass}><RfqMount mountId={mountId} page={page}/></span>:<a className={['lux-button',wrapperClass].filter(Boolean).join(' ')} href="/contact-us/">Request a Quote</a>
export function LuxuryHeader({page=null}:{page?:CohortPage|null}){return <header className="lux-header">
  <a href="/" className="lux-logo" aria-label="ICS homepage"><img src="/media/luxury/ics-logo-original.webp" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a>
  <nav className="lux-desktop-nav" aria-label="Primary">{commercialNavigation.map(([label,href])=><a href={href} key={href}>{label}</a>)}</nav>
  {quoteAction('header_action',page,'lux-header-rfq')}
  <details className="lux-menu"><summary aria-label="Open navigation"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" strokeWidth="2"/></svg></summary><nav aria-label="Mobile">{commercialNavigation.map(([label,href])=><a href={href} key={href}>{label}</a>)}<a href="/search/">Search</a>{quoteAction('header_action',page,'lux-menu-rfq')}</nav></details>
</header>}
export function LuxurySearch({label,submit}:{label?:ReactNode;submit?:ReactNode}){return <form className="lux-search" action="/search/" role="search"><label className={label?'lux-search-label':'sr-only'} htmlFor="lux-query">{label??'Search ICS'}</label><input id="lux-query" name="q" type="search" placeholder="Search" required maxLength={200}/><button type="submit">{submit??'Search'}</button></form>}
const services=[['New Cooling Towers','/cooling-tower/'],['Repair & Maintenance','/cooling-tower-maintenance-repair-upgrade/'],['Thermal Upgrade','/thermal-upgrade/'],['Cooling Tower Replacement','/cooling-tower-replacement/'],['Disaster Recovery','/disaster-recovery/'],['Dry Soda Blasting','/dry-soda-blasting/'],['Air Coolers','/air-coolers/']]
export function LuxuryFooter({page=null}:{page?:CohortPage|null}){return <footer className="lux-footer"><div className="lux-footer-grid">
  <div className="lux-footer-brand"><a href="/" aria-label="ICS homepage"><img src="/media/luxury/ics-logo-original.webp" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a>{quoteAction('footer_rfq_band',page,'lux-footer-rfq')}<ClientSocialLinks/></div>
  <nav aria-label="Services"><h2>Services</h2>{services.map(([label,href])=><a href={href} key={href}>{label}</a>)}</nav>
  <nav aria-label="Parts and resources"><h2>Parts & Resources</h2><a href="/cooling-tower-parts-online/">Cooling Tower Parts</a><a href="/category/blog/">Technical Articles</a><a href="/cooling-tower-brochures/">Brochures</a><a href="/search/">Search</a></nav>
  <nav aria-label="Company"><h2>Company</h2><a href="/about-ics/">About ICS</a><a href="/all-projects/">Projects</a><a href="/contact-us/">Contact Us</a></nav>
  <section className="lux-offices" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21"><h2>Offices</h2>{contactOffices.map(o=><address key={o.officeKey} data-office={o.officeKey}><strong><span aria-hidden="true" className="client-country-flag">{countryFlags[o.officeKey]}</span> {o.displayLabel}</strong>{o.company?<span>{o.company}</span>:null}{o.addressLines.map(l=><span key={l}>{l}</span>)}{o.city?<span>{[o.city,o.region,o.postalCode].filter(Boolean).join(', ')}</span>:null}<a href={o.telephoneHref}>{o.telephoneDisplay}</a></address>)}</section>
 </div><div className="lux-legal"><a href="/">h2ocooling.com</a><a href="/privacy-policy/">Privacy Policy</a><span>Industrial Cooling Solutions</span></div></footer>}
