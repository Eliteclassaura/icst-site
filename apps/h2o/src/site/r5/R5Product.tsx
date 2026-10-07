import type {ReactNode} from 'react'
import {LuxuryFooter,LuxuryHeader} from '../LuxuryShell'
import {SalmonSeo,renderSalmonNode} from '../SalmonCanonical'
import {HOME_CRUMB} from '../breadcrumb-schema'
import {RfqMount} from '../RfqMount'
import {pageForSegments} from '../cohort'
import {deliverySrc,provenanceRef} from '../media-delivery'
import {publicSourceString} from '../public-text'
import {salmonDocument,salmonMedia,salmonMediaPath,salmonNodeText,type SalmonDocument,type SalmonNode} from '../salmon'
import {productPanels,productRelated,productSummary,type ProductPanel} from '../Wave3Products'
import {PartCard,ProductMedia,nameFor,renderNodes} from '../Wave3Presentation'
import {restoredSlotNodes} from '../RestoredSlot'
import {R4LauncherReveal} from '../r4/R4LauncherReveal'
import {R5Gallery,R5MiniBar,type GalleryImage} from './R5ProductClient'

/**
 * Design R5a product detail (owner-approved proposal H2O_DESIGN_R5_SPEC_product-detail, CT 2026-10-07). Every text is
 * the product record's own, rendered through the site renderer (price, commerce and public-text rules unchanged). No
 * price, offer or cart; JSON-LD unchanged (BreadcrumbList only). R5-authored UI labels, listed for OGCS: "Ask an
 * engineer" (the ghost pill to Contact, kept by the owner), "Key facts", "Specifications" table caption.
 */

const PRICE=/[$€£]\s*\d/
const element=(node:SalmonNode):node is Exclude<SalmonNode,string>=>typeof node!=='string'
const textOf=(node:SalmonNode)=>salmonNodeText(node).replace(/\s+/g,' ').trim()

/**
 * Gallery images withheld from the R5 gallery (by SHA-256), for owner review; before R5 only the first image was shown.
 * a5acc497…: "Amarillo-Drive-Shaft-CF83-1150X" sits in the Addax LRR450.275 source gallery (another manufacturer's part).
 */
export const R5_GALLERY_WITHHELD:ReadonlySet<string>=new Set(['a5acc497c75c522cb6a9999adb9299517ce598fac7d2581a7878d4ea62aa8a3c'])
/** The product's own gallery: source images in the product's section, held locally, one per file, ≤ native size. */
export function productGallery(doc:SalmonDocument):GalleryImage[]{
  const name=nameFor(doc)
  const seen=new Set<string>()
  const out:GalleryImage[]=[]
  for(const image of doc.images){
    if(image.section!==name&&image.section!==doc.title)continue
    const media=salmonMedia(image.src,doc.sourceUrl)
    const local=media&&salmonMediaPath(media)
    if(!media||!local||!media.sha256||!media.width||!media.height||seen.has(media.sha256)||R5_GALLERY_WITHHELD.has(media.sha256))continue
    seen.add(media.sha256)
    out.push({src:deliverySrc(local),width:media.width,height:media.height,alt:image.alt??'',sha256:media.sha256,sourceUrl:provenanceRef(image.src)})
  }
  return out
}

export type SpecRow={key:string;label:ReactNode;labelText:string;values:ReactNode[];open?:boolean}
export type SpecReport={labelled:number;continued:string[];listed:string[];price:string[];unparsed:boolean}

/**
 * The specifications panel as a table. A source line "Label: value" (one text node, or a "Label:" text node followed by
 * the value element) is one row. A bare line (no label) continues the previous row only when that row is an open label
 * ("Available sizes:" with no value); other bare lines stay a plain list after the table, in source order. A line with a
 * price goes through the renderer (price withheld, a dimension label kept) into that list. All three cases are counted in
 * the data report. Every cell is rendered by the site renderer from the source node.
 */
export function specTable(doc:SalmonDocument,nodes:SalmonNode[]):{intro:SalmonNode[];after:SalmonNode[];rows:SpecRow[];notes:SalmonNode[];report:SpecReport}{
  const rows:SpecRow[]=[]
  const notes:SalmonNode[]=[]
  const report:SpecReport={labelled:0,continued:[],listed:[],price:[],unparsed:false}
  const intro:SalmonNode[]=[],after:SalmonNode[]=[]
  let listSeen=false
  nodes.forEach((node,n)=>{
    if(!element(node)||!['ul','ol'].includes(node.tag)){(listSeen?after:intro).push(node);return}
    listSeen=true
    node.children.forEach((li,i)=>{
      if(!element(li)||li.tag!=='li'){if(textOf(li))notes.push(li);return}
      const key=`spec.${n}.${i}`
      const text=textOf(li)
      if(!text)return
      // Wave 3 R3 commerce closure: the renderer withholds the price and keeps a non-price dimension ("2 Inch") as a line.
      if(PRICE.test(text)){report.price.push(text);notes.push(li);return}
      const kids=li.children.filter(child=>typeof child!=='string'||child.trim())
      const first=kids[0]
      // "Label:" text node followed by the value element(s)
      if(typeof first==='string'&&/:\s*$/.test(first)&&kids.length>1){
        const label=publicSourceString(doc,first.replace(/:\s*$/,'').trim())
        rows.push({key,label,labelText:label,values:[kids.slice(1).map((child,c)=>renderSalmonNode(child,`${key}.v${c}`,doc))]});report.labelled++;return
      }
      // one text node "Label: value"
      const match=kids.length===1&&typeof first==='string'?/^([^:]{1,60}):\s*(\S[\s\S]*)$/.exec(first.trim()):null
      if(match){
        const label=publicSourceString(doc,match[1]!.trim())
        rows.push({key,label,labelText:label,values:[publicSourceString(doc,match[2]!.trim())]});report.labelled++;return
      }
      // an open label: "Label:" alone
      if(kids.length===1&&typeof first==='string'&&/^[^:]{1,60}:\s*$/.test(first.trim())){
        const label=publicSourceString(doc,first.trim().replace(/:\s*$/,''))
        rows.push({key,label,labelText:label,values:[],open:true});report.labelled++;return
      }
      const previous=rows.at(-1)
      if(previous?.open){report.continued.push(text);previous.values.push(li.children.map((child,c)=>renderSalmonNode(child,`${key}.b${c}`,doc)));return}
      report.listed.push(text)
      notes.push(li)
    })
  })
  // An open label that nothing continued keeps its source text, as a plain line in the list.
  const filled=rows.filter(row=>row.values.length)
  rows.filter(row=>!row.values.length).forEach(row=>{notes.push(`${row.labelText}:`);report.labelled--;report.listed.push(`${row.labelText}:`)})
  if(!filled.length)report.unparsed=true
  return {intro,after,rows:filled,notes,report}
}

/**
 * The source line's colon, kept in the text but not shown: the page text of a row stays "Label: value" (cell boundary = one
 * space), so the claims conformance read-back (ops/seo-pass/claims-text.mjs) compares the same string as before R5.
 */
const Colon=()=><span className="r5-visually-hidden" aria-hidden="true">:</span>

const TITLES:Record<ProductPanel['kind'],string>={description:'Description',features:'Features',specifications:'Specifications',literature:'Product Literature',additional:'Additional Information'}
/** A panel's own nodes without a repeated title heading (as before). */
const panelNodes=(panel:ProductPanel)=>{
  const at=panel.nodes.findIndex(node=>textOf(node).length>0)
  const first=panel.nodes[at]
  return element(first!)&&first.tag==='h2'&&textOf(first).toLowerCase()===TITLES[panel.kind].toLowerCase()?panel.nodes.filter((_,i)=>i!==at):panel.nodes
}

function SpecSection({doc,panel,index}:{doc:SalmonDocument;panel:ProductPanel;index:number}){
  const nodes=panelNodes(panel)
  const table=specTable(doc,nodes)
  return <section className="wave3-product-section r5-product-section r5-specs" data-product-module="specifications" aria-labelledby="r5-specs-title">
    <h2 id="r5-specs-title">{TITLES.specifications}</h2>
    {table.report.unparsed?<div className="wave3-source-content">{renderNodes(nodes,doc,`panel.${index}`)}</div>:<div className="r5-specs-body">
      {table.intro.length?<div className="wave3-source-content">{renderNodes(table.intro,doc,`panel.${index}.intro`)}</div>:null}
      <table className="r5-spec-table">
        <caption className="r5-visually-hidden">Specifications</caption>
        <tbody>{table.rows.map(row=><tr key={row.key}><th scope="row">{row.label}<Colon/></th><td>{row.values.map((value,i)=><span key={i} className="r5-spec-value">{value}</span>)}</td></tr>)}</tbody>
      </table>
      {table.notes.length?<ul className="r5-spec-notes">{table.notes.map((note,i)=>element(note)&&note.tag==='li'?renderSalmonNode(note,`panel.${index}.note.${i}`,doc):<li key={i}>{element(note)?renderSalmonNode(note,`panel.${index}.note.${i}`,doc):publicSourceString(doc,note)}</li>)}</ul>:null}
      {table.after.length?<div className="wave3-source-content">{renderNodes(table.after,doc,`panel.${index}.after`)}</div>:null}
    </div>}
  </section>
}

function PanelSection({doc,panel,index}:{doc:SalmonDocument;panel:ProductPanel;index:number}){
  return <section className={`wave3-product-section r5-product-section r5-panel--${panel.kind}`} data-product-module={panel.kind}>
    <h2>{TITLES[panel.kind]}</h2>
    <div className="wave3-source-content">{renderNodes(panelNodes(panel),doc,`panel.${index}`)}</div>
  </section>
}

export function R5ProductDetail({doc}:{doc:SalmonDocument}){
  const name=nameFor(doc)
  // A literature panel with no document link printed "none" or a bare label: it is omitted (Control Tower 2026-10-02).
  const documentLink=(node:SalmonNode):boolean=>element(node)&&(node.tag==='a'&&Boolean(node.attrs.href)||node.children.some(documentLink))
  const panels=productPanels(doc).filter(panel=>panel.kind!=='literature'||panel.nodes.some(documentLink))
  const order:ProductPanel['kind'][]=['description','features','specifications','literature','additional']
  // A restored live description (content/restored-sections, slot `description`) replaces the description, features and
  // specifications panels: on these pages the held panels were not the product's own text.
  const restoredDescription=restoredSlotNodes(doc,'description')
  const sorted=[...panels].filter(panel=>!restoredDescription.length||!['description','features','specifications'].includes(panel.kind)).sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind))
  const specs=sorted.find(panel=>panel.kind==='specifications')
  const facts=specs?specTable(doc,panelNodes(specs)).rows.filter(row=>!row.open&&row.values.length===1).slice(0,6):[]
  const related=productRelated(doc).slice(0,4).map(route=>salmonDocument(route))
  const gallery=productGallery(doc)
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  const actions=<div className="dr4-actions r5-product-actions">
    <span className="dr4-btn"><RfqMount mountId="rfq_page" product={doc}/></span>
    <a className="r5-ghost-pill wave3-contact-link" href="/contact-us/">Ask an engineer</a>
  </div>
  return <div className="luxury-site wave3-site r5-site" data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256} data-wave3-archetype="ProductDetail">
    <SalmonSeo doc={doc} breadcrumb={[HOME_CRUMB,{name:'Cooling Tower Parts',path:'/cooling-tower-parts-online/'}]} crumbName={name}/><LuxuryHeader page={page} routePath={doc.targetPath} product={doc}/>
    <main id="main" className="wave3-main wave3-detail">
      <div className="dr4 r5" data-r4-route={doc.targetPath}>
        <nav className="wave3-breadcrumb r5-breadcrumb" aria-label="Breadcrumb"><a href="/cooling-tower-parts-online/">Cooling Tower Parts</a><span aria-hidden="true">/</span><span>{name}</span></nav>
        <div className="r5-product-head wave3-detail-hero">
          {gallery.length?<R5Gallery images={gallery} name={name}/>:<ProductMedia doc={doc}/>}
          <div className="r5-product-summary wave3-detail-summary">
            <p className="r5-eyebrow">Cooling Tower Parts</p>
            <h1 className={name.length>48?'r5-product-title r5-product-title--long':'r5-product-title'}>{name}</h1>
            <div className="wave3-source-content wave3-summary-copy r5-product-lead">{renderNodes(productSummary(doc),doc,'summary')}</div>
            {facts.length?<div className="r5-facts"><p className="r5-facts-title">Key facts</p><dl>{facts.map(row=><div key={row.key}><dt>{row.label}<Colon/></dt><dd>{row.values[0]}</dd></div>)}</dl></div>:null}
            {actions}
          </div>
        </div>
        <R4LauncherReveal/>
        <div className="wave3-product-body r5-product-body">
          {restoredDescription.length?<section className="wave3-product-section r5-product-section" data-product-module="description" data-restored-slot-render="description"><div className="wave3-source-content">{renderNodes(restoredDescription,doc,'restored.description')}</div></section>:null}
          {sorted.map((panel,i)=>panel.kind==='specifications'?<SpecSection key={`${panel.kind}.${i}`} doc={doc} panel={panel} index={i}/>:<PanelSection key={`${panel.kind}.${i}`} doc={doc} panel={panel} index={i}/>)}
        </div>
        {related.length?<section className="wave3-related r5-related" aria-labelledby="wave3-related-title"><div className="wave3-related-heading"><h2 id="wave3-related-title" className="dr4-h2">Related Products</h2><a href="/cooling-tower-parts-online/">Explore all parts</a></div><div className="wave3-related-grid r5-grid r5-grid--related">{related.map(product=><PartCard key={product.routeId} doc={product}/>)}</div></section>:null}
        <R5MiniBar><p className="r5-minibar-name">{name}</p><span className="dr4-btn"><RfqMount mountId="rfq_page" product={doc}/></span></R5MiniBar>
      </div>
    </main><LuxuryFooter page={page} routePath={doc.targetPath} product={doc}/>
  </div>
}
