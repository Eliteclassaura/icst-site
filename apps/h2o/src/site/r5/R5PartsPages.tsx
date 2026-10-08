import type {ReactNode} from 'react'
import {LuxuryFooter,LuxuryHeader} from '../LuxuryShell'
import {SalmonSeo} from '../SalmonCanonical'
import {pageForSegments} from '../cohort'
import {BlockView,Picture,Rich} from '../SalmonComposer'
import {productRfqAction,quoteRfqAction} from '../SalmonFamilies'
import {salmonFamilyFor,salmonFamilyModel} from '../salmon-family-adapter'
import type {Block,ButtonBlock,HeadingBlock,IconCardBlock,ImageBlock,ListBlock,ProductGridBlock,SalmonFamilyPageModel} from '../salmon-family-model'
import {salmonDocument,salmonRoutes,type SalmonDocument} from '../salmon'
import {RestoredSlot} from '../RestoredSlot'
import type {RenderContext} from '../SalmonComposer'
import {partsCategories} from '../Wave3Products'
import {R4LauncherReveal} from '../r4/R4LauncherReveal'
import {R5Checklist,R5Chips,R5LongCopy,R5PartsHero,R5ProductGrid,blocksOf,heroParts,plain} from './R5Parts'

/**
 * Design R5a, parts category template (spec H2O_DESIGN_R5_SPEC_parts-category.md). Two archetypes on one system:
 *   A. category listing (family `parts-landing`: /fans/, /motors/, /fill-media/ …): hub-centred hero, sibling chip row, the
 *      source product grid, long source copy (with an "On this page" index when it has ≥ 3 headings), the closing note with
 *      the quote pill, related products;
 *   B. series pages (family `component-class`: /class-1000/ …): product-style header, key features, technical details,
 *      applications; one render per page (the repeated renders are dropped).
 * Text, links and product data come from the page's family model; URL, title, H1 and meta are unchanged.
 */
export const R5_PARTS_FAMILIES=new Set(['parts-landing','component-class'])
const HUB='/cooling-tower-parts-online/'

let hubCategories:Array<{href:string;label:string}>|undefined
/** The category chips are the hub's existing category links (same hrefs and labels), with "All Parts" first. */
export const partsChips=():Array<{href:string;label:string}>=>{
  if(!hubCategories){const hub=salmonRoutes().find(r=>r.targetPath===HUB);hubCategories=hub?partsCategories(salmonDocument(hub)):[]}
  return [{href:HUB,label:'All Parts'},...hubCategories]
}

function Shell({doc,model,children}:{doc:SalmonDocument;model:SalmonFamilyPageModel;children:ReactNode}){
  const page=pageForSegments(model.path.split('/').filter(Boolean))
  return <div className={`luxury-site salmon-family salmon-family--${model.family} r5-site`} data-salmon-document={model.routeId} data-salmon-source-sha256={model.source.sha256}>
    <SalmonSeo doc={doc}/>
    <LuxuryHeader page={page} routePath={model.path}/>
    <main id="main" className={`sp-main sp-family--${model.family}`} data-salmon-region="body" data-salmon-family={model.family} data-audit-family={model.auditFamily} data-content-contract={model.contract} data-content-source={model.source.kind}>
      <div className="dr4 r5" data-r4-route={model.path}>{children}</div>
      <RestoredSlot doc={doc} slot="body-end" className="sp-section-inner wave3-source-content"/>
    </main>
    <LuxuryFooter page={page} routePath={model.path}/>
  </div>
}

/** OGCS R5 addendum (a), CT 2026-10-07: the parts "Contact for pricing" pill is the quote action "Request a quote". */
export const isContactForPricing=(b:ButtonBlock)=>/^contact\s+for\s+pricing$/i.test(b.label.trim())
const ctxFor=(path:string):RenderContext=>({productAction:p=>productRfqAction(p,path),quoteAction:label=>quoteRfqAction(path,label)})
/** A source button: quote-intent buttons (and the ruled "Contact for pricing") open the quote form; others keep their link. */
const ButtonAction=({block,path}:{block:ButtonBlock;path:string})=>isContactForPricing(block)?<>{quoteRfqAction(path,'Request a quote')}</>:<BlockView block={block} ctx={ctxFor(path)}/>

function Landing({doc,model}:{doc:SalmonDocument;model:SalmonFamilyPageModel}){
  const path=model.path
  const [heroSection,listing,related]=[model.sections[0],model.sections.find(s=>s.index===1),model.sections.find(s=>s.index===2)]
  const hero=heroSection?heroParts(heroSection.root):undefined
  const ctx=ctxFor(path)
  const productAction=ctx.productAction!
  const listBlocks=listing?blocksOf(listing.root):[]
  const gridAt=listBlocks.findIndex(b=>b.type==='productGrid')
  const grid=listBlocks[gridAt] as ProductGridBlock|undefined
  const intro=listBlocks.slice(0,Math.max(0,gridAt))
  const after=listBlocks.slice(gridAt+1)
  // The closing note is the trailing text + button group (the last button and the texts directly before it).
  const lastButton=[...after].reverse().find((b):b is ButtonBlock=>b.type==='button')
  const closeAt=lastButton?after.indexOf(lastButton):-1
  let noteStart=closeAt
  while(noteStart>0&&after[noteStart-1]!.type==='text')noteStart--
  const copy=closeAt>=0?after.slice(0,noteStart):after
  const note=closeAt>=0?after.slice(noteStart,closeAt):[]
  const relatedBlocks=related?blocksOf(related.root):[]
  const relatedHeading=relatedBlocks.find((b):b is HeadingBlock=>b.type==='heading')
  const relatedGrid=relatedBlocks.find((b):b is ProductGridBlock=>b.type==='productGrid')
  return <Shell doc={doc} model={model}>
    {hero?.h1?<R5PartsHero variant="category" h1={hero.h1.text} lead={hero.lead?<BlockView block={hero.lead} ctx={ctx}/>:undefined} action={hero.button?<ButtonAction block={hero.button} path={path}/>:undefined} photo={hero.photo} render={hero.render} renderCap={420}/>:null}
    <R4LauncherReveal/>
    <R5Chips items={partsChips()} current={path} label="Part categories"/>
    {grid?<section className="dr4-section r5-listing" aria-labelledby={intro.find(b=>b.type==='heading')?'r5-listing-title':undefined}>
      <div className="r5-listing-head">{intro.map(b=>b.type==='heading'?<h2 key={b.key} id="r5-listing-title" className="dr4-h2"><Rich text={(b as HeadingBlock).text}/></h2>:<BlockView key={b.key} block={b} ctx={ctx}/>)}</div>
      <R5ProductGrid grid={grid} action={productAction}/>
    </section>:null}
    {copy.length?<section className="dr4-section r5-longcopy"><R5LongCopy blocks={copy} ctx={ctx}/></section>:null}
    {lastButton?<section className="dr4-section r5-note"><div className="r5-note-card">{note.map(b=><BlockView key={b.key} block={b} ctx={ctx}/>)}<div className="dr4-actions dr4-actions--center r5-note-action"><span className="dr4-btn"><ButtonAction block={lastButton} path={path}/></span></div></div></section>:null}
    {relatedGrid?<section className="dr4-section r5-related" aria-labelledby="r5-related-title">
      {relatedHeading?<h2 id="r5-related-title" className="dr4-h2"><Rich text={relatedHeading.text}/></h2>:null}
      <R5ProductGrid grid={relatedGrid} action={productAction} className="r5-grid--related"/>
    </section>:null}
  </Shell>
}

function Series({doc,model}:{doc:SalmonDocument;model:SalmonFamilyPageModel}){
  const path=model.path
  const ctx=ctxFor(path)
  const all=model.sections.flatMap(s=>blocksOf(s.root))
  const h1=all.find((b):b is HeadingBlock=>b.type==='heading'&&b.level===1)
  // One render per page (spec B): the first source image leads the header; the repeated renders are dropped.
  const render=all.find((b):b is ImageBlock=>b.type==='image')
  const groups:Array<{heading?:HeadingBlock;blocks:Block[]}>=[]
  for(const b of all){
    if(b===h1||b.type==='image')continue
    if(b.type==='heading'){groups.push({heading:b,blocks:[]});continue}
    if(!groups.length)groups.push({blocks:[]})
    groups.at(-1)!.blocks.push(b)
  }
  const lead=groups[0]&&!groups[0].heading?groups.shift()!:undefined
  const overview=groups.findIndex(g=>/^overview$/i.test(plain(g.heading?.text)))
  const head=overview>=0?groups.splice(overview,1)[0]:undefined
  return <Shell doc={doc} model={model}>
    <section className="r5-series-head" aria-labelledby="r5-series-title">
      {render?<div className="r5-series-media"><Picture media={{...render.media,alt:render.media.alt||plain(h1?.text)}} eager style={{inlineSize:`min(100%, ${render.media.width}px)`}}/></div>:null}
      <div className="r5-series-text">
        {h1?<h1 id="r5-series-title" className="r5-series-title"><Rich text={h1.text}/></h1>:null}
        {lead?lead.blocks.map(b=><BlockView key={b.key} block={b} ctx={ctx}/>):null}
        {head?.heading?<><h2 className="r5-series-h2"><Rich text={head.heading.text}/></h2>{head.blocks.map(b=><BlockView key={b.key} block={b} ctx={ctx}/>)}</>:null}
        <div className="dr4-actions r5-series-actions"><span className="dr4-btn">{quoteRfqAction(path,'Request a Quote')}</span></div>
      </div>
    </section>
    <R4LauncherReveal/>
    {groups.map((g,i)=>{
      const cards=g.blocks.filter((b):b is IconCardBlock=>b.type==='iconCard')
      return <section key={g.heading?.key??i} className="dr4-section r5-series-section">
        {g.heading?<h2 className="dr4-h2"><Rich text={g.heading.text}/></h2>:null}
        {g.blocks.filter(b=>b.type!=='iconCard').map(b=>b.type==='list'?<R5Checklist key={b.key} list={b as ListBlock}/>:<BlockView key={b.key} block={b} ctx={ctx}/>)}
        {cards.length?<ul className="r5-spec-chips">{cards.map(c=><li key={c.key}>{plain(c.title)?<strong><Rich text={c.title!}/></strong>:null}{plain(c.text)?<span><Rich text={c.text!}/></span>:null}</li>)}</ul>:null}
      </section>
    })}
  </Shell>
}

export function R5PartsFamilyPage({doc}:{doc:SalmonDocument}){
  const config=salmonFamilyFor(doc)!
  const model=salmonFamilyModel(doc,config)
  return model.family==='component-class'?<Series doc={doc} model={model}/>:<Landing doc={doc} model={model}/>
}
