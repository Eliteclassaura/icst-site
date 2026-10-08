import {readFileSync} from 'node:fs'
import {LauncherPlacement} from './LauncherPlacement'
import path from 'node:path'
import {contactOffices} from './contact'
import type {ReactNode} from 'react'
import {LanguageBar,LanguageMenu} from './lang/LanguageMenu'
import {languageMenuFor} from './lang/lang-data'
import {ClientSocialLinks} from './ClientReview'
import {pageCopy} from './page-copy'
import type {CohortPage} from './cohort'
import type {SalmonDocument} from './salmon'
import {RfqMount} from './RfqMount'
import {SiteNavigation,type NavigationGroup} from './SiteNavigation'
import {linkRenderable,renderableChrome,type SiteChrome} from './site-chrome-content'

/** Chrome content → the tuple shape `SiteNavigation` renders (layout stays in code). */
const navigationGroups=(chrome:SiteChrome):NavigationGroup[]=>chrome.navigation.map(group=>({label:group.label,...(group.href?{href:group.href}:{}),...(group.items?{items:group.items.map(item=>[item.label,item.href] as const)}:{}),...(group.sections?{sections:group.sections.map(section=>({label:section.label,items:section.items.map(item=>[item.label,item.href] as const)}))}:{})}))
export const commercialNavigation=[['Cooling Towers','/cooling-tower/'],['Repair & Upgrades','/cooling-tower-maintenance-repair-upgrade/'],['Parts','/cooling-tower-parts-online/'],['Air Coolers','/air-coolers/'],['Projects','/all-projects/'],['Resources','/resources/'],['About','/about-ics-industrial-cooling-solutions/']]
export const quoteAction=(mountId:'header_action'|'footer_rfq_band',page:CohortPage|null,wrapperClass?:string,routePath?:string,product?:SalmonDocument)=>{
  if(product)return <span className={wrapperClass}><RfqMount mountId={mountId} product={product}/></span>
  if(page)return <span className={wrapperClass}><RfqMount mountId={mountId} page={page}/></span>
  if(routePath)return <span className={wrapperClass}><RfqMount mountId={mountId} routePath={routePath}/></span>
  return null
}
export function LuxuryHeader({page=null,routePath,product}:{page?:CohortPage|null;routePath?:string;product?:SalmonDocument;salmonParity?:boolean}){const language=languageMenuFor(routePath??'/');return <div className="salmon-copy global-chrome"><LauncherPlacement/><header className="lux-header">
  <a href="/" className="lux-logo" aria-label="ICS homepage"><img src="/media/salmon/a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a>
  <SiteNavigation mobileQuote={quoteAction('header_action',page,'lux-menu-rfq',routePath,product)} salmonParity groups={navigationGroups(renderableChrome())} languageDesktop={<LanguageMenu data={language} variant="desktop"/>} languageMobile={<LanguageMenu data={language} variant="mobile"/>}/>
  {quoteAction('header_action',page,'lux-header-rfq',routePath,product)}
</header><LanguageBar data={language}/></div>}
export function LuxurySearch({label,submit}:{label?:ReactNode;submit?:ReactNode}){return <form className="lux-search" action="/search/" role="search"><label className={label?'lux-search-label':'sr-only'} htmlFor="lux-query">{label??'Search ICS'}</label><input id="lux-query" name="q" type="search" placeholder="Search" required maxLength={200}/><button type="submit">{submit??'Search'}</button></form>}
/** Main's accepted four-column presentation with Runtime's published chrome content. */
type FooterFlag={office:string;src:string;sha256:string;width:number;height:number;frameZoom:number}
const footerFlags=new Map((JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon/parity-footer-flags.json'),'utf8')) as {flags:FooterFlag[]}).flags.map(flag=>[flag.office,flag]))
const linkList=(links:SiteChrome['footer']['columns'][number]['links'])=><ul>{links.map(({label,href})=><li key={href+label}><a href={href}>{label}</a></li>)}</ul>
/** The country pages (R5b), linked from every footer (QUICK-WINS-1: they had no internal links). The Thailand phone stays on the owner authority. */
export const FOOTER_LOCATIONS:ReadonlyArray<{label:string;href:string}>=[
  {label:'USA',href:'/cooling-tower-construction-repair-in-united-states/'},
  {label:'Thailand',href:'/cooling-tower-thailand/'},
  {label:'Japan',href:'/cooling-tower-japan/'},
  {label:'Malaysia',href:'/cooling-tower-malaysia/'},
  {label:'Singapore',href:'/cooling-tower-construction-repair-in-singapore/'},
]
/** Footer copy as one flowing paragraph (the content carried hard line breaks) and "Contact Us" in title case (QUICK-WINS-1). */
export const footerText=(text:string):string=>text.replace(/\s+/g,' ').trim()
export const footerContactLabel=(label:string):string=>label.replace(/^contact us$/i,'Contact Us')
const officeLocation=(key:string,fallback:string)=>key==='usa'?'Lakewood, Colorado, USA':fallback
export function LuxuryFooter({page=null,routePath,product}:{page?:CohortPage|null;routePath?:string;product?:SalmonDocument}){const f=renderableChrome().footer;const useful=f.columns[0];return <div className="salmon-copy global-chrome"><footer className="salmon-parity-footer sp-footer" data-footer-architecture="SALMON_FOOTER_R1" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
  <div className="sp-footer-inner">
   <div className="sp-footer-top"><h2>{f.heading}</h2><div className="sp-footer-actions">{quoteAction('footer_rfq_band',page,undefined,routePath,product)}{routePath==='/contact-us/'?<a className="sp-footer-contact" href="#how-to-request">{pageCopy().contact.formLink}</a>:<a className="sp-footer-contact" href="/contact-us/">{footerContactLabel(f.contactLabel)}</a>}</div></div>
   <div className="sp-footer-main">
    <section className="sp-footer-about" aria-label="About ICS"><a className="sp-footer-logo" href="/" aria-label="ICS homepage"><img src="/media/salmon/a8f4b38d0f7ede838b277c9bcd00a3b75a268ce23a5fccfb86ec263774e3b844.png" width="196" height="50" alt="ICS — Industrial Cooling Solutions"/></a><h3>About ICS</h3><p>{footerText(f.description)}</p><div className="sp-footer-cti"><img src="/media/salmon/c0060d855e27dfa01cb59100bba1dd217e2e6796d995aaa0e4ef4fa73d9b006c.png" width="952" height="272" alt="Cooling Technology Institute (CTI)" loading="lazy" decoding="async"/></div><ClientSocialLinks/></section>
    <nav className="sp-footer-list" aria-label={useful?.ariaLabel}><h3>{useful?.title}</h3>{linkList(useful?.links??[])}</nav>
    <nav className="sp-footer-list sp-footer-category" aria-label="Product Category"><h3>Product Category</h3><div className="sp-footer-groups">{f.columns.slice(1).map(group=><div className="sp-footer-group" key={group.ariaLabel}><h4>{group.title}</h4>{linkList(group.links)}</div>)}</div></nav>
    <section className="sp-footer-phone" aria-label={f.officesTitle}><h3>{f.officesTitle}</h3><ul>{contactOffices.map(office=>{const flag=footerFlags.get(office.officeKey);return <li key={office.officeKey}><address><span className="sp-footer-office">{flag?<span className="sp-footer-flag" aria-hidden="true"><img src={flag.src} width={flag.width} height={flag.height} alt="" loading="lazy" decoding="async" data-source-sha256={flag.sha256} style={flag.frameZoom!==1?{transform:`scale(${flag.frameZoom})`}:undefined}/></span>:null}<strong>{officeLocation(office.officeKey,office.officeKey==='usa'?'United States':office.countryName)}</strong><span className="sp-visually-hidden">{office.officeKey==='usa'?' United States':''}</span></span><a href={office.telephoneHref}>{office.telephoneDisplay}</a></address></li>})}</ul></section>
   </div>
   <nav className="sp-footer-locations" aria-label="Locations"><h3>Locations</h3><ul>{FOOTER_LOCATIONS.filter(link=>linkRenderable(link.href)).map(link=><li key={link.href}><a href={link.href}>{link.label}</a></li>)}</ul></nav>
   <div className="sp-footer-legal"><span>{f.copyright}</span><a href={f.privacyHref}>{f.privacyLabel}</a></div>
  </div>
 </footer></div>}
