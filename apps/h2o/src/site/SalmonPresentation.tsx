import {createElement,type ReactNode} from 'react'
import {SalmonSeo} from './SalmonCanonical'
import {LuxuryHeader} from './LuxuryShell'
import {pageForSegments} from './cohort'
import {ownerText,salmonMedia,salmonMediaPath,type SalmonDocument,type SalmonNode} from './salmon'
import {ClientSocialLinks} from './ClientReview'
import {contactOffices} from './contact'
import {RfqMount} from './RfqMount'
import {SalmonTabsController} from './SalmonTabsController'

// Static presentation of the two owner-selected Salmon pages. Content remains
// sourced from the frozen Salmon documents; no WordPress scripts or forms run.
const tags = new Set('div section article header footer nav p h1 h2 h3 h4 h5 h6 a span b strong i em u s figure figcaption img ul ol li table thead tbody tfoot tr th td br hr blockquote cite time sup sub small details summary label output search button'.split(' '))
const voidTags = new Set(['img','br','hr'])
const svgTags = new Set(['svg','path','circle','rect','g','polygon','polyline','line'])
const svgAttrs = new Set(['d','viewBox','width','height','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','clip-rule','cx','cy','r','rx','ry','x','y','x1','y1','x2','y2','points','transform'])

function localHref(value:string,doc:SalmonDocument):string|undefined {
 if(!value||value==='#'||value.endsWith('/#'))return undefined
 const media=salmonMedia(value,doc.sourceUrl)
 if(media?.file)return salmonMediaPath(media)
 try {
  const url=new URL(value,doc.sourceUrl)
  if(['salmon-rhinoceros-754457.hostingersite.com','h2ocooling.com','www.h2ocooling.com'].includes(url.hostname))return url.pathname+url.search+url.hash
  if(['https:','http:','mailto:','tel:'].includes(url.protocol))return value
 } catch { /* Unrecognized source links are not rendered as actions. */ }
 return undefined
}

function sourceNode(node:SalmonNode,key:string,doc:SalmonDocument):ReactNode {
 if(typeof node==='string')return node.trim()==='Buy Now'?'View Product':ownerText(node)
 if(['script','style','iframe','template','input','textarea'].includes(node.tag))return null
 if(svgTags.has(node.tag)){
  const props:Record<string,unknown>={key}
  for(const [name,value] of Object.entries(node.attrs)){
   if(!svgAttrs.has(name))continue
   const reactName=name.replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase())
   props[reactName]=value
  }
  if(node.attrs.class)props.className=node.attrs.class
  if(node.attrs['aria-hidden'])props['aria-hidden']=node.attrs['aria-hidden']
  return createElement(node.tag,props,...node.children.map((child,i)=>sourceNode(child,`${key}.${i}`,doc)))
 }
 if(node.tag==='form')return <form key={key} className="e-search-form" action="/search/" method="get" role="search"><label className="e-search-label" htmlFor={`salmon-search-${key}`}><span className="elementor-screen-only">Search</span></label><div className="e-search-input-wrapper"><input id={`salmon-search-${key}`} className="e-search-input" type="search" name="q" placeholder="Find Your Services" required maxLength={200}/></div><button className="e-search-submit" type="submit" aria-label="Search"><svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 16h15m-7-7 7 7-7 7" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></button></form>
 const tag=tags.has(node.tag)?node.tag:'span'
 const props:Record<string,unknown>={key,className:node.attrs.class,'data-salmon-node':key}
 const sourceColor=node.attrs.style?.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,8})\s*(?:;|$)/)?.[1]
 if(sourceColor)props.style={color:sourceColor}
 if(node.attrs.id)props.id=node.attrs.id
 if(node.attrs.role)props.role=node.attrs.role
 if(node.attrs['aria-label'])props['aria-label']=node.attrs['aria-label']
 if(node.attrs['data-id'])props['data-id']=node.attrs['data-id']
 for(const name of ['aria-selected','aria-controls','aria-labelledby','data-tab-index'])if(node.attrs[name])props[name]=node.attrs[name]
 const tabOrder=node.attrs.style?.match(/--n-tabs-(?:title|target)-order:\s*(\d+)/)?.[1]
 if(tabOrder)props.style={...(props.style as object||{}),'--n-tabs-title-order':tabOrder,'--n-tabs-target-order':tabOrder}
 if(tag==='img'){
  const source=node.attrs['data-src']||node.attrs.src
  const media=source?salmonMedia(source,doc.sourceUrl):undefined
  if(!media?.file)return null
  props.src=salmonMediaPath(media)
  props.alt=node.attrs.alt??''
  props.width=Number(node.attrs.width)||media.width
  props.height=Number(node.attrs.height)||media.height
  props.loading='lazy'
  props['data-source-sha256']=media.sha256
 }
 if(tag==='a'){
  if(/\/testimonial-detail\/?(?:[?#]|$)/.test(node.attrs.href??''))return null
  const href=localHref(node.attrs.href??'',doc)
  if(!href)return createElement('span',props,...node.children.map((child,i)=>sourceNode(child,`${key}.${i}`,doc)))
  props.href=href
  props['data-source-href']=node.attrs.href
  if(node.attrs.target==='_blank'){props.target='_blank';props.rel='noopener noreferrer'}
 }
 if(tag==='button'){
  props.type='button'
  if(node.attrs.role==='tab')props.role='tab'
  else props.disabled=true
 }
 if(tag==='details')props.open=true
 const children=node.children.map((child,i)=>sourceNode(child,`${key}.${i}`,doc))
 return createElement(tag,props,...(voidTags.has(tag)?[]:children))
}

export function SalmonPresentation({doc}:{doc:SalmonDocument}){
 const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
 const home=doc.targetPath==='/'
 return <div className={`luxury-site salmon-copy salmon-page-${home?'home':'newtowers'} elementor-kit-5 elementor-page-${home?'48':'1230'} elementor-${home?'48':'1230'}`} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
  <SalmonSeo doc={doc}/>
  <LuxuryHeader page={page} salmonParity/>
  <main id="main" className={`salmon-copy-main elementor elementor-${home?'48':'1230'} elementor-kit-5`} data-salmon-region="body">
   <SalmonTabsController/>
   {doc.children.map((node,i)=>sourceNode(node,`body.${i}`,doc))}
  </main>
  <SalmonParityFooter page={page}/>
 </div>
}

function SalmonParityFooter({page}:{page:ReturnType<typeof pageForSegments>}){
 return <footer className="salmon-parity-footer" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
  <div className="salmon-footer-top"><h2>Let’s Build Efficient Industrial Cooling Systems</h2>{page?<RfqMount mountId="footer_rfq_band" page={page}/>:<a href="/contact-us/">Request a Quote</a>}</div>
  <div className="salmon-footer-main">
   <div className="salmon-footer-brand"><img src="/media/salmon/c0060d855e27dfa01cb59100bba1dd217e2e6796d995aaa0e4ef4fa73d9b006c.png" width="952" height="272" alt="Cooling Technology Institute"/><h3>About ICS</h3><p>ICS specializes in industrial cooling solutions, including cooling towers, evaporative cooling systems, and heat exchangers designed for efficient thermal management and industrial reliability.</p><ClientSocialLinks/></div>
   <nav aria-label="Useful links"><h3>Useful Links</h3><a href="/">Expert Industrial Cooling Solutions</a><a href="/about-ics-industrial-cooling-solutions/">About ICS</a><a href="/air-coolers/">Air Coolers</a><a href="/resources/">Resources</a><a href="/all-projects/">All Projects</a><a href="/cooling-tower/">Cooling Towers</a></nav>
   <nav aria-label="Services and parts"><h3>Product Category</h3><a href="/cooling-tower-parts-online/">Cooling Tower Parts</a><a href="/cooling-tower/">Cooling Tower Systems</a><a href="/cooling-tower-maintenance-repair-upgrade/">Repair &amp; Maintenance</a><a href="/thermal-upgrade/">Thermal Upgrades</a><a href="/cooling-tower-replacement/">Cooling Tower Replacement</a><a href="/cooling-tower-brochures/">Brochures</a></nav>
   <section className="salmon-footer-offices" aria-label="Approved offices"><h3>Phone</h3>{contactOffices.map(office=><address key={office.officeKey}><strong><span aria-hidden="true">{office.officeKey==='usa'?'🇺🇸':office.officeKey==='japan'?'🇯🇵':'🇹🇭'}</span> {office.displayLabel}</strong><a href={office.telephoneHref}>{office.telephoneDisplay}</a></address>)}</section>
  </div>
  <div className="salmon-footer-legal"><span>Copyright © Industrial Cooling Solutions</span><a href="/privacy-policy/">Privacy Policy</a></div>
 </footer>
}
