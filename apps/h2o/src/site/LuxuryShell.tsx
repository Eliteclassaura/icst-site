import {contactOffices} from './contact'
import type {ReactNode} from 'react'
import {ClientSocialLinks} from './ClientReview'
import type {CohortPage} from './cohort'
import type {SalmonDocument} from './salmon'
import {RfqMount} from './RfqMount'
import {SiteNavigation,type NavigationGroup} from './SiteNavigation'
import {renderableChrome,type SiteChrome} from './site-chrome-content'

/** Chrome content → the tuple shape `SiteNavigation` renders (layout stays in code). */
const navigationGroups=(chrome:SiteChrome):NavigationGroup[]=>chrome.navigation.map(group=>({label:group.label,...(group.href?{href:group.href}:{}),...(group.items?{items:group.items.map(item=>[item.label,item.href] as const)}:{}),...(group.sections?{sections:group.sections.map(section=>({label:section.label,items:section.items.map(item=>[item.label,item.href] as const)}))}:{})}))
export const commercialNavigation=[['Cooling Towers','/cooling-tower/'],['Repair & Upgrades','/cooling-tower-maintenance-repair-upgrade/'],['Parts','/cooling-tower-parts-online/'],['Air Coolers','/air-coolers/'],['Projects','/all-projects/'],['Resources','/resources/'],['About','/about-ics-industrial-cooling-solutions/']]
export const quoteAction=(mountId:'header_action'|'footer_rfq_band',page:CohortPage|null,wrapperClass?:string,routePath?:string,product?:SalmonDocument)=>{
  if(product)return <span className={wrapperClass}><RfqMount mountId={mountId} product={product}/></span>
  if(page)return <span className={wrapperClass}><RfqMount mountId={mountId} page={page}/></span>
  if(routePath)return <span className={wrapperClass}><RfqMount mountId={mountId} routePath={routePath}/></span>
  return null
}
export function LuxuryHeader({page=null,routePath,product}:{page?:CohortPage|null;routePath?:string;product?:SalmonDocument;salmonParity?:boolean}){return <div className="salmon-copy global-chrome"><header className="lux-header">
  <a href="/" className="lux-logo" aria-label="ICS homepage"><img src="/media/salmon/a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a>
  <SiteNavigation mobileQuote={quoteAction('header_action',page,'lux-menu-rfq',routePath,product)} salmonParity groups={navigationGroups(renderableChrome())}/>
  {quoteAction('header_action',page,'lux-header-rfq',routePath,product)}
</header></div>}
export function LuxurySearch({label,submit}:{label?:ReactNode;submit?:ReactNode}){return <form className="lux-search" action="/search/" role="search"><label className={label?'lux-search-label':'sr-only'} htmlFor="lux-query">{label??'Search ICS'}</label><input id="lux-query" name="q" type="search" placeholder="Search" required maxLength={200}/><button type="submit">{submit??'Search'}</button></form>}
/** Homepage-authoritative global footer; facts still come from the owner contact record. */
export function LuxuryFooter({page=null,routePath,product}:{page?:CohortPage|null;routePath?:string;product?:SalmonDocument}){const f=renderableChrome().footer;return <div className="salmon-copy global-chrome"><footer className="salmon-parity-footer" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
  <div className="salmon-footer-top"><h2>{f.heading}</h2><div className="salmon-footer-actions">{quoteAction('footer_rfq_band',page,undefined,routePath,product)}<a className="salmon-footer-contact" href="/contact-us/">{f.contactLabel}</a></div></div>
  <div className="salmon-footer-main">
   <div className="salmon-footer-brand"><a className="salmon-footer-logo" href="/" aria-label="ICS homepage"><img src="/media/salmon/a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a><p>{f.description}</p><ClientSocialLinks/></div>
   {f.columns.map(column=><nav aria-label={column.ariaLabel} key={column.ariaLabel}><h3>{column.title}</h3>{column.links.map(link=><a href={link.href} key={link.href+link.label}>{link.label}</a>)}</nav>)}
   <section className="salmon-footer-offices" aria-label="Contact"><h3>{f.officesTitle}</h3><a href="/contact-us/">{f.officesContactLabel}</a>{contactOffices.map(office=><address key={office.officeKey}><strong>{office.officeKey==='usa'?'United States':office.countryName}</strong><a href={office.telephoneHref}>{office.telephoneDisplay}</a></address>)}</section>
  </div>
  <div className="salmon-footer-legal"><span>{f.copyright}</span><a href={f.privacyHref}>{f.privacyLabel}</a></div>
 </footer></div>}
