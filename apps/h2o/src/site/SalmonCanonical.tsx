import {createElement,Fragment,type ReactNode} from 'react'
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
import {normalizeWave3ProductDescription,publicSourceString,reconcileCommercialScope} from './public-text'
import {deliverySrc} from './media-delivery'
import {PUBLIC_AUTHOR} from './public-author-identity'
import {BreadcrumbSchema,HOME_CRUMB,isBreadcrumbList,type Crumb} from './breadcrumb-schema'
import {decodeEntities} from './text-repair'
import {pageCopy} from './page-copy'
import {publicMeta,publicSchema,servedOrigin} from './public-urls'
import {publicFileExists} from '../content/public-files'
import {projectHeadImagePolicy} from './project-media'
import {nativeIntakeOn} from '../rfq-native/server'
import {NativeRfqFormSection} from '../rfq-native/NativeRfqForm'
export {aboutGeographyCorrections,normalizeWave3IndexEditorial,normalizeWave3ProductDescription,publicSourceString,reconcileCommercialScope} from './public-text'
// Start tags that implicitly close an open <p> in the HTML parser. A source <p> holding one of these cannot be
// represented in HTML: the browser closes the paragraph first and hydration then sees a different tree (#418).
const CLOSES_PARAGRAPH=new Set('address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul'.split(' '))
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
  return createElement('img',{key,src:deliverySrc(local),alt,'data-source-src':source,'data-source-kind':kind,'data-source-sha256':media.sha256,width:media.width,height:media.height,loading:'lazy',style:{maxWidth:media.width??'100%',height:'auto'}})
}
export function renderSalmonNode(node:SalmonNode,key:string,doc:SalmonDocument,suppressSourceByline=false):ReactNode{
  // Runtime RFQ (Payload content mode only): quote-intent actions use the approved adapter; D2 duplicate suppressed.
  // Accepted exclusion stub (../content/public-exclusions): renders nothing, keeps sibling keys.
  if(typeof node!=='string'&&(node as {attrs?:Record<string,string>}).attrs?.['data-public-exclusion'])return null
  if(suppressedDuplicate(doc,node as never))return null
  const quote=renderQuoteAction(doc,node as never,key,(original,k)=>renderSalmonNode(original as SalmonNode,k,doc,suppressSourceByline))
  if(quote!==undefined)return quote
  if(typeof node==='string')return doc.type==='product'&&/[$€£]\s*\d/.test(node)?<span data-salmon-exception="NO_PUBLIC_PRICE" data-source-node={key} key={key}/>:/^(?:Buy|Order|Purchase) Now$/i.test(node.trim())?<span data-salmon-exception="RFQ_ONLY" data-source-node={key} key={key}>Request a Quote</span>:publicSourceString(doc,node)
  if(commerceException(node))return <span data-salmon-exception="NO_PUBLIC_COMMERCE" data-source-node={key} key={key}/>
  if(['script','style','iframe','svg','template'].includes(node.tag))return null
  if(doc.type==='posts'&&/(?:^|\s)elementor-widget-post-info(?:\s|$)/.test(node.attrs.class??'')){
    if(suppressSourceByline)return null
    const byline=articleByline(doc)
    return byline?<p key={key} className="wave4-byline"><span>By {byline.author===PUBLIC_AUTHOR.name?<a href={PUBLIC_AUTHOR.path}>{byline.author}</a>:byline.author}</span><span aria-hidden="true">|</span><time dateTime={byline.dateTime}>{byline.date}</time></p>:null
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
    // A link that already names a file this site serves (a held public file, e.g. a restored WordPress upload) keeps that
    // canonical path; only links without one are rewritten to the hashed media alias (CT follow-up, Round 1 hosted checks).
    const local=servedFilePath(original,doc.sourceUrl)??(media&&salmonMediaPath(media))
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
  // Split a paragraph around block children exactly as the parser would; inline runs stay paragraphs.
  if(tag==='p'&&node.children.some(child=>typeof child!=='string'&&CLOSES_PARAGRAPH.has(allowed.has(child.tag)?child.tag:child.tag==='form'?'section':'span'))){
    const parts:ReactNode[]=[];let run:ReactNode[]=[];let runHasContent=false
    const flush=()=>{if(runHasContent)parts.push(createElement('p',{...props,key:`${key}~${parts.length}`},...run));run=[];runHasContent=false}
    node.children.forEach((child,i)=>{
      const rendered=typeof child!=='string'&&allowed.has(child.tag)?child.tag:typeof child!=='string'&&child.tag==='form'?'section':'span'
      if(typeof child!=='string'&&CLOSES_PARAGRAPH.has(rendered)){flush();parts.push(children[i]);return}
      run.push(children[i]);if(typeof child!=='string'||child.trim())runHasContent=true
    })
    flush()
    return createElement(Fragment,{key},...parts)
  }
  const element=createElement(tag,props,...(voids.has(tag)?[]:tag==='h1'&&doc.type==='posts'&&/&amp;|&#0*38;|&#x0*26;/i.test(salmonNodeText(node))?[articleDisplayTitle(salmonNodeText(node))]:[...backgrounds,...children]))
  return tag==='table'?<div className="technical-table" key={key} role="region" tabIndex={0} aria-label="Scrollable source table">{element}</div>:element
}
/** The public meta description: owner business-scope corrections, and the quote-only wording on products. One description
 * tag per page: Next metadata renders it (see the catch-all page); SalmonSeo renders the social descriptions only. */
export function publicMetaText(doc:SalmonDocument,value:string):string{
  const scoped=reconcileCommercialScope(doc,value)
  if(doc.type==='product')return normalizeWave3ProductDescription(scoped)
  return doc.routeId==='SALMON-pages-411'?scoped.replace(/^Shop\b/i,'Explore'):scoped
}
export const publicDescription=(doc:SalmonDocument):string|undefined=>{const value=doc.seo.meta.find(meta=>meta.name==='description')?.value;return value===undefined?undefined:publicMetaText(doc,value)}
/** The page's own name in its breadcrumb trail: the rendered H1, else the document title. */
export const breadcrumbName=(doc:SalmonDocument):string=>articleDisplayTitle(decodeEntities(doc.seo.h1[0]||doc.title)).replace(/\s+/g,' ').trim()
/** `breadcrumb` is the trail the template renders above the page (default: Home). */
const OWN_HOSTS=new Set(['h2ocooling.com','www.h2ocooling.com','salmon-rhinoceros-754457.hostingersite.com'])
/** The site path of a link to a held public file (public-files), or undefined. */
export const servedFilePath=(href:string,base:string):string|undefined=>{
  try{
    const u=new URL(href,base)
    if(!OWN_HOSTS.has(u.hostname)||u.search||!publicFileExists(u.pathname))return undefined
    return u.pathname+u.hash
  }catch{return undefined}
}
export function SalmonSeo({doc,canonicalOverride,breadcrumb=[HOME_CRUMB],crumbName}:{doc:SalmonDocument;canonicalOverride?:string;breadcrumb?:Crumb[];crumbName?:string}){
  const metaValue=(name:string,value:string)=>{
    if(name==='og:url'&&canonicalOverride&&value===doc.seo.canonical[0])return canonicalOverride
    if(name==='og:title'||name==='twitter:title')return articleSocialTitle(doc,value)
    if(!/^(?:og:description|twitter:description)$/.test(name))return value
    return publicMetaText(doc,value)
  }
  // R2.3 (CT 2026-10-05): every URL in the head names this site (./public-urls): identity URLs the canonical origin, media the
  // served file on the serving origin (C1–C6 crop/withhold included); an unheld image or a foreign host is dropped.
  const images=projectHeadImagePolicy(canonicalOverride?new URL(canonicalOverride).pathname:doc.targetPath,servedOrigin())
  return <>
    {publicMeta(doc.seo.meta,images).filter(m=>!['robots','googlebot','viewport','description'].includes(m.name)&&!commerceMetaException(m,doc)).map((m,i)=>m.name.startsWith('og:')||m.name.startsWith('article:')?<meta key={i} property={m.name} content={metaValue(m.name,m.value)}/>:<meta key={i} name={m.name} content={metaValue(m.name,m.value)}/>)}
    {doc.seo.schema.map((raw,i)=>{
      if(isBreadcrumbList(JSON.parse(raw)))return null
      // Quote-only estate: no prices, and no ratings or reviews (Control Tower ruling 2026-10-02).
      const review=(value:unknown)=>Boolean(value)&&typeof value==='object'&&['Review','AggregateRating'].includes(String((value as Record<string,unknown>)['@type']))
      const stripCommerce=(value:unknown):unknown=>{
        if(Array.isArray(value))return value.filter(item=>!review(item)&&!isBreadcrumbList(item)).map(stripCommerce)
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['offers','price','lowPrice','highPrice','priceCurrency','aggregateRating','review','reviews'].includes(k)).map(([k,v])=>[k,stripCommerce(v)]))
        return typeof value==='string'?ownerText(value):value
      }
      const sourceSchema=JSON.stringify(publicSchema(stripCommerce(JSON.parse(raw)),images))
      const canonicalSchema=canonicalOverride&&doc.seo.canonical[0]?sourceSchema.replaceAll(doc.seo.canonical[0],canonicalOverride):sourceSchema
      return <script data-source-schema={i} key={i} type="application/ld+json" dangerouslySetInnerHTML={{__html:canonicalSchema.replaceAll('<','\\u003c')}}/>
    })}
    <BreadcrumbSchema ancestors={breadcrumb} current={{name:crumbName??breadcrumbName(doc),path:canonicalOverride?new URL(canonicalOverride).pathname:doc.targetPath}}/>
  </>
}
export function SalmonCanonical({doc}:{doc:SalmonDocument}){
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  const isContact=doc.targetPath==='/contact-us/'
  const copy=pageCopy().contact
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
      {/* OGCS pre-launch copy R1 §2 (CT accepted 2026-10-05): the copy is data, content/design/page-copy.json. */}
      <div className="figma-contact-introduction">{copy.eyebrow?<span>{copy.eyebrow}</span>:null}<h2 id="figma-contact-intro-heading">{copy.heading}</h2><p>{copy.lead}</p></div>
      <section className="figma-contact-rfq" aria-labelledby={copy.requestHeading?'figma-contact-rfq-heading':'figma-contact-intro-heading'}>
        <div className="figma-contact-rfq-copy">
          {copy.requestHeading?<h2 id="figma-contact-rfq-heading">{copy.requestHeading}</h2>:null}
          <p>{copy.requestBody}</p>
          <h3>What to send</h3>
          <ul>
            <li>What you need: cooling tower parts, a new or rebuilt cooling tower, or repair and maintenance work</li>
            <li>The make, model, cell arrangement and duty of the tower</li>
            <li>Any documentation you hold for it — drawings, data sheets, previous inspection reports</li>
          </ul>
        </div>
        <div className="figma-contact-rfq-action" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
          {/* Native RFQ (CT brief 2026-10-05): with native intake on, the inline form replaces the Typeform action here. */}
          {!nativeIntakeOn()&&page?<div className="client-rfq figma-contact-action"><RfqMount mountId="rfq_page" page={page}/></div>:null}
          <p>Contact by phone</p>
          <div className="figma-contact-rfq-phones">{contactOffices.map(office=><a key={office.officeKey} href={office.telephoneHref}><span>{office.displayLabel}</span><strong>{office.telephoneDisplay}</strong></a>)}</div>
        </div>
      </section>
      {/* Native RFQ (CT brief 2026-10-05): with native intake on, the inline quote form is its own section here. */}
      {nativeIntakeOn()?<NativeRfqFormSection/>:null}
      <section className="figma-contact-offices" id="offices" aria-labelledby="figma-contact-offices-heading" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
        <div className="figma-contact-offices-inner">
          <h2 id="figma-contact-offices-heading">Offices</h2>
          <div className="figma-contact-office-list">{contactOffices.map(office=><address key={office.officeKey} data-office={office.officeKey}>
            <h3>{copy.officeTitles[office.officeKey]??office.displayLabel}</h3>
            {office.company?<span>{office.company}</span>:null}
            {office.addressLines.map(line=><span key={line}>{line}</span>)}
            {office.city?<span>{office.city}{office.region?`, ${office.region}`:''}{office.postalCode?` ${office.postalCode}`:''}</span>:null}
            {office.officeKey!=='japan'?<span>{office.countryName}</span>:null}
            <a href={office.telephoneHref}>{office.addressLines.length===0?copy.phoneOnlyPrefix:''}{office.telephoneDisplay}</a>
          </address>)}</div>
        </div>
      </section>
    </main>:isEditorial?<AuthorityEditorial doc={doc}/>:doc.routeId==='SALMON-pages-1353'?<ProjectAuthorityIndex doc={doc}/>:doc.targetPath.startsWith('/all-projects/')?<ProjectDetail doc={doc}/>:<main className="shell article" id="main" data-salmon-region="body">{(doc.routeId==='SALMON-pages-5792'?articleHeadingNodes(doc.children):doc.children).map((n,i)=>renderSalmonNode(n,`body.${i}`,doc))}</main>}
    {doc.routeId==='SALMON-pages-1761'?<R2Discovery kind="pages"/>:null}
    {doc.targetPath==='/'?<section className="shell" data-owner-override="OWNER_TESTIMONIAL_AUTHORITY_OVERRIDE_2026_09_21"><Testimonials/></section>:null}
    <div className="luxury-site"><LuxuryFooter page={page} routePath={doc.targetPath}/></div>
  </div>
}
