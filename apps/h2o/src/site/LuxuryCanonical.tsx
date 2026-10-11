import {pdfLinkProps} from './link-attrs'
import {createElement,type CSSProperties,type ReactNode} from 'react'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {SalmonSeo,renderSalmonNode} from './SalmonCanonical'
import {ownerText,ownerHref,provenanceHref,salmonMedia,salmonMediaPath,salmonNodeText,type SalmonDocument,type SalmonNode} from './salmon'
import {LuxuryHeader,LuxuryFooter,LuxurySearch} from './LuxuryShell'
import {pageForSegments} from './cohort'
import {ClientTestimonials,clientReviewAuthority} from './ClientReview'
import {ServiceImage,ServicePage,serviceCompositions} from './ServiceComposition'
import {TowerDisclosure} from './TowerDisclosure'
import {HomePartsCatalog} from './HomePartsCatalog'
import {homePartCatalogData} from './HomePartsData'
import {SalmonPresentation} from './SalmonPresentation'
import {englishServicePages} from './EnglishServices'
import {heroQuoteAction,rfqControlElement,rfqControlLabelAt} from '../content/rfq-controls'
import {heroActionFor,heroSecondaryHref} from './hero-actions'
import {deliverySrc} from './media-delivery'
import {RestoredSlot} from './RestoredSlot'
import {r4Builders,r4PlacesRestored} from './r4/R4Pages'
import {R4LauncherReveal} from './r4/R4LauncherReveal'
import type {R4Api,R4ButtonVariant} from './r4/R4System'
type LayoutNode={tag:string;style?:CSSProperties;id?:number;children?:LayoutNode[];ref?:string;refs?:string[];slice?:{ref:string;start:number;end:number};decor?:string;action?:string;src?:string;alt?:string;key?:string}
type Model={route:string;sourceId:string;tree:LayoutNode[];remaining:Array<{sourceSection:string;tree:LayoutNode}>}
export const luxuryIds=new Set(['SALMON-pages-48','SALMON-pages-1230','SALMON-pages-1446','SALMON-pages-1534','SALMON-pages-1555','SALMON-pages-1572','SALMON-pages-1668','SALMON-pages-1722','SALMON-pages-411'])
const safe=(href:string)=>/^(https?:|mailto:|tel:|\/|#)/i.test(href)?href:undefined
export function LuxuryCanonical({doc}:{doc:SalmonDocument}){
 if(doc.targetPath==='/'||(doc.targetPath==='/cooling-tower/'&&!r4Builders[doc.routeId]))return <SalmonPresentation doc={doc}/>
 const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
 const model=JSON.parse(readFileSync(path.join(process.cwd(),'content/luxury',doc.routeId.split('-').at(-1)+'.json'),'utf8')) as Model
 const serviceComposition=serviceCompositions[doc.routeId]
 const homeParts=doc.targetPath==='/'?homePartCatalogData():null
 // Design Fixes R2 (#7): the hero's first signal action is the quote action, label from content/design/hero-actions.json.
 const heroAction=serviceComposition?heroActionFor(doc.targetPath):undefined
 const firstSignal=(n:LayoutNode|undefined):LayoutNode|undefined=>!n?undefined:n.style?.background==='#B2461C'?n:(n.children??[]).reduce<LayoutNode|undefined>((found,c)=>found??firstSignal(c),undefined)
 const heroSignal=heroAction&&!heroAction.sourceLabel?firstSignal(model.tree[0]):undefined
 const nodes=new Map<string,SalmonNode>(),ancestors=new Map<string,string[]>(),usedImages=new Set<string>()
 function index(n:SalmonNode,key:string,parents:string[]){nodes.set(key,n);ancestors.set(key,parents);if(typeof n!=='string')n.children.forEach((c,i)=>index(c,key+'.'+i,[...parents,key]))}
 doc.children.forEach((n,i)=>index(n,'body.'+i,[]))
 function hrefFor(key:string):string|undefined{for(const k of [key,...(ancestors.get(key)??[]).toReversed()]){const n=nodes.get(k);if(n&&typeof n!=='string'&&n.tag==='a'&&n.attrs.href)return n.attrs.href}return undefined}
 function href(h:string){const m=salmonMedia(h,doc.sourceUrl);if(m?.file)return salmonMediaPath(m);try{const u=new URL(h,doc.sourceUrl);if(['salmon-rhinoceros-754457.hostingersite.com','h2ocooling.com','www.h2ocooling.com'].includes(u.hostname)&&!u.pathname.startsWith('/wp-content/'))return u.pathname+u.search+u.hash}catch{/* Invalid historical href remains inert. */}return safe(ownerHref(h))}
 function leaf(text:string,key:string,start=0,end?:number):ReactNode{const rfqLabel=rfqControlLabelAt(doc,key,nodes,ancestors);if(rfqLabel!==null&&text.replace(/\s+/g,' ').trim()===rfqLabel){const control=rfqControlElement(doc,key+'.'+start,rfqLabel);if(control!==undefined)return control}const original=hrefFor(key);const label=ownerText(text.trim()==='Buy Now'?'Request a Quote':text);return <span key={key+'.'+start} data-canonical-text={key} data-canonical-start={start} data-canonical-end={end??text.length} data-presentation-exception={text.trim()==='Buy Now'?'RFQ_ONLY':undefined}>{original?<a data-source-href={provenanceHref(original)} href={text.trim()==='Buy Now'?'/contact-us/':href(original)} {...pdfLinkProps(href(original))}>{label}</a>:label}</span>}
 function content(n:SalmonNode,key:string):ReactNode{
  if(typeof n==='string')return leaf(n,key)
  if(['script','style','iframe','svg','template','input','textarea'].includes(n.tag))return null
  if(n.tag==='img'){usedImages.add(n.attrs['data-src']||n.attrs.src);return renderSalmonNode(n,key,doc)}
  const children=n.children.map((c,i)=>content(c,key+'.'+i))
  if(n.tag==='a')return <span key={key}>{children}</span>
  if(['h1','h2','h3','h4','h5','h6','p','li','ul','ol','table','tr','td','th','tbody','thead','strong','em','br','figcaption','figure'].includes(n.tag))return createElement(n.tag,{key},...(n.tag==='br'?[]:children))
  return <span className="lux-source-contents" key={key}>{children}</span>
 }
 function source(key:string):ReactNode {const n=nodes.get(key);return n===undefined?null:content(n,key)}
 // PLACEHOLDER-CARDS-1 blanks the retired demo-product cards to a public-exclusion stub, so the keys under them no longer exist. A layout subtree that
 // points at a gone key (missing, or the stub itself) and at nothing else but button labels ("Buy Now", the model shares one label per card row) is that
 // card's frame, with its picture: it draws nothing, like the stub, and no lookup below can miss.
 const goneKey=(k:string)=>{const v=nodes.get(k);return v===undefined||(typeof v!=='string'&&Boolean(v.attrs['data-public-exclusion']))}
 const buttonLabel=/^(Contact|Request|Talk to|Explore Our Services|View Product|Download Specifications|See all projects|Learn more|Load More|Buy Now)/i
 const liveContent=(k:string)=>{const v=nodes.get(k);return v!==undefined&&!goneKey(k)&&!buttonLabel.test(salmonNodeText(v).trim())}
 const refCounts=new WeakMap<LayoutNode,{gone:number;live:number}>()
 function countRefs(n:LayoutNode):{gone:number;live:number}{
  const known=refCounts.get(n);if(known)return known
  const own=[...(n.ref?[n.ref]:[]),...(n.refs??[]),...(n.slice?[n.slice.ref]:[])]
  const total={gone:own.filter(goneKey).length,live:own.filter(liveContent).length}
  for(const c of n.children??[]){const k=countRefs(c);total.gone+=k.gone;total.live+=k.live}
  refCounts.set(n,total);return total
 }
 const vanished=(n:LayoutNode)=>{const k=countRefs(n);return k.gone>0&&k.live===0}
 function design(n:LayoutNode,key:string,root=false):ReactNode{
  if(!root&&vanished(n))return null
  if(doc.targetPath==='/'&&n.id===clientReviewAuthority.testimonialOverride.layoutNode)return <ClientTestimonials key={key}/>
  if(homeParts&&n.id===56)return <HomePartsCatalog key={key} data={homeParts}/>
  if(homeParts&&n.id===67)return null
  if(n.ref&&typeof nodes.get(n.ref)==='string')return source(n.ref)
  const size=Number.parseFloat(String(n.style?.fontSize??0))
  const props:Record<string,unknown>={key,style:n.style,className:['lux-node',root?'lux-section':'',size>=65?'lux-display-1':size>=40?'lux-display-2':size>=23?'lux-display-3':size>0?'lux-reading-type':'',n.style?.display==='grid'?'lux-grid':'',/^(44|96|110)px /.test(String(n.style?.gridTemplateColumns??''))?'lux-index-row':'',n.style?.display==='flex'?'lux-flex':'',n.style?.position==='absolute'?'lux-absolute':'',n.style?.fontFamily?.includes('Mono')?'lux-mono':'',n.style?.background==='#0B1114'?'lux-dark':'',n.style?.background==='#B2461C'?'lux-signal':''].filter(Boolean).join(' '),'data-layout-node':n.id}
  if(n.tag==='img'){
   if(doc.routeId==='SALMON-pages-1230'&&n.id===2)return <img {...props} key={key} src="/media/client-review/d88ec30b8ddc425c-ICS-PTT-PO-July-16.jpeg" alt={n.alt??''} width={1334} height={1001} loading="eager" fetchPriority="high" data-source-sha256="d88ec30b8ddc425c6b27429b27637a9baebefc43a188ac9668ed3ef8d50f3d35" data-project-attribution="none"/>
   if(doc.targetPath==='/'&&n.id===164)return <img {...props} key={key} src="/media/client-review/d88ec30b8ddc425c-ICS-PTT-PO-July-16.jpeg" alt="Large industrial cooling tower installation with multiple fan cells" width={1334} height={1001} loading="lazy" data-precision-media="OWNER_OVERRIDE" data-source-sha256="d88ec30b8ddc425c6b27429b27637a9baebefc43a188ac9668ed3ef8d50f3d35"/>
   if(serviceComposition?.suppress?.includes(n.id??-1))return null
   const serviceMedia=serviceComposition?.replace[n.id??-1]
   if(serviceMedia)return <ServiceImage key={key} media={serviceMedia} layoutNode={n.id}/>
   const figmaMedia=doc.targetPath==='/'?({
    2:{src:'/media/figma-home/21-1045-f28c7430.png',alt:'Industrial cooling infrastructure at a large plant',width:2880,height:2160,node:'21:1045',sha256:'06c98dd9e29f402ce348e0636c73955a938faedab6b982518635d25140f0c107'},
    51:{src:'/media/figma-home/21-1055-aa90dce1.jpg',alt:'Industrial cooling tower construction site',width:1280,height:960,node:'21:1055',sha256:'f3f4a80cef5bfa1020981c19487cca105b7975d12b1139a01fb6d89fddc63019'},
    164:{src:'/media/figma-home/21-1295-fcf10d82.png',alt:'',width:1024,height:1024,node:'21:1295',sha256:'f62d34f4682140c43b139496033912587283d692fe0568b61cb395cc8731b27f'},
   } as Record<number,{src:string;alt:string;width:number;height:number;node:string;sha256:string}>)[n.id??-1]:undefined
   return <img {...props} key={key} style={figmaMedia&&n.id===164?{...n.style,height:'auto',objectFit:'contain',alignSelf:'center'}:n.style} src={deliverySrc(figmaMedia?.src??n.src)} alt={figmaMedia?.alt??n.alt??''} width={figmaMedia?.width} height={figmaMedia?.height} data-figma-node={figmaMedia?.node} data-figma-media-sha256={figmaMedia?.sha256} loading={n.id===2?'eager':'lazy'} fetchPriority={n.id===2?'high':undefined}/>
  }
  if(n.action==='rfq')return <a {...props} href="/contact-us/">Request a Quote</a>
  if(n.action==='search')return null
  if(n.action==='search-form')return <LuxurySearch key={key} label={n.refs?.[0]?source(n.refs[0]):undefined} submit={n.refs?.[1]?source(n.refs[1]):undefined}/>
  if(n.decor)return <span {...props} aria-hidden="true">{n.decor}</span>
  if(heroAction&&n===heroSignal){
   const quote=createElement(n.tag,{...props,'data-hero-action':'quote'},heroQuoteAction(doc,'hero-primary',heroAction.label))
   return heroAction.secondary?<div className="lux-hero-actions" key={key+'.actions'}>{quote}<a className="lux-hero-secondary" href={heroSecondaryHref(heroAction.secondary)} data-hero-action="secondary">{heroAction.secondary.label}</a></div>:quote
  }
  if(n.slice){const value=nodes.get(n.slice.ref);return typeof value==='string'?createElement(n.tag,props,leaf(value.slice(n.slice.start,n.slice.end),n.slice.ref,n.slice.start,n.slice.end)):null}
  const refs=n.ref?[n.ref]:n.refs??[]
  if(refs.length){
   const sourceNode=n.ref?nodes.get(n.ref):undefined
   // Node 114 contains two source paragraphs: a <p> wrapper is invalid HTML
   // and gets repaired by the browser before hydration (React #418).
   const semantic=doc.routeId==='SALMON-pages-1230'&&n.id===114?'div':sourceNode&&typeof sourceNode!=='string'&&/^h[1-6]$/.test(sourceNode.tag)?sourceNode.tag:n.tag
   const children=n.ref&&sourceNode&&typeof sourceNode!=='string'?sourceNode.children.map((c,i)=>content(c,n.ref+'.'+i)):refs.flatMap((ref,i)=>doc.targetPath==='/'&&n.id===55&&i?[<span key="home-parts-boundary"> </span>,source(ref)]:[source(ref)])
   const text=refs.map(k=>{const v=nodes.get(k);return v===undefined?'':salmonNodeText(v)}).join(' ')
   if(doc.routeId==='SALMON-pages-1446'&&[29,33,37,41,45,49].includes(n.id??-1)){
    const destination=englishServicePages()[[29,33,37,41,45,49].indexOf(n.id!)]?.path
    if(!destination)throw new Error('Maintenance card destination missing')
    return <a {...props} href={destination}>View More <span aria-hidden="true">↗</span></a>
   }
   const link=n.ref?hrefFor(n.ref):undefined
   if(/^(Contact|Request|Talk to|Explore Our Services|View Product|Download Specifications|See all projects|Learn more|Load More)/i.test(text)&&!link){
    const destination=/services|product/i.test(text)?'/cooling-tower/':/project/i.test(text)?'/all-projects/':'/contact-us/'
    return createElement('a',{...props,href:destination},...children)
   }
   return createElement(semantic,props,...children)
  }
  const inside=serviceComposition?.inside[n.id??-1]
  const after=serviceComposition?.after[n.id??-1]
  return createElement(n.tag==='section'?'section':'div',props,...(inside?[<ServiceImage key={key+'.media'} media={inside} layer="inside"/>]:[]),...(n.children??[]).map((c,i)=>design(c,key+'.'+i)),...(after?[<div key={key+'.after'} className="wave2-media-group">{after.map((asset,i)=><ServiceImage key={asset.node+'.'+i} media={asset} layer="after"/>)}</div>]:[]))
 }
 function remainder(n:LayoutNode,key:string,inParagraph=false):ReactNode{if(n.ref)return source(n.ref);if(n.slice){const value=nodes.get(n.slice.ref);return typeof value==='string'?leaf(value.slice(n.slice.start,n.slice.end),n.slice.ref,n.slice.start,n.slice.end):null}const tag=['h1','h2','h3','h4','h5','h6','p','ul','ol','li','strong','em','table','tbody','tr','td','th'].includes(n.tag)?n.tag:inParagraph?'span':'div';return createElement(tag,{key,className:'lux-remainder-node'},...(n.children??[]).map((c,i)=>remainder(c,key+'.'+i,inParagraph||tag==='p')))}
 function productRemainder(n:LayoutNode):ReactNode{const refs:LayoutNode[]=[];function collect(v:LayoutNode){if(v.ref||v.slice)refs.push(v);v.children?.forEach(collect)}collect(n);const groups:LayoutNode[][]=[];for(const item of refs){const held=item.ref?nodes.get(item.ref):undefined,text=held===undefined?'':salmonNodeText(held);if(text.trim()==='Buy Now'&&groups.length)groups.at(-1)!.push(item);else groups.push([item])}return <div className="lux-complete-product-index">{groups.map((items,i)=><div key={i}>{items.map((item,j)=>remainder(item,'product-remainder.'+i+'.'+j))}</div>)}</div>}
 const placement=new Map<number,typeof model.remaining>()
 for(const r of model.remaining){let best=0,score=0;model.tree.forEach((t,i)=>{let count=0;function walk(n:LayoutNode){count+=(n.ref?.startsWith(r.sourceSection+'.')?1:0)+(n.refs??[]).filter(k=>k.startsWith(r.sourceSection+'.')).length;n.children?.forEach(walk)}walk(t);if(count>score){best=i;score=count}});placement.set(best,[...(placement.get(best)??[]),r])}
 // Design R4 (CT GO 2026-10-07): the page's own source text, by key, for the shared R4 system (src/site/r4).
 const r4=r4Builders[doc.routeId]
 const r4Api:R4Api={
  inner:(ref)=>{const n=nodes.get(ref);if(n===undefined)throw new Error(`Design R4 source key missing: ${doc.routeId} ${ref}`);return typeof n==='string'?leaf(n,ref):n.children.map((c,i)=>content(c,ref+'.'+i))},
  tag:(ref)=>{const n=nodes.get(ref);return n===undefined||typeof n==='string'?'':n.tag},
  restored:(slot)=><RestoredSlot doc={doc} slot={slot} className="dr4-restored" key={'restored-'+slot}/>,
  quote:(key,label,variant:R4ButtonVariant,heroAction?:'quote')=><span className={`dr4-btn dr4-btn--${variant}`} key={key} data-hero-action={heroAction}>{heroQuoteAction(doc,key,label)}</span>,
  action:(ref,variant:R4ButtonVariant)=>{
   const n=nodes.get(ref)
   if(n===undefined)throw new Error(`Design R4 action key missing: ${doc.routeId} ${ref}`)
   const text=salmonNodeText(n).replace(/\s+/g,' ').trim()
   if(/^request/i.test(text))return <span className={`dr4-btn dr4-btn--${variant}`} key={ref}>{heroQuoteAction(doc,ref,text)}</span>
   const link=hrefFor(ref)
   const destination=link?href(link):/services|product/i.test(text)?'/cooling-tower/':/project/i.test(text)?'/all-projects/':'/contact-us/'
   return <a className={`dr4-btn dr4-btn--${variant}`} href={destination} key={ref} data-canonical-text={ref}>{text}<span className="dr4-btn-arrow" aria-hidden="true">→</span></a>
  },
 }
 const home=doc.targetPath==='/'
 const sectionAt=(i:number)=>{
  const body=<div className="lux-section-wrap" key={i}>{design(model.tree[i],'design.'+i,true)}{i===0&&doc.targetPath==='/disaster-recovery/'?<div className="lux-recovery-media"><img src="/media/luxury/ics-storm-damage.jpeg" alt="Cooling tower storm damage"/><img src="/media/luxury/ics-slep-complete.jpeg" alt="Completed cooling tower structure"/></div>:null}{(placement.get(i)??[]).map((r,j)=><div className="lux-remainder" key={j}>{['SALMON-pages-48','SALMON-pages-411'].includes(doc.routeId)&&JSON.stringify(r.tree).length>2000?productRemainder(r.tree):remainder(r.tree,'remainder.'+j)}</div>)}</div>
  const labels:Record<number,string>={3:'Industrial cooling tower applications',4:'Cooling tower configurations',5:'Materials and system design'}
  return doc.routeId==='SALMON-pages-1230'&&labels[i]?<TowerDisclosure label={labels[i]} key={i}>{body}</TowerDisclosure>:body
 }
 return <div className={'luxury-site luxury-'+doc.routeId.split('-').at(-1)+(home?' figma-home':'')} data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256}>
  <SalmonSeo doc={doc}/>{home?<><link rel="preload" href="/fonts/figma-home/bebas-neue-latin-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/><link rel="preload" href="/fonts/figma-home/dm-sans-latin-400-700.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></>:null}<LuxuryHeader page={page} routePath={doc.targetPath}/>
  <main id="main" data-luxury-body className={home?'figma-home-main':undefined}>
   {r4?<div className="dr4" data-r4-route={doc.targetPath}>{r4(r4Api,doc.targetPath)}<R4LauncherReveal/></div>:home?<><div className="figma-home-hero-stage">{sectionAt(0)}<div className="figma-home-hero-side">{sectionAt(3)}{sectionAt(1)}</div></div>{[2,4,5,6,7,8].map(sectionAt)}</>:serviceComposition?<ServicePage routeId={doc.routeId} sections={model.tree.map((_,i)=>sectionAt(i))}/>:model.tree.map((_,i)=>sectionAt(i))}
   {r4PlacesRestored.has(doc.routeId)?null:<RestoredSlot doc={doc} slot="body-end" className="lux-section-wrap wave3-source-content"/>}
  </main><LuxuryFooter page={page} routePath={doc.targetPath}/>
 </div>
}
