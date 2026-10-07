import type {ReactNode} from 'react'
import {createElement} from 'react'
import type {Block,ButtonBlock,ContainerBlock,HeadingBlock,ImageBlock,ListBlock,MediaRef,ProductCardInput,ProductGridBlock,RichText,TextWidgetBlock} from '../salmon-family-model'
import {BlockView,Picture,Rich,type RenderContext} from '../SalmonComposer'

/**
 * Design R5a (CT GO 2026-10-07; DD specs H2O_DESIGN_R5_SPEC_parts-hub / parts-category / product-detail): the parts
 * system on top of the R4 shared system. Every visible text is the page's existing source text (family model or product
 * record); nothing here invents copy. The only R5-authored string here is the UI label "On this page" (listed for OGCS);
 * "Explore Part ↗" and "All Parts" are the hub's existing labels.
 */

export const walkBlocks=(b:Block,f:(b:Block)=>void):void=>{f(b);if(b.type==='container')b.children.forEach(c=>walkBlocks(c,f))}
export const blocksOf=(root:Block):Block[]=>{const out:Block[]=[];walkBlocks(root,b=>{if(b.type!=='container')out.push(b)});return out}
export const plain=(r?:RichText)=>(r??[]).map(x=>x.text).join('').replace(/\s+/g,' ').trim()
const slug=(s:string)=>s.toLowerCase().replace(/&[a-z]+;/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'section'

/** The hero section of a family model (or the hub's adapted hero): H1, lead, the quote button, the photo (the layer under the
 * render; an outer texture layer is skipped) and the render (the innermost background, else the first image). */
export function heroParts(root:ContainerBlock){
  const blocks=blocksOf(root)
  const h1=blocks.find((b):b is HeadingBlock=>b.type==='heading'&&b.level===1)
  const lead=blocks.find((b):b is TextWidgetBlock=>b.type==='text')
  const button=blocks.find((b):b is ButtonBlock=>b.type==='button')
  const backgrounds:MediaRef[]=[]
  walkBlocks(root,b=>{if(b.type==='container'&&b.background)backgrounds.push(b.background.media)})
  const image=blocks.find((b):b is ImageBlock=>b.type==='image')
  return {h1,lead,button,photo:backgrounds.length>1?backgrounds.at(-2):undefined,render:backgrounds.length>1?backgrounds.at(-1):backgrounds[0]??image?.media}
}

/** Centred hub hero (one card): the source photo under a blue overlay, the H1, lead and quote, the render at ≤ native. */
export function R5PartsHero({h1,lead,action,photo,render,variant,renderCap}:{h1:RichText;lead?:ReactNode;action?:ReactNode;photo?:MediaRef;render?:MediaRef;variant:'hub'|'category';renderCap:number}){
  return <section className={`r5-hero r5-hero--${variant}`} aria-labelledby="r5-hero-title">
    {photo?<Picture media={photo} className="r5-hero-photo" eager/>:null}
    <div className="r5-hero-body">
      <h1 className="r5-hero-title" id="r5-hero-title"><Rich text={h1}/></h1>
      {lead?<div className="r5-hero-lead">{lead}</div>:null}
      {action?<div className="dr4-actions dr4-actions--center r5-hero-actions"><span className="dr4-btn dr4-btn--white">{action}</span></div>:null}
    </div>
    {render?<Picture media={render} className="r5-hero-render" eager style={{inlineSize:`min(100%, ${Math.min(renderCap,render.width??renderCap)}px)`}}/>:null}
  </section>
}

/** A row of category links (pills): crawlable <a href> with the existing labels; the current page is aria-current. */
export function R5Chips({items,current,label}:{items:Array<{href:string;label:string}>;current?:string;label:string}){
  return <nav className="r5-chips" aria-label={label}><ul>{items.map(item=><li key={item.href}><a href={item.href} aria-current={item.href===current?'page':undefined}>{item.label}</a></li>)}</ul></nav>
}

/** One parts card everywhere (hub, category, related): the same markup as the hub's `PartCard`, so they read identically. */
export function R5ProductCard({product,action}:{product:ProductCardInput;action?:ReactNode}){
  const name=plain(product.name)
  return <article className="wave3-part-card r5-card" data-product-route={product.productPath}>
    <a className="wave3-part-card-link" href={product.productPath} aria-label={`Explore ${name}`}>
      {product.media?<div className="wave3-product-media wave3-card-media"><Picture media={product.media} style={{maxWidth:product.media.width}}/></div>:null}
      <h3>{name}</h3>
      <span className="wave3-card-action">Explore Part <span aria-hidden="true">↗</span></span>
    </a>
    {action?<div className="wave3-card-rfq">{action}</div>:null}
  </article>
}

export function R5ProductGrid({grid,action,className=''}:{grid:ProductGridBlock;action:(p:ProductCardInput)=>ReactNode;className?:string}){
  return <div className={`wave3-card-grid r5-grid ${className}`}>{grid.products.map(p=><R5ProductCard key={p.key} product={p} action={action(p)}/>)}</div>
}

/** Long source copy: headings keep their level and gain an anchor; ≥ 3 headings get an "On this page" index. */
export function R5LongCopy({blocks,ctx={}}:{blocks:Block[];ctx?:RenderContext}){
  const used=new Set<string>()
  const ids=new Map<Block,string>()
  for(const b of blocks)if(b.type==='heading'){let id=slug(plain(b.text));while(used.has(id))id+='-x';used.add(id);ids.set(b,id)}
  const headings=blocks.filter((b):b is HeadingBlock=>b.type==='heading')
  const body=blocks.map(b=>b.type==='heading'?createElement(`h${b.level}`,{key:b.key,id:ids.get(b),className:'r5-copy-heading'},<Rich text={b.text}/>):<BlockView key={b.key} block={b} ctx={ctx}/>)
  if(headings.length<3)return <div className="r5-copy r5-copy--centred">{body}</div>
  const links=headings.map(h=><li key={h.key}><a href={`#${ids.get(h)}`}>{plain(h.text)}</a></li>)
  return <div className="r5-copy r5-copy--toc">
    <aside className="r5-toc-col"><nav className="r5-toc" aria-label="On this page"><p className="r5-toc-title" aria-hidden="true">On this page</p><ol>{links}</ol></nav></aside>
    <div className="r5-copy-col">
      <details className="r5-toc-mobile"><summary>On this page</summary><ol>{links}</ol></details>
      {body}
    </div>
  </div>
}

/** A source list as a checklist (inline SVG checks, decorative). */
export function R5Checklist({list,columns=2}:{list:ListBlock;columns?:1|2}){
  return <ul className={`r5-checks r5-checks--${columns}`}>{list.items.map((item,i)=><li key={i}><svg className="r5-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>{item.href?<a href={item.href}><Rich text={item.text} inLink/></a>:<Rich text={item.text}/>}</span></li>)}</ul>
}
