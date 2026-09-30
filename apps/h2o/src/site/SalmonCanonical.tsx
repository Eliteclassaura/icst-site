import {createElement,type ReactNode} from 'react'
import {Testimonials} from './HomeTestimonials'
import {LuxuryHeader,LuxuryFooter} from './LuxuryShell'
import {pageForSegments} from './cohort'
import {RfqMount} from './RfqMount'
import {renderQuoteAction,suppressedDuplicate} from '../content/rfq-controls'
import {contactOffices} from './contact'
import {AuthorityEditorial} from './AuthorityEditorial'
import {articleByline,articleDisplayTitle,articleHeadingNodes} from './wave4'
import {articleSocialTitle} from './article-metadata'
import {R2Discovery} from './R2Discovery'
import {ProjectAuthorityIndex} from './ProjectAuthorityIndex'
import {ProjectDetail} from './ProjectDetail'
import {commerceException,commerceMetaException,ownerHref,ownerText,salmonMedia,salmonMediaPath,salmonNodeText,type SalmonDocument,type SalmonNode} from './salmon'
const allowed=new Set('div section article header footer nav p h1 h2 h3 h4 h5 h6 a span b strong i em u s figure figcaption img ul ol li table thead tbody tfoot tr th td br hr blockquote cite time sup sub small details summary label output search'.split(' '))
const voids=new Set(['img','br','hr'])
const hrefSafe=(value:string):string|undefined=>/^(?:https?:|mailto:|tel:|\/|#)/i.test(value)?value:undefined
const PRICE_SPEC_ROUTES=new Set([
  '/product/amarillo-a-series-double-reduction-gearbox/',
  '/product/amarillo-double-reduction-gearbox/',
  '/product/frp-angles/',
  '/product/frp-channels/',
  '/product/frp-deck-board/',
  '/product/frp-flatsheet/',
])
const INDEX_HEADING_SOURCE='Order Cooling Tower Parts Online — Simple, Transparent, Fast'
const INDEX_HEADING_RENDERED='Cooling Tower Parts Online — Simple, Transparent, Fast'
const INDEX_PARAGRAPH_SOURCE='Full product specifications, compatibility details, and pricing are listed on our website for immediate reference. Products with listed prices are available for direct purchase.'
const INDEX_PARAGRAPH_RENDERED='Product specifications and compatibility details are provided where available. Contact ICS to request a quote.'
// Current owner geography authority supersedes only these historical About statements.
export const aboutGeographyCorrections=new Map([
  ['We are committed to delivering reliable solutions that improve system performance, operational stability, and long-term efficiency for industrial facilities across regional and international markets.','We are committed to delivering reliable solutions that improve system performance, operational stability, and long-term efficiency for industrial facilities.'],
  ['ICS combines the expertise of cooling tower professionals across our headquarters in Lakewood, Colorado, USA, and branch offices in Japan, Thailand, and the Philippines.','ICS combines cooling tower expertise from its main office in Lakewood, Colorado, with confirmed presence in Japan and Bangkok, Thailand.'],
  ['ICS’s USA headquarters are located in Lakewood, Colorado, where key engineering, design, procurement, and management functions are centralized. From this base, we support both domestic and global industrial clients with complete cooling tower solutions.','ICS’s main office is located in Lakewood, Colorado.'],
  ['ICS’s Thailand office in Bangkok serves as a strategic regional hub for Asia, providing complete support for industrial cooling operations across multiple markets.','ICS has a confirmed presence in Bangkok, Thailand.'],
  ['From this base, we manage project engineering, procurement, sales, after-sales services, field support, and technical assistance for cooling tower systems, ensuring fast and reliable service delivery across the region with rapid deployment across Asia and the Middle East.','ICS provides project engineering, procurement, field support, and technical assistance for cooling tower systems.'],
  ['ICS’s Japan office serves Japan, Korea, and China, providing comprehensive sales, after-sales service, engineering support, and project execution for industrial cooling tower systems.','ICS has a confirmed presence in Japan.'],
  ['We support new cooling tower installations, repair and upgrade projects, and supply spare parts for all major cooling tower models, ensuring reliable performance and long-term operational efficiency for industrial clients across the region.','ICS supports new cooling tower installations, repair and upgrade projects, and spare parts supply.'],
  ['Saudi Arabia',''],
])
export const normalizeWave3IndexEditorial=(value:string):string=>value.replace(INDEX_HEADING_SOURCE,INDEX_HEADING_RENDERED).replace(INDEX_PARAGRAPH_SOURCE,INDEX_PARAGRAPH_RENDERED)
export const normalizeWave3ProductDescription=(value:string):string=>value.replace(/^((?:[^?]+\?\s+)?)(?:Buy|Order|Shop)\b/i,(_,opening:string)=>`${opening}Request a quote for`)
// Owner-confirmed industrial business scope; retain source-backed product compatibility.
export const reconcileCommercialScope=(doc:SalmonDocument,value:string):string=>{
  switch(doc.targetPath){
    case '/product/high-efficiency-fill/':
      return value.replaceAll('Commercial HVAC cooling towers','Product compatibility: commercial HVAC cooling towers')
    case '/cooling-tower-rehabilitation-services/':
      return value.replaceAll('power generation, manufacturing, chemical processing, and commercial HVAC sectors','power generation, manufacturing, and chemical processing sectors')
    case '/cooling-tower-singapore/':
      return value.replaceAll('Manufacturing plants, data centers, and commercial HVAC systems all depend','Manufacturing plants and data centers depend').replaceAll('humid climates, space-limited facilities, HVAC integration, maintenance, and industrial cooling systems','humid climates, maintenance demands, and industrial cooling systems')
    case '/hvac-cooling-tower-systems/':
      return value.replaceAll('We specialize in engineering and retrofitting HVAC cooling tower systems','Our engineering and retrofit work focuses on industrial cooling tower systems')
    default:return value
  }
}
const priceSpecLabel=(node:Exclude<SalmonNode,string>,doc:SalmonDocument):string|null|undefined=>{
  if(!PRICE_SPEC_ROUTES.has(doc.targetPath)||!['p','li'].includes(node.tag)||node.children.length!==2)return undefined
  const [label,price]=node.children
  if(typeof label!=='string'||typeof price==='string'||price.tag!=='b'||!/^[\s\u00a0]*[$€£]\s*\d/.test(salmonNodeText(price)))return undefined
  const match=label.trim().match(/^(.*?)\s+(?:Unit\s+)?Price(?:\s+Range)?:\s*$/i)
  if(!match)return undefined
  const technicalLabel=match[1].trim()
  return /^(?:Estimated)?$/i.test(technicalLabel)?null:technicalLabel
}
function sourceImage(source:string,alt:string|undefined,key:string,doc:SalmonDocument,kind='img'):ReactNode{
  const media=salmonMedia(source,doc.sourceUrl)
  const local=media&&salmonMediaPath(media)
  if(!local&&doc.routeId.startsWith('LIVE-'))return <span key={key} className="r2-media-unavailable" role="img" aria-label={alt||'Historical source image unavailable'} data-source-src={source} data-source-media="UNAVAILABLE">Historical source image unavailable</span>
  if(!local)return null
  return createElement('img',{key,src:local,alt,'data-source-src':source,'data-source-kind':kind,'data-source-sha256':media.sha256,width:media.width,height:media.height,loading:'lazy',style:{maxWidth:media.width??'100%',height:'auto'}})
}
export function renderSalmonNode(node:SalmonNode,key:string,doc:SalmonDocument,suppressSourceByline=false):ReactNode{
  // Runtime RFQ (Payload content mode only): quote-intent actions use the approved adapter; D2 duplicate suppressed.
  // Accepted exclusion stub (../content/public-exclusions): renders nothing, keeps sibling keys.
  if(typeof node!=='string'&&(node as {attrs?:Record<string,string>}).attrs?.['data-public-exclusion'])return null
  if(suppressedDuplicate(doc,node as never))return null
  const quote=renderQuoteAction(doc,node as never,key,(original,k)=>renderSalmonNode(original as SalmonNode,k,doc,suppressSourceByline))
  if(quote!==undefined)return quote
  if(typeof node==='string')return doc.type==='product'&&/[$€£]\s*\d/.test(node)?<span data-salmon-exception="NO_PUBLIC_PRICE" data-source-node={key} key={key}/>:/^(?:Buy|Order|Purchase) Now$/i.test(node.trim())?<span data-salmon-exception="RFQ_ONLY" data-source-node={key} key={key}>Request a Quote</span>:ownerText(reconcileCommercialScope(doc,doc.routeId==='SALMON-pages-1931'?(aboutGeographyCorrections.get(node.trim())??node):doc.routeId==='SALMON-pages-411'?normalizeWave3IndexEditorial(node):node))
  if(commerceException(node))return <span data-salmon-exception="NO_PUBLIC_COMMERCE" data-source-node={key} key={key}/>
  if(['script','style','iframe','svg','template'].includes(node.tag))return null
  if(doc.type==='posts'&&/(?:^|\s)elementor-widget-post-info(?:\s|$)/.test(node.attrs.class??'')){
    if(suppressSourceByline)return null
    const byline=articleByline(doc)
    return byline?<p key={key} className="wave4-byline">By {byline.author}<span aria-hidden="true">|</span><time dateTime={byline.dateTime}>{byline.date}</time></p>:null
  }
  const priceLabel=priceSpecLabel(node,doc)
  if(priceLabel===null)return null
  if(priceLabel!==undefined)return createElement(node.tag,{key,'data-source-node':key,'data-salmon-exception':'NO_PUBLIC_PRICE'},priceLabel)
  const children=node.children.map((child,i)=>renderSalmonNode(child,`${key}.${i}`,doc,suppressSourceByline))
  if(['input','textarea'].includes(node.tag))return null
  const tag=allowed.has(node.tag)?node.tag:node.tag==='form'?'section':'span'
  const attrs=node.attrs
  // R1B: an editor-uploaded Payload media image (content slot) renders from its own public media URL.
  if(tag==='img'&&attrs['data-payload-media']&&/^\/api\/media\/file\/[A-Za-z0-9._-]+$/.test(attrs.src??''))return createElement('img',{key,src:attrs.src,alt:attrs.alt??'','data-payload-media':attrs['data-payload-media'],width:attrs.width?Number(attrs.width):undefined,height:attrs.height?Number(attrs.height):undefined,loading:'lazy',style:{maxWidth:'100%',height:'auto'}})
  if(tag==='img')return sourceImage(attrs['data-src']||attrs.src||'',attrs.alt,key,doc)
  const props:Record<string,unknown>={key,'data-source-node':key}
  if(attrs.id)props.id=attrs.id
  if(attrs.dir)props.dir=attrs.dir
  if(tag==='a'){
    const original=attrs.href??''
    const media=salmonMedia(original,doc.sourceUrl)
    if(media?.state==='SOURCE_UNAVAILABLE'&&/\.pdf(?:[?#]|$)/i.test(original))return <span key={key} data-source-href={original} data-source-download-unavailable="SOURCE_MEDIA_UNAVAILABLE">{children}</span>
    const local=media&&salmonMediaPath(media)
    const commerce=/[?&]add-to-cart=|\/(?:checkout|cart)\/?(?:[?#]|$)/i.test(original)
    props.href=commerce?undefined:hrefSafe(ownerHref(local??original))
    props['data-source-href']=original
    if(commerce)props['data-salmon-exception']='NO_PUBLIC_COMMERCE'
    if(/^(?:Buy|Order|Purchase) Now$/i.test(salmonNodeText(node).trim())){props.href='/contact-us/';props['data-salmon-exception']='RFQ_ONLY'}
    try{const target=new URL(original,doc.sourceUrl);if(target.pathname==='/contact-us/'&&['h2ocooling.com','www.h2ocooling.com','salmon-rhinoceros-754457.hostingersite.com'].includes(target.hostname))props.href='/contact-us/'}catch{/* Non-URL source anchors retain their safe form. */}
    if(media?.state==='SOURCE_UNAVAILABLE')props['data-source-download-unavailable']='SOURCE_MEDIA_UNAVAILABLE'
  }
  if(tag==='details')props.open=true
  if(tag==='ol'&&attrs.start)props.start=Number(attrs.start)
  for(const [a,b]of [['colspan','colSpan'],['rowspan','rowSpan']])if(attrs[a!])props[b!]=Number(attrs[a!])
  if(tag==='time'&&attrs.datetime)props.dateTime=attrs.datetime
  if(doc.type==='posts'&&/(?:^|\s)elementor-widget-posts(?:\s|$)/.test(attrs.class??''))props['data-pagefind-ignore']=''
  const backgrounds:ReactNode[]=[]
  if(attrs['data-settings']){
    try{const settings=JSON.parse(attrs['data-settings']) as Record<string,{url?:string}>
      for(const [name,value]of Object.entries(settings))if(name.includes('background')&&value?.url)backgrounds.push(sourceImage(value.url,undefined,`${key}-background-${name}`,doc,name))
    }catch{/* Historical presentation settings are never executable code. */}
  }
  const element=createElement(tag,props,...(voids.has(tag)?[]:tag==='h1'&&doc.type==='posts'&&/&amp;|&#0*38;|&#x0*26;/i.test(salmonNodeText(node))?[articleDisplayTitle(salmonNodeText(node))]:[...backgrounds,...children]))
  return tag==='table'?<div className="technical-table" key={key} role="region" tabIndex={0} aria-label="Scrollable source table">{element}</div>:element
}
export function SalmonSeo({doc,canonicalOverride}:{doc:SalmonDocument;canonicalOverride?:string}){
  const metaValue=(name:string,value:string)=>{
    if(name==='og:url'&&canonicalOverride&&value===doc.seo.canonical[0])return canonicalOverride
    if(name==='og:title'||name==='twitter:title')return articleSocialTitle(doc,value)
    if(!/^(?:description|og:description|twitter:description)$/.test(name))return value
    const scoped=reconcileCommercialScope(doc,value)
    if(doc.type==='product')return normalizeWave3ProductDescription(scoped)
    return doc.routeId==='SALMON-pages-411'?scoped.replace(/^Shop\b/i,'Explore'):scoped
  }
  return <>
    {doc.seo.meta.filter(m=>!['robots','googlebot','viewport'].includes(m.name)&&!commerceMetaException(m,doc)).map((m,i)=>m.name.startsWith('og:')||m.name.startsWith('article:')?<meta key={i} property={m.name} content={metaValue(m.name,m.value)}/>:<meta key={i} name={m.name} content={metaValue(m.name,m.value)}/>)}
    {doc.seo.schema.map((raw,i)=>{
      const stripCommerce=(value:unknown):unknown=>{
        if(Array.isArray(value))return value.map(stripCommerce)
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['offers','price','lowPrice','highPrice','priceCurrency'].includes(k)).map(([k,v])=>[k,stripCommerce(v)]))
        return typeof value==='string'?ownerText(value):value
      }
      const sourceSchema=JSON.stringify(stripCommerce(JSON.parse(raw)))
      const canonicalSchema=canonicalOverride&&doc.seo.canonical[0]?sourceSchema.replaceAll(doc.seo.canonical[0],canonicalOverride):sourceSchema
      return <script data-source-schema={i} key={i} type="application/ld+json" dangerouslySetInnerHTML={{__html:canonicalSchema.replaceAll('<','\\u003c')}}/>
    })}
  </>
}
export function SalmonCanonical({doc}:{doc:SalmonDocument}){
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  const isContact=doc.targetPath==='/contact-us/'
  const isEditorial=['SALMON-pages-1931','SALMON-b2503fcd6ca86806'].includes(doc.routeId)
  return <div className={`salmon-canonical${isContact?' figma-contact':''}`} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc}/>
    <div className="luxury-site"><LuxuryHeader page={page} routePath={doc.targetPath}/></div>
    {isContact?<main className="luxury-site figma-contact-main" id="main" data-salmon-region="body">
      <section className="figma-contact-hero">
        <img className="figma-contact-hero-photo" src="/media/figma-wave2/figma-image-2b0fc0527234a0c7.png" alt="" width="2338" height="2338" data-media-authority="ACCEPTED_WAVE2_INDUSTRIAL_SOURCE"/>
        <div className="figma-contact-hero-inner">
          <div className="figma-contact-title">{doc.children.map((n,i)=>renderSalmonNode(n,`body.${i}`,doc))}</div>
          <p className="figma-contact-lead">Tell us what your tower is doing and what you need it to do.</p>
        </div>
      </section>
      <div className="figma-contact-introduction"><span>ICS / CONTACT</span><h2>Request a parts quote or contact ICS today.</h2><p>Start with the working conversational request below, or use the verified office numbers for direct contact.</p></div>
      <section className="figma-contact-rfq" aria-labelledby="figma-contact-rfq-heading">
        <div className="figma-contact-rfq-copy">
          <h2 id="figma-contact-rfq-heading">Start Here</h2>
          <p>Tell us what your tower is doing and what you need it to do, and the enquiry is scoped and quoted. The request form is how every enquiry reaches ICS.</p>
          <h3>What to send</h3>
          <ul>
            <li>What you need: cooling tower parts, a new or rebuilt cooling tower, or repair and maintenance work</li>
            <li>The make, model, cell arrangement and duty of the tower</li>
            <li>Any documentation you hold for it — drawings, data sheets, previous inspection reports</li>
          </ul>
        </div>
        <div className="figma-contact-rfq-action" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
          {page?<div className="client-rfq figma-contact-action"><RfqMount mountId="rfq_page" page={page}/></div>:null}
          <p>Contact by phone</p>
          <div className="figma-contact-rfq-phones">{contactOffices.map(office=><a key={office.officeKey} href={office.telephoneHref}><span>{office.displayLabel}</span><strong>{office.telephoneDisplay}</strong></a>)}</div>
        </div>
      </section>
      <section className="figma-contact-offices" aria-labelledby="figma-contact-offices-heading" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
        <div className="figma-contact-offices-inner">
          <h2 id="figma-contact-offices-heading">Offices</h2>
          <div className="figma-contact-office-list">{contactOffices.map(office=><address key={office.officeKey} data-office={office.officeKey}>
            <h3>{office.displayLabel}</h3>
            {office.company?<span>{office.company}</span>:null}
            {office.addressLines.map(line=><span key={line}>{line}</span>)}
            {office.city?<span>{office.city}{office.region?`, ${office.region}`:''}{office.postalCode?` ${office.postalCode}`:''}</span>:null}
            {office.officeKey!=='japan'?<span>{office.countryName}</span>:null}
            <a href={office.telephoneHref}>{office.telephoneDisplay}</a>
          </address>)}</div>
        </div>
      </section>
    </main>:isEditorial?<AuthorityEditorial doc={doc}/>:doc.routeId==='SALMON-pages-1353'?<ProjectAuthorityIndex doc={doc}/>:doc.targetPath.startsWith('/all-projects/')?<ProjectDetail doc={doc}/>:<main className="shell article" id="main" data-salmon-region="body">{(doc.routeId==='SALMON-pages-5792'?articleHeadingNodes(doc.children):doc.children).map((n,i)=>renderSalmonNode(n,`body.${i}`,doc))}</main>}
    {doc.routeId==='SALMON-pages-1761'?<R2Discovery kind="pages"/>:null}
    {doc.targetPath==='/'?<section className="shell" data-owner-override="OWNER_TESTIMONIAL_AUTHORITY_OVERRIDE_2026_09_21"><Testimonials/></section>:null}
    <div className="luxury-site"><LuxuryFooter page={page} routePath={doc.targetPath}/></div>
  </div>
}
