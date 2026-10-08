import type {ReactNode} from 'react'
import {provenanceRef} from './media-delivery'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {SalmonSeo,renderSalmonNode} from './SalmonCanonical'
import {HOME_CRUMB} from './breadcrumb-schema'
import {RfqMount} from './RfqMount'
import {StaticPartsController} from './StaticPartsController'
import {pageForSegments} from './cohort'
import {salmonDocument,salmonNodeText,type SalmonDocument,type SalmonNode} from './salmon'
import {partsCategories,productIndexRecords,productPanels,productPrimaryMedia,productRelated,productSummary,type ProductPanel} from './Wave3Products'
import {R2Discovery} from './R2Discovery'
import {BlockView,Picture} from './SalmonComposer'
import type {ImageBlock,MediaRef} from './salmon-family-model'
import {R4LauncherReveal} from './r4/R4LauncherReveal'
import {R5Chips,R5PartsHero,blocksOf,heroParts} from './r5/R5Parts'
import {adaptSection,composedSectionRefs} from './salmon-family-adapter'
import {quoteRfqAction} from './SalmonFamilies'
import {RestoredSlot,restoredSlotNodes} from './RestoredSlot'

export const nameFor=(doc:SalmonDocument)=>doc.seo.h1[0]||doc.title
const subordinateSourceHeadings=(node:SalmonNode):SalmonNode=>typeof node==='string'?node:{...node,tag:node.tag==='h1'?'h2':node.tag,children:node.children.map(subordinateSourceHeadings)}
// SEO-CONTENT-1: a deleted bullet (an applications line ruled out, OGCS section 2) leaves an empty list item in the stored page
// element; it renders nothing, not a stray bullet marker. Only items with no text, link or image are dropped (replaced by an empty
// text node, so every sibling keeps its source position and key), and a list left with no items goes with them.
const hasContent=(node:SalmonNode):boolean=>typeof node==='string'?node.trim().length>0:['a','img','svg','picture','video','iframe','input','button'].includes(node.tag)||node.children.some(hasContent)
const withoutEmptyItems=(node:SalmonNode):SalmonNode=>{
  if(typeof node==='string')return node
  if(node.tag==='li'&&!hasContent(node))return ''
  const children=node.children.map(withoutEmptyItems)
  const items=node.children.filter(child=>typeof child!=='string'&&child.tag==='li')
  if((node.tag==='ul'||node.tag==='ol')&&items.length>0&&!node.children.some((child,i)=>typeof child!=='string'&&child.tag==='li'&&typeof children[i]!=='string'))return ''
  return children.some((child,i)=>child!==node.children[i])?{...node,children}:node
}
export const renderNodes=(nodes:SalmonNode[],doc:SalmonDocument,section:string):ReactNode=>nodes.map((node,i)=>renderSalmonNode(subordinateSourceHeadings(withoutEmptyItems(node)),`${section}.${i}`,doc))

export function ProductMedia({doc,compact=false}:{doc:SalmonDocument;compact?:boolean}){
  const primary=productPrimaryMedia(doc)
  if(!primary)return <div className={`wave3-product-media-fallback${compact?' wave3-card-media':''}`} data-media-recovery="MEDIA_RECOVERY_HOLD"><span>{nameFor(doc)}</span><small>Product image pending source verification</small></div>
  const {image,media,src}=primary
  return <div className={`wave3-product-media${compact?' wave3-card-media':''}`} data-media-sha256={media.sha256} data-source-url={provenanceRef(image.src)}>
    <img src={src} width={media.width} height={media.height} style={{maxWidth:media.width}} alt={image.alt??''} loading={compact?'lazy':'eager'} fetchPriority={compact?undefined:'high'}/>
  </div>
}

export function PartCard({doc,staticIndex}:{doc:SalmonDocument;staticIndex?:number}){
  return <article className="wave3-part-card" data-product-route={doc.targetPath} data-static-product={staticIndex===undefined?undefined:doc.routeId} data-static-search={staticIndex===undefined?undefined:`${nameFor(doc)} ${salmonNodeText({tag:'span',attrs:{},children:productSummary(doc)})}`.toLowerCase()} style={staticIndex!==undefined&&staticIndex>=12?{display:'none'}:undefined}>
    <a className="wave3-part-card-link" href={doc.targetPath} aria-label={`Explore ${nameFor(doc)}`}>
      <ProductMedia doc={doc} compact/>
      <h3>{nameFor(doc)}</h3>
      <span className="wave3-card-action">Explore Part <span aria-hidden="true">↗</span></span>
    </a>
    <div className="wave3-card-rfq"><RfqMount mountId="rfq_page" product={doc} named/></div>
  </article>
}

function ProductSection({panel,doc,index}:{panel:ProductPanel;doc:SalmonDocument;index:number}){
  const titles:Record<ProductPanel['kind'],string>={description:'Description',features:'Features',specifications:'Specifications',literature:'Product Literature',additional:'Additional Information'}
  const firstContentIndex=panel.nodes.findIndex(node=>salmonNodeText(node).trim().length>0)
  const firstContent=panel.nodes[firstContentIndex]
  const repeatedHeading=typeof firstContent!=='string'&&firstContent?.tag==='h2'&&salmonNodeText(firstContent).trim().toLowerCase()===titles[panel.kind].toLowerCase()
  const sourceNodes=repeatedHeading?panel.nodes.filter((_,i)=>i!==firstContentIndex):panel.nodes
  return <section className="wave3-product-section" data-product-module={panel.kind}>
    <h2>{titles[panel.kind]}</h2>
    <div className="wave3-source-content">{renderNodes(sourceNodes,doc,`panel.${index}`)}</div>
  </section>
}

export function ProductDetail({doc}:{doc:SalmonDocument}){
  // A literature panel with no document link printed "none" or a bare label: it is omitted (Control Tower 2026-10-02).
  const documentLink=(node:SalmonNode):boolean=>typeof node!=='string'&&(node.tag==='a'&&Boolean(node.attrs.href)||node.children.some(documentLink))
  const panels=productPanels(doc).filter(panel=>panel.kind!=='literature'||panel.nodes.some(documentLink))
  const order:ProductPanel['kind'][]=['description','features','specifications','literature','additional']
  // A restored live description (content/restored-sections, slot `description`) replaces the description, features and
  // specifications panels: on these pages the held panels were not the product's own text.
  const restoredDescription=restoredSlotNodes(doc,'description')
  const sorted=[...panels].filter(panel=>!restoredDescription.length||!['description','features','specifications'].includes(panel.kind)).sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind))
  const related=productRelated(doc).slice(0,4).map(route=>salmonDocument(route))
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  return <div className="luxury-site wave3-site" data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256} data-wave3-archetype="ProductDetail">
    <SalmonSeo doc={doc} breadcrumb={[HOME_CRUMB,{name:'Cooling Tower Parts',path:'/cooling-tower-parts-online/'}]} crumbName={nameFor(doc)}/><LuxuryHeader page={page} routePath={doc.targetPath} product={doc}/>
    <main id="main" className="wave3-main wave3-detail">
      <nav className="wave3-breadcrumb" aria-label="Breadcrumb"><a href="/cooling-tower-parts-online/">Cooling Tower Parts</a><span aria-hidden="true">/</span><span>{nameFor(doc)}</span></nav>
      <div className="wave3-detail-hero">
        <ProductMedia doc={doc}/>
        <div className="wave3-detail-summary"><h1>{nameFor(doc)}</h1><div className="wave3-source-content wave3-summary-copy">{renderNodes(productSummary(doc),doc,'summary')}</div><div className="wave3-detail-action"><RfqMount mountId="rfq_page" product={doc}/><a className="wave3-contact-link" href="/contact-us/">Contact ICS</a></div></div>
      </div>
      <div className="wave3-product-body">{restoredDescription.length?<section className="wave3-product-section" data-product-module="description" data-restored-slot-render="description"><div className="wave3-source-content">{renderNodes(restoredDescription,doc,'restored.description')}</div></section>:null}{sorted.map((panel,i)=><ProductSection key={`${panel.kind}.${i}`} panel={panel} doc={doc} index={i}/>)}</div>
      {related.length?<section className="wave3-related" aria-labelledby="wave3-related-title"><div className="wave3-related-heading"><h2 id="wave3-related-title">Related Products</h2><a href="/cooling-tower-parts-online/">Explore all parts</a></div><div className="wave3-related-grid">{related.map(product=><PartCard key={product.routeId} doc={product}/>)}</div></section>:null}
    </main><LuxuryFooter page={page} routePath={doc.targetPath} product={doc}/>
  </div>
}

const partsCopy=(doc:SalmonDocument)=>{
  const sections:Array<{heading:string;paragraphs:string[]}>=[]
  let current:{heading:string;paragraphs:string[]}|undefined
  const seen=new Set<string>()
  const visit=(node:SalmonNode):void=>{
    if(typeof node==='string')return
    const text=salmonNodeText(node).trim().replace(/\s+/g,' ')
    if(node.tag==='h2'){
      // R4 (OGCS R4C-04, CT 2026-10-07): the supplier heading now reads "…, Shipped Internationally"; both wordings are matched.
      current=/Why Engineers|Critical Industrial Applications|Globally Shipped|Shipped Internationally/i.test(text)?{heading:text,paragraphs:[]}:undefined
      if(current)sections.push(current)
      return
    }
    if(node.tag==='p'&&current&&text.length>70&&!seen.has(text)){current.paragraphs.push(text);seen.add(text);return}
    node.children.forEach(visit)
  }
  doc.children.forEach(visit)
  return sections.filter(section=>section.paragraphs.length)
}

const partsIntro=(doc:SalmonDocument):string=>{
  let result=''
  const visit=(node:SalmonNode):void=>{
    if(result||typeof node==='string')return
    if(node.tag==='p'){
      const text=salmonNodeText(node).trim().replace(/\s+/g,' ')
      if(text.length>60){result=text;return}
    }
    node.children.forEach(visit)
  }
  doc.children.forEach(visit)
  return result
}

/** Design R5a hub: a source copy group beside the hub's own source render (≤ native, capped). */
function Split({media,cap,children,className}:{media?:MediaRef;cap:number;children:ReactNode;className:string}){
  return <section className={`wave3-index-copy r5-split ${className}`}>
    <div className="r5-split-text">{children}</div>
    {media?<div className="r5-split-media"><Picture media={media} style={{inlineSize:`min(100%, ${Math.min(cap,media.width??cap)}px)`}}/></div>:null}
  </section>
}

/**
 * The parts hub's ONE page value (CT 2026-10-08, SEO SF-02): the requested ?page= (a plain positive integer, else 1) clamped to
 * the page count of the search-filtered catalog. The catalog, the title/description and the social tags all take this value,
 * so "?page=2junk" and "?page=9999" never name a page the content does not show.
 */
export function partsHubPage(query:string,requested:string|number|undefined):number{
  const cleanQuery=query.trim().slice(0,100)
  const records=productIndexRecords()
  const count=cleanQuery?records.filter(({doc:product})=>`${nameFor(product)} ${salmonNodeText({tag:'span',attrs:{},children:productSummary(product)})}`.toLowerCase().includes(cleanQuery.toLowerCase())).length:records.length
  const pageCount=Math.max(1,Math.ceil(count/12))
  const number=typeof requested==='number'?requested:/^\d{1,6}$/.test(requested??'')?Number(requested):1
  return Math.max(1,Math.min(Number.isFinite(number)?Math.trunc(number):1,pageCount))
}

export function PartsIndex({doc,query='',pageNumber=1}:{doc:SalmonDocument;query?:string;pageNumber?:number}){
  const records=productIndexRecords()
  const cleanQuery=query.trim().slice(0,100)
  const filtered=cleanQuery?records.filter(({doc:product})=>`${nameFor(product)} ${salmonNodeText({tag:'span',attrs:{},children:productSummary(product)})}`.toLowerCase().includes(cleanQuery.toLowerCase())):records
  const pageCount=Math.max(1,Math.ceil(filtered.length/12))
  const currentPage=partsHubPage(cleanQuery,pageNumber)
  const staticRelease=process.env.H2O_PUBLIC_EXPORT==='1'
  const shown=staticRelease?filtered:filtered.slice((currentPage-1)*12,currentPage*12)
  const href=(number:number)=>`/cooling-tower-parts-online/?${new URLSearchParams({...cleanQuery?{q:cleanQuery}:{},page:String(number)}).toString()}`
  const categories=partsCategories(doc)
  const copy=partsCopy(doc)
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  // Salmon parity: the source photographic hero (held CSS background and foreground) leads the
  // accepted catalog; the catalog, search, category rail, product IDs and RFQ context are unchanged.
  const heroRef=composedSectionRefs(doc)[0]
  const hero=heroRef?adaptSection(doc,heroRef,0,{treatment:'hero'}):undefined
  const parts=hero?heroParts(hero.root):undefined
  // Design R5a (spec parts-hub): the hub's own source renders lead the sections they already sit beside in the source.
  const sourceImage=(sectionIndex:number)=>{const ref=composedSectionRefs(doc)[sectionIndex];return ref?blocksOf(adaptSection(doc,ref,sectionIndex).root).find((b):b is ImageBlock=>b.type==='image')?.media:undefined}
  const why=copy.filter(section=>/Why Engineers/i.test(section.heading))
  const rest=copy.filter(section=>!/Why Engineers/i.test(section.heading))
  const copyBlock=(section:{heading:string;paragraphs:string[]})=><div key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph=><p key={paragraph}>{paragraph}</p>)}</div>
  return <div className="luxury-site wave3-site salmon-family salmon-family--parts-index r5-site" data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256} data-wave3-archetype="PartsIndex">
    <SalmonSeo doc={doc} pageNumber={currentPage}/><LuxuryHeader page={page} routePath={doc.targetPath}/>
    <main id="main" className="wave3-main wave3-index sp-main sp-family--parts-index" data-salmon-family="parts-index" data-audit-family="PARTS_INDEX">
      <div className="dr4 r5" data-r4-route={doc.targetPath}>
      {parts?.h1?<R5PartsHero variant="hub" h1={parts.h1.text} lead={parts.lead?<BlockView block={parts.lead} ctx={{}}/>:undefined} action={parts.button?<BlockView block={parts.button} ctx={{quoteAction:label=>quoteRfqAction(doc.targetPath,label)}}/>:undefined} photo={parts.photo} render={parts.render} renderCap={460}/>:null}
      <R4LauncherReveal/>
      <section className="wave3-index-intro r5-split r5-hub-intro">
        <div className="r5-split-text">{parts?.h1?null:<div><h1>{doc.seo.h1[0]}</h1><p>{partsIntro(doc)}</p></div>}<form action="/cooling-tower-parts-online/" method="get" role="search" className="wave3-search"><label htmlFor="wave3-query">Search cooling tower parts</label><div><input id="wave3-query" type="search" name="q" defaultValue={cleanQuery} maxLength={100} placeholder="Search parts by name or description"/><button type="submit">Search</button></div></form><RestoredSlot doc={doc} slot="intro" className="wave3-source-content"/></div>
        {sourceImage(1)?<div className="r5-split-media"><Picture media={sourceImage(1)!} style={{inlineSize:`min(100%, ${Math.min(420,sourceImage(1)!.width??420)}px)`}}/></div>:null}
      </section>
      <div className="wave3-index-layout r5-browse">
        <div className="r5-browse-head"><h2 id="r5-browse-title">Browse by Component Type</h2></div>
        <R5Chips items={[{href:'/cooling-tower-parts-online/',label:'All Parts'},...categories]} current="/cooling-tower-parts-online/" label="Part categories"/>
        <section className="wave3-catalog" aria-labelledby="wave3-catalog-heading"><div className="wave3-catalog-heading"><h2 id="wave3-catalog-heading">Cooling Tower Parts</h2><p>{filtered.length} products</p></div>{shown.length?<div className="wave3-card-grid r5-grid">{shown.map(({doc:product},index)=><PartCard key={product.routeId} doc={product} staticIndex={staticRelease?index:undefined}/>)}</div>:<div className="wave3-empty"><h3>No matching parts</h3><p>Try a product name or a broader component term.</p><a href="/cooling-tower-parts-online/">Explore all parts</a></div>}{staticRelease?<p data-static-parts-empty hidden>No matching parts. Try a product name or a broader component term.</p>:null}{pageCount>1?<nav className="wave3-pagination" aria-label="Product pages">{currentPage>1?<a href={href(currentPage-1)}>Previous</a>:null}<span>Page {currentPage} of {pageCount}</span>{currentPage<pageCount?<a href={href(currentPage+1)}>Next</a>:null}</nav>:null}</section>
      </div>
      {why.length?<Split media={sourceImage(2)} cap={520} className="r5-split--why">{why.map(copyBlock)}</Split>:null}
      {rest.length?<Split media={sourceImage(3)} cap={420} className="r5-split--copy r5-split--flip">{rest.map(copyBlock)}</Split>:null}
      <R2Discovery kind="parts"/>
      </div>
      {staticRelease?<StaticPartsController/>:null}
    </main><LuxuryFooter page={page} routePath={doc.targetPath}/>
  </div>
}
