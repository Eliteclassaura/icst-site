import {createElement,type ReactNode} from 'react'
import {Testimonials} from './HomeTestimonials'
import {LuxuryHeader,LuxuryFooter} from './LuxuryShell'
import {pageForSegments} from './cohort'
import {RfqMount} from './RfqMount'
import {commerceException,commerceMetaException,ownerHref,ownerText,salmonMedia,salmonMediaPath,salmonNodeText,type SalmonDocument,type SalmonNode} from './salmon'
const allowed=new Set('div section article header footer nav p h1 h2 h3 h4 h5 h6 a span b strong i em u s figure figcaption img ul ol li table thead tbody tfoot tr th td br hr blockquote cite time sup sub small details summary label output search'.split(' '))
const voids=new Set(['img','br','hr'])
const hrefSafe=(value:string):string|undefined=>/^(?:https?:|mailto:|tel:|\/|#)/i.test(value)?value:undefined
function sourceImage(source:string,alt:string|undefined,key:string,doc:SalmonDocument,kind='img'):ReactNode{
  const media=salmonMedia(source,doc.sourceUrl)
  const local=media&&salmonMediaPath(media)
  if(!local)return null
  return createElement('img',{key,src:local,alt,'data-source-src':source,'data-source-kind':kind,'data-source-sha256':media.sha256,width:media.width,height:media.height,loading:'lazy',style:{maxWidth:media.width??'100%',height:'auto'}})
}
export function renderSalmonNode(node:SalmonNode,key:string,doc:SalmonDocument):ReactNode{
  if(typeof node==='string')return doc.type==='product'&&/[$€£]\s*\d/.test(node)?<span data-salmon-exception="NO_PUBLIC_PRICE" data-source-node={key} key={key}/>:node.trim()==='Buy Now'?<span data-salmon-exception="RFQ_ONLY" data-source-node={key} key={key}>Request a Quote</span>:ownerText(node)
  if(commerceException(node))return <span data-salmon-exception="NO_PUBLIC_COMMERCE" data-source-node={key} key={key}/>
  if(['script','style','iframe','svg','template'].includes(node.tag))return null
  const children=node.children.map((child,i)=>renderSalmonNode(child,`${key}.${i}`,doc))
  if(['input','textarea'].includes(node.tag))return null
  const tag=allowed.has(node.tag)?node.tag:node.tag==='form'?'section':'span'
  const attrs=node.attrs
  if(tag==='img')return sourceImage(attrs['data-src']||attrs.src||'',attrs.alt,key,doc)
  const props:Record<string,unknown>={key,'data-source-node':key}
  if(attrs.id)props.id=attrs.id
  if(attrs.dir)props.dir=attrs.dir
  if(tag==='a'){
    const original=attrs.href??''
    const media=salmonMedia(original,doc.sourceUrl)
    const local=media&&salmonMediaPath(media)
    const commerce=/[?&]add-to-cart=|\/(?:checkout|cart)\/?(?:[?#]|$)/i.test(original)
    props.href=commerce?undefined:hrefSafe(ownerHref(local??original))
    props['data-source-href']=original
    if(commerce)props['data-salmon-exception']='NO_PUBLIC_COMMERCE'
    if(salmonNodeText(node).trim()==='Buy Now'){props.href='/contact-us/';props['data-salmon-exception']='RFQ_ONLY'}
    try{const target=new URL(original,doc.sourceUrl);if(target.pathname==='/contact-us/'&&['h2ocooling.com','www.h2ocooling.com','salmon-rhinoceros-754457.hostingersite.com'].includes(target.hostname))props.href='/contact-us/'}catch{/* Non-URL source anchors retain their safe form. */}
    if(media?.state==='SOURCE_UNAVAILABLE')props['data-source-download-unavailable']='SOURCE_MEDIA_UNAVAILABLE'
  }
  if(tag==='details')props.open=true
  if(tag==='ol'&&attrs.start)props.start=Number(attrs.start)
  for(const [a,b]of [['colspan','colSpan'],['rowspan','rowSpan']])if(attrs[a!])props[b!]=Number(attrs[a!])
  if(tag==='time'&&attrs.datetime)props.dateTime=attrs.datetime
  const backgrounds:ReactNode[]=[]
  if(attrs['data-settings']){
    try{const settings=JSON.parse(attrs['data-settings']) as Record<string,{url?:string}>
      for(const [name,value]of Object.entries(settings))if(name.includes('background')&&value?.url)backgrounds.push(sourceImage(value.url,undefined,`${key}-background-${name}`,doc,name))
    }catch{/* Historical presentation settings are never executable code. */}
  }
  const element=createElement(tag,props,...(voids.has(tag)?[]:[...backgrounds,...children]))
  return tag==='table'?<div className="technical-table" key={key} role="region" tabIndex={0} aria-label="Scrollable source table">{element}</div>:element
}
export function SalmonSeo({doc}:{doc:SalmonDocument}){
  return <>
    {doc.seo.meta.filter(m=>!['robots','googlebot','viewport'].includes(m.name)&&!commerceMetaException(m,doc)).map((m,i)=>m.name.startsWith('og:')||m.name.startsWith('article:')?<meta key={i} property={m.name} content={m.value}/>:<meta key={i} name={m.name} content={m.value}/>)}
    {doc.seo.schema.map((raw,i)=>{
      const stripCommerce=(value:unknown):unknown=>{
        if(Array.isArray(value))return value.map(stripCommerce)
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['offers','price','lowPrice','highPrice','priceCurrency'].includes(k)).map(([k,v])=>[k,stripCommerce(v)]))
        return typeof value==='string'?ownerText(value):value
      }
      return <script data-source-schema={i} key={i} type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(stripCommerce(JSON.parse(raw))).replaceAll('<','\\u003c')}}/>
    })}
  </>
}
export function SalmonCanonical({doc}:{doc:SalmonDocument}){
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  return <div className="salmon-canonical" data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
    <SalmonSeo doc={doc}/>
    <div className="luxury-site"><LuxuryHeader page={page}/></div>
    <main className="shell article" id="main" data-salmon-region="body">{doc.children.map((n,i)=>renderSalmonNode(n,`body.${i}`,doc))}</main>
    {doc.targetPath==='/contact-us/'&&page?<section className="luxury-site client-rfq" aria-label="Request a Quote" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21"><RfqMount mountId="rfq_page" page={page}/></section>:null}
    {doc.targetPath==='/'?<section className="shell" data-owner-override="OWNER_TESTIMONIAL_AUTHORITY_OVERRIDE_2026_09_21"><Testimonials/></section>:null}
    <div className="luxury-site"><LuxuryFooter page={page}/></div>
  </div>
}
