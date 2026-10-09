import {isPdfHref} from './link-attrs'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {createElement,Fragment,type ReactNode} from 'react'
import {SalmonSeo} from './SalmonCanonical'
import {linkLabel,namelessLink} from './link-context'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {pageForSegments} from './cohort'
import {ownerText,provenanceHref,salmonDocument,salmonMedia,salmonMediaPath,salmonNodeText,salmonRoutes,type SalmonDocument,type SalmonNode} from './salmon'
import {salmonFamilyFor,salmonFamilyModel} from './salmon-family-adapter'
import {portfolioView} from './r4/R4Portfolio'
import {SalmonTabsController} from './SalmonTabsController'
import {ClientTestimonials,clientReviewAuthority} from './ClientReview'
import {heroQuoteAction,renderQuoteAction} from '../content/rfq-controls'
import {heroActionFor,heroSecondaryHref} from './hero-actions'

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

/**
 * HOME-FIX (CT 2026-10-07; DD home parity 40fef549 H1, H4, H5).
 * - H5: the hidden mobile copy of the hero H1 (an Elementor carry-over H2) is removed; the H1 itself shows at every width.
 * - H4: a product card title inside a loop grid is an H3 (the section headings stay H2); no visual change (the source
 *   styles the heading class, not the tag).
 * - H1: the credential row shows the original ICS files with real alts (content/design/home-credentials.json).
 */
/** The services overview the header's Services link opens (navigation-data commercialNavigation). */
export const HOME_SERVICES_HUB='/cooling-tower-maintenance-repair-upgrade/'
const WP_POST_DATE=/^(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d$/
/** The home project-card date widgets, and the project year each should show (from the portfolio model, via the card's own project link). */
const PROJECT_LINK=/\/(?:all-projects|projects)\/[^/?#]+\/?$/
const pathOf=(href:string):string|undefined=>{try{return new URL(href,'https://x.test').pathname}catch{return undefined}}
const isPostDateWidget=(node:Exclude<SalmonNode,string>)=>/(?:^|\s)elementor-widget-text-editor(?:\s|$)/.test(node.attrs.class??'')&&WP_POST_DATE.test(salmonNodeText(node).replace(/\s+/g,' ').trim())
/** The widget with its date paragraph replaced by the year (the source splits some dates over a span: "June 12, <span>2015</span>"). */
const withDateText=(node:Exclude<SalmonNode,string>,year:string):Exclude<SalmonNode,string>=>node.tag==='p'?{...node,children:[year]}:{...node,children:node.children.map(child=>typeof child==='string'?child:withDateText(child,year))}
let portfolioYears:Map<string,string>|undefined
const projectYear=(href:string):string|undefined=>{
  if(!portfolioYears){
    portfolioYears=new Map()
    try{
      const route=salmonRoutes().find(r=>r.routeId==='SALMON-pages-1353')
      const portfolio=route?salmonDocument(route):undefined
      const family=portfolio?salmonFamilyFor(portfolio):undefined
      if(portfolio&&family)for(const country of portfolioView(salmonFamilyModel(portfolio,family)).countries)for(const card of country.cards){
        const year=/(?:19|20)\d{2}/.exec(card.year??'')?.[0]
        const path=pathOf(card.href)
        if(year&&path)portfolioYears.set(path,year)
      }
    }catch{/* no portfolio model: the dates are simply not shown */}
  }
  const path=pathOf(href)
  return path?portfolioYears.get(path):undefined
}
const dateYears=new WeakMap<SalmonDocument,Map<string,string|undefined>>()
function homeDateYears(doc:SalmonDocument):Map<string,string|undefined>{
  const cached=dateYears.get(doc)
  if(cached)return cached
  const out=new Map<string,string|undefined>()
  const projectHref=(node:SalmonNode):string|undefined=>{
    if(typeof node==='string')return undefined
    if(node.tag==='a'){const path=pathOf(node.attrs.href??'');if(path&&PROJECT_LINK.test(path))return node.attrs.href}
    for(const child of node.children){const found=projectHref(child);if(found)return found}
    return undefined
  }
  const visit=(node:SalmonNode,ancestors:Array<Exclude<SalmonNode,string>>)=>{
    if(typeof node==='string')return
    const id=node.attrs['data-id']
    if(id&&isPostDateWidget(node)){
      // the card is the nearest ancestor that holds a project link
      let href:string|undefined
      for(let i=ancestors.length-1;i>=0&&!href;i--)href=projectHref(ancestors[i]!)
      out.set(id,href?projectYear(href):undefined)
    }
    for(const child of node.children)visit(child,[...ancestors,node])
  }
  for(const child of doc.children)visit(child,[])
  dateYears.set(doc,out)
  return out
}
const HOME_DROPPED_ELEMENTS:ReadonlySet<string>=new Set(['be98584'])
const HOME_SHOWN_ON_MOBILE:ReadonlySet<string>=new Set(['81bef94'])
type Credential={replacesSha256:string;src:string;sha256:string;width:number;height:number;alt:string}
let credentials:Map<string,Credential>|undefined
const credentialFor=(sha:string|undefined)=>{
  credentials??=new Map((JSON.parse(readFileSync(path.join(process.cwd(),'content/design/home-credentials.json'),'utf8')) as {logos:Credential[]}).logos.map(l=>[l.replacesSha256,l]))
  return sha?credentials.get(sha):undefined
}

/** A loop card's own title (its first heading), the alt of the card's product photo (QA pre-pass M5; CT 2026-10-07). */
const loopTitle=(node:SalmonNode):string|undefined=>{
  if(typeof node==='string')return undefined
  if(/^h[1-6]$/.test(node.tag))return salmonNodeText(node).replace(/\s+/g,' ').trim()||undefined
  for(const child of node.children){const t=loopTitle(child);if(t)return t}
  return undefined
}

function sourceNode(node:SalmonNode,key:string,doc:SalmonDocument,inLoop:false|string=false):ReactNode {
  // Accepted exclusion stub (../content/public-exclusions): renders nothing, keeps sibling keys.
  if(typeof node!=='string'&&(node as {attrs?:Record<string,string>}).attrs?.['data-public-exclusion'])return null
  // Design Fixes R2 (#7): the hero's source quote link is the quote action, label from content/design/hero-actions.json.
  const hero=heroActionFor(doc.targetPath)
  if(hero?.sourceLabel&&typeof node!=='string'&&node.tag==='a'&&salmonNodeText(node).replace(/\s+/g,' ').trim()===hero.sourceLabel){
   const quote=heroQuoteAction(doc,key,hero.label)
   return hero.secondary?<span className="salmon-hero-actions" key={key+'.actions'}>{quote}<a className="salmon-hero-secondary" href={heroSecondaryHref(hero.secondary)} data-hero-action="secondary">{hero.secondary.label}</a></span>:quote
  }
  // Runtime RFQ (Payload content mode only), as in renderSalmonNode.
  const quote=renderQuoteAction(doc,node as never,key,(original,k)=>sourceNode(original as SalmonNode,k,doc))
  if(quote!==undefined)return quote
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
 const home=doc.targetPath==='/'
 if(home&&node.attrs['data-id']&&HOME_DROPPED_ELEMENTS.has(node.attrs['data-id']))return null
 // the home project cards showed the WordPress post date as if it were the project's date ("June 12, 2018"): they show the
 // project's own year from the portfolio data, or no date when the project has none (CT 2026-10-08)
 if(home&&isPostDateWidget(node)){
  const id=node.attrs['data-id']
  const year=id?homeDateYears(doc).get(id):undefined
  if(!year)return null
  node=withDateText(node,year)
 }
 const loop:false|string=inLoop||(/(?:^|\s)e-loop-item(?:\s|$)/.test(node.attrs.class??'')?loopTitle(node)??'':false)
 const tag=tags.has(node.tag)?(loop!==false&&node.tag==='h2'?'h3':node.tag):'span'
 const className=home&&node.attrs['data-id']&&HOME_SHOWN_ON_MOBILE.has(node.attrs['data-id'])?node.attrs.class?.replace(/(?:^|\s)elementor-hidden-mobile(?=\s|$)/,''):node.attrs.class
 const props:Record<string,unknown>={key,className,'data-salmon-node':key}
 const sourceColor=node.attrs.style?.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,8})\s*(?:;|$)/)?.[1]
 if(sourceColor)props.style={color:sourceColor}
 if(node.attrs.id)props.id=node.attrs.id
 else if(hero?.secondaryTargetDataId&&node.attrs['data-id']===hero.secondaryTargetDataId)props.id='service-overview'
 // LEGAL-FIX-1 (axe aria-required-children, WCAG 1.3.1): a source role="list" stays only on a container that holds list items
 // (Elementor's loop grid declares it over headings and links)
 if(node.attrs.role&&!(node.attrs.role==='list'&&!node.children.some(child=>typeof child!=='string'&&(child.attrs.role==='listitem'||child.tag==='li'))))props.role=node.attrs.role
 if(node.attrs['aria-label'])props['aria-label']=node.attrs['aria-label']
 if(node.attrs['data-id'])props['data-id']=node.attrs['data-id']
 for(const name of ['aria-selected','aria-controls','aria-labelledby','data-tab-index'])if(node.attrs[name])props[name]=node.attrs[name]
 const tabOrder=node.attrs.style?.match(/--n-tabs-(?:title|target)-order:\s*(\d+)/)?.[1]
 if(tabOrder)props.style={...(props.style as object||{}),'--n-tabs-title-order':tabOrder,'--n-tabs-target-order':tabOrder}
 if(tag==='img'&&node.attrs['data-payload-media']&&/^\/api\/media\/file\/[A-Za-z0-9._-]+$/.test(node.attrs.src??'')){
  // R1B: an editor-uploaded Payload media image renders from its own public media URL.
  props.src=node.attrs.src;props.alt=node.attrs.alt??'';props.loading='lazy'
  if(node.attrs.width)props.width=Number(node.attrs.width)
  if(node.attrs.height)props.height=Number(node.attrs.height)
  return createElement('img',props)
 }
 if(tag==='img'){
  const source=node.attrs['data-src']||node.attrs.src
  const media=source?salmonMedia(source,doc.sourceUrl):undefined
  if(!media?.file)return null
  const credential=home?credentialFor(media.sha256):undefined
  props.src=credential?.src??salmonMediaPath(media)
  props.alt=credential?.alt??(node.attrs.alt||(typeof loop==='string'?loop:''))
  props.width=credential?.width??(Number(node.attrs.width)||media.width)
  props.height=credential?.height??(Number(node.attrs.height)||media.height)
  props.loading='lazy'
  props['data-source-sha256']=credential?.sha256??media.sha256
 }
 if(tag==='a'){
  if(/\/testimonial-detail\/?(?:[?#]|$)/.test(node.attrs.href??''))return null
  const href=localHref(node.attrs.href??'',doc)
  if(!href)return createElement('span',props,...node.children.map((child,i)=>sourceNode(child,`${key}.${i}`,doc,loop)))
  // LEGAL-FIX-1 (L07): a link with no accessible name is unwrapped, made decorative beside its named twin, or named by its card
  const nameless=namelessLink(doc,key,node)
  if(nameless?.kind==='unwrap')return createElement(Fragment,{key},...node.children.map((child,i)=>sourceNode(child,`${key}.${i}`,doc,loop)))
  if(nameless?.kind==='decorative'){props['aria-hidden']='true';props.tabIndex=-1}
  // CLIENT-FIX-1 (A): the home "Explore Our Services" button went to /contact-us/ in the source; it opens the services overview (the header's Services hub).
  props.href=home&&salmonNodeText(node).replace(/\s+/g,' ').trim()==='Explore Our Services'?HOME_SERVICES_HUB:href
  props['data-source-href']=provenanceHref(node.attrs.href)
  if(node.attrs.target==='_blank'||isPdfHref(href)||isPdfHref(node.attrs.href)){props.target='_blank';props.rel='noopener noreferrer'}
  // R2.4 (item l): a "Learn more"-style link is named by its card's heading (./link-context); its visible text is unchanged.
  const label=nameless?.kind==='label'?nameless.label:linkLabel(doc,key)
  if(label)props['aria-label']=label
 }
 if(tag==='button'){
  props.type='button'
  if(node.attrs.role==='tab')props.role='tab'
  else props.disabled=true
 }
 if(tag==='details')props.open=true
 const children=node.children.map((child,i)=>sourceNode(child,`${key}.${i}`,doc,loop))
 return createElement(tag,props,...(voidTags.has(tag)?[]:children))
}

const testimonialSections=new Set(clientReviewAuthority.testimonialOverride.sourceSections)
const testimonialFirst=Number(clientReviewAuthority.testimonialOverride.sourceSections[0].split('.')[1])
export function SalmonPresentation({doc}:{doc:SalmonDocument}){
 const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
 const home=doc.targetPath==='/'
 return <div className={`luxury-site salmon-copy salmon-page-${home?'home':'newtowers'} elementor-kit-5 elementor-page-${home?'48':'1230'} elementor-${home?'48':'1230'}`} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
  <SalmonSeo doc={doc}/>
  <LuxuryHeader page={page} routePath={doc.targetPath} salmonParity/>
  <main id="main" className={`salmon-copy-main elementor elementor-${home?'48':'1230'} elementor-kit-5`} data-salmon-region="body">
   <SalmonTabsController/>
   {doc.children.map((node,i)=>{
    // TESTIMONIALS-RESTORE-1.1: the owner-approved featured testimonials replace the three Elementor slides (body.13/15/17) at the first slide's position, inside the .figma-home scope that carries the owner's original split presentation.
    if(home&&testimonialSections.has(`body.${i}`))return i===testimonialFirst?<div className="figma-home" key="client-testimonials"><ClientTestimonials/></div>:null
    return sourceNode(node,`body.${i}`,doc)
   })}
  </main>
  <LuxuryFooter page={page} routePath={doc.targetPath}/>
 </div>
}
