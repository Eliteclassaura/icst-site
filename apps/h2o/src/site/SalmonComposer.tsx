/**
 * Salmon family presentation — canonical React renderer for `SalmonFamilyPageModel`.
 *
 * Renders the typed content-input contract only (`salmon-family-model.ts`); it never reads a
 * Salmon document, a JSON file or the filesystem. Content fields (rich text, labels, hrefs,
 * media) are rendered as given; presentation fields (layout, type role, panel, overlay, button
 * treatment) select classes and bounded custom properties in `salmon-families.css`.
 * Product actions (RFQ) are injected by the page so no commerce/RFQ logic lives here.
 */
import {createElement,Fragment,type CSSProperties,type ReactNode} from 'react'
import type {AlignStyle,Block,ContainerBlock,FrameStyle,Icon,MediaRef,ProductCardInput,RichText,SectionModel,SvgNode,TextBlock,TypeRole} from './salmon-family-model'

export type RenderContext={
  /** Hero media is eager (it is the largest contentful paint); everything else is lazy. */
  eager?:boolean
  /** The page supplies the product action (verified-context RFQ); presentation stays neutral. */
  productAction?:(product:ProductCardInput)=>ReactNode
  /** The page supplies the generic quote action (approved adapter, genuine page_path). */
  quoteAction?:(label:string)=>ReactNode
}

/* ---------------- primitives ---------------- */
export function Rich({text}:{text:RichText}):ReactNode{
  return text.map((span,i)=>{
    let node:ReactNode=span.text==='\n'?<br key={i}/>:span.text
    if(span.bold)node=<strong key={`b${i}`}>{node}</strong>
    if(span.italic)node=<em key={`i${i}`}>{node}</em>
    return span.href?<a key={`a${i}`} href={span.href}>{node}</a>:<Fragment key={`t${i}`}>{node}</Fragment>
  })
}
const typeProps=(role:TypeRole|undefined)=>{
  const family=role?.family??'sans'
  const style:Record<string,string>={}
  if(role?.sizePx){
    // Source desktop size, scaled with the viewport and floored for small screens.
    const floor=family==='display'?Math.max(24,Math.round(role.sizePx*0.56)):Math.max(14,Math.round(role.sizePx*0.86))
    style['--sp-fs']=`clamp(${floor}px, ${(role.sizePx/14.4).toFixed(3)}vw, ${role.sizePx}px)`
  }
  if(role?.weight&&family==='sans')style['--sp-fw']=String(role.weight)
  const className=[`sp-type-${family}`,role?.color?`sp-c-${role.color}`:role?.defaultColor?'sp-c-default':'',role?.transform==='capitalize'?'sp-tt-cap':role?.transform==='uppercase'?'sp-tt-upper':''].filter(Boolean).join(' ')
  return {className,style:style as CSSProperties}
}
const alignClass=(style:AlignStyle|undefined):string=>`${style?.align?` sp-align-${style.align}`:''}${style?.mobileAlign?` sp-malign-${style.mobileAlign}`:''}`
const frame=(style:FrameStyle):{className:string;style:CSSProperties}=>{
  const css:Record<string,string>={}
  if(style.radiusPx)css['--sp-radius']=`${style.radiusPx}px`
  if(style.widthPct)css['--sp-w']=`${style.widthPct}%`
  return {className:`${style.panel==='soft'?' sp-panel sp-panel--soft sp-panel--tight':style.panel==='blue'?' sp-panel sp-panel--blue sp-panel--tight':''}${style.widthPct?' sp-w':''}`,style:css as CSSProperties}
}
function Svg({node,path}:{node:SvgNode;path:string}):ReactNode{
  const props:Record<string,unknown>={key:path}
  for(const [name,value] of Object.entries(node.attrs))props[name.replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase())]=value
  if(node.tag==='svg'){props['aria-hidden']='true';props.focusable='false'}
  return createElement(node.tag,props,...node.children.map((child,i)=>Svg({node:child,path:`${path}.${i}`})))
}
function IconView({icon}:{icon:Icon|undefined}){
  if(!icon)return null
  if(icon.kind==='image')return <span className="sp-icon sp-icon--image"><img src={icon.media.src} alt="" width={icon.media.width} height={icon.media.height} loading="lazy" data-source-sha256={icon.media.sha256}/></span>
  return <span className={`sp-icon${icon.name?` sp-icon--${icon.name}`:' sp-icon--source'}${icon.disc?' sp-icon--disc':''}`}><Svg node={icon.svg} path="svg"/></span>
}
export function Picture({media,className,eager=false,style}:{media:MediaRef;className?:string;eager?:boolean;style?:CSSProperties}){
  return <img className={className} style={style} src={media.src} alt={media.alt} width={media.width} height={media.height} loading={eager?'eager':'lazy'} fetchPriority={eager?'high':undefined} decoding={eager?'sync':'async'} data-source-sha256={media.sha256} data-source-src={media.sourceUrl}/>
}
function TextBlocks({blocks}:{blocks:TextBlock[]}){
  return blocks.map((block,i)=>{
    switch(block.kind){
      case 'paragraph':return <p key={i}><Rich text={block.content}/></p>
      case 'quote':return <blockquote key={i}><Rich text={block.content}/></blockquote>
      case 'heading':return createElement(`h${block.level}`,{key:i},<Rich text={block.content}/>)
      case 'bullets':case 'numbered':return createElement(block.kind==='bullets'?'ul':'ol',{key:i},...block.items.map((item,j)=><li key={j}><Rich text={item}/></li>))
      case 'table':return <div key={i} className="technical-table" role="region" tabIndex={0} aria-label="Scrollable table"><table><tbody>{block.rows.map((row,j)=><tr key={j}>{row.map((cell,k)=><td key={k}><Rich text={cell}/></td>)}</tr>)}</tbody></table></div>
    }
  })
}

/* ---------------- product cards (Parts family) ---------------- */
export function ProductCard({product,ctx}:{product:ProductCardInput;ctx:RenderContext}){
  const name=<Rich text={product.name}/>
  return <article className="sp-product" data-product-route={product.productPath} data-salmon-product-card="">
    <h3 className="sp-product-title">{product.productPath?<a href={product.productPath}>{name}</a>:name}</h3>
    {product.media?<a className="sp-product-media" href={product.productPath} tabIndex={-1} aria-hidden="true"><Picture media={product.media} eager={ctx.eager}/></a>:null}
    {product.detail?.length?<div className="sp-product-detail"><TextBlocks blocks={product.detail}/></div>:null}
    <div className="sp-product-action">{ctx.productAction?.(product)??ctx.quoteAction?.('Request a Quote')??<a className="sp-btn sp-btn--solid" href="/contact-us/" data-salmon-exception="RFQ_ONLY">Request a Quote</a>}</div>
  </article>
}

/* ---------------- blocks ---------------- */
export function BlockView({block,ctx}:{block:Block;ctx:RenderContext}):ReactNode{
  switch(block.type){
    case 'container':return <ContainerView block={block} ctx={ctx}/>
    case 'heading':{
      const type=typeProps(block.style)
      return createElement(`h${block.level}`,{className:`sp-heading ${type.className}${alignClass(block.style)}`,style:type.style,'data-source-node':block.key,id:block.anchorId},<Rich text={block.text}/>)
    }
    case 'text':{
      const type=typeProps(block.style)
      return <div className={`sp-text ${type.className}${alignClass(block.style)}`} style={type.style} data-source-node={block.key}><TextBlocks blocks={block.blocks}/></div>
    }
    case 'label':return <div className={`sp-label-row${alignClass(block.style)}`}><span className="sp-label">{block.text}</span></div>
    case 'button':{
      if((block.rfqOnly||block.intent==='quote')&&ctx.quoteAction)return <div className={`sp-btn-row sp-btn-row--rfq sp-btn-row--${block.variant}${alignClass(block.style)}`}>{ctx.quoteAction(block.label)}</div>
      const className=`sp-btn sp-btn--${block.variant}${block.href?'':' sp-btn--inert'}`
      return <div className={`sp-btn-row${alignClass(block.style)}`}>{block.href?<a className={className} href={block.href} data-salmon-exception={block.rfqOnly?'RFQ_ONLY':undefined}>{block.label}</a>:<span className={className}>{block.label}</span>}</div>
    }
    case 'image':{
      const style=block.style.width||block.style.radius?{maxInlineSize:block.style.width,inlineSize:block.style.width?.endsWith('%')?block.style.width:undefined,borderRadius:block.style.radius}:undefined
      return <figure className={`sp-figure${alignClass(block.style)}`}><Picture media={block.media} className="sp-img" eager={ctx.eager} style={style}/></figure>
    }
    case 'iconCard':{
      const title=typeProps(block.titleStyle),text=typeProps(block.textStyle),box=frame(block.style)
      return <div className={`sp-iconbox${block.side?' sp-iconbox--side':''}${alignClass(block.style)}${box.className}`} style={box.style}>
        {block.iconAfter?null:<IconView icon={block.icon}/>}
        <div className="sp-iconbox-body">
          {block.title?createElement(`h${block.titleLevel}`,{className:`sp-card-title ${title.className}`,style:title.style},block.href?<a href={block.href}><Rich text={block.title}/></a>:<Rich text={block.title}/>):null}
          {block.text?<p className={`sp-card-text ${text.className}`} style={text.style}><Rich text={block.text}/></p>:null}
        </div>
        {block.iconAfter?<IconView icon={block.icon}/>:null}
      </div>
    }
    case 'imageCard':{
      const title=typeProps(block.titleStyle),text=typeProps(block.textStyle),box=frame(block.style)
      const imageStyle=block.style.imageWidth||block.style.imageRadius?{maxInlineSize:block.style.imageWidth,inlineSize:block.style.imageWidth?.endsWith('%')?block.style.imageWidth:undefined,borderRadius:block.style.imageRadius}:undefined
      const picture=block.media?<Picture media={block.media} className="sp-imagebox-img" eager={ctx.eager} style={imageStyle}/>:null
      return <div className={`sp-imagebox${alignClass(block.style)}${box.className}`} style={box.style}>
        {picture?<figure className="sp-imagebox-figure">{block.href?<a href={block.href} tabIndex={-1} aria-hidden="true">{picture}</a>:picture}</figure>:null}
        {block.title?createElement(`h${block.titleLevel}`,{className:`sp-card-title ${title.className}`,style:title.style},block.href?<a href={block.href}><Rich text={block.title}/></a>:<Rich text={block.title}/>):null}
        {block.text?<p className={`sp-card-text ${text.className}`} style={text.style}><Rich text={block.text}/></p>:null}
      </div>
    }
    case 'list':{
      const type=typeProps(block.style)
      return <ul className={`sp-iconlist ${type.className}`} style={type.style}>{block.items.map((item,i)=><li key={i}><IconView icon={item.icon}/><span>{item.href?<a href={item.href}><Rich text={item.text}/></a>:<Rich text={item.text}/>}</span></li>)}</ul>
    }
    case 'accordion':return <div className="sp-accordion">{block.items.map((item,i)=><details key={i}><summary>{item.question}</summary><div className="sp-accordion-body">{children(item.answer,ctx)}</div></details>)}</div>
    case 'anchor':return <span className="sp-anchor" id={block.id}/>
    case 'iconLink':return block.href?<a className="sp-icon-link" href={block.href} aria-label={block.label}><IconView icon={block.icon}/></a>:<span className="sp-icon-link"><IconView icon={block.icon}/></span>
    case 'productGrid':
      return block.single&&block.products[0]?<ProductCard product={block.products[0]} ctx={ctx}/>:<div className="sp-products" data-product-count={block.products.length}>{block.products.map(product=><ProductCard key={product.key} product={product} ctx={ctx}/>)}</div>
  }
}
const children=(blocks:Block[],ctx:RenderContext)=>blocks.map(block=>block.hideOn?.length?<div key={block.key} className={`sp-visibility${block.hideOn.map(device=>` sp-hide-${device}`).join('')}`}><BlockView block={block} ctx={ctx}/></div>:<BlockView key={block.key} block={block} ctx={ctx}/>)

/** One container, following the source's direction, widths, panel and background mode. */
export function ContainerView({block,ctx}:{block:ContainerBlock;ctx:RenderContext}){
  const {layout,background}=block
  const style:Record<string,string>={}
  if(layout.widthPct)style['--sp-w']=`${layout.widthPct}%`
  if(layout.minHeightPx)style['--sp-minh']=`${layout.minHeightPx}px`
  if(layout.radiusPx)style['--sp-radius']=`${layout.radiusPx}px`
  if(layout.overlay)style['--sp-shade']=String(layout.overlay.opacity)
  if(layout.gridColumns)style['--sp-cols']=String(layout.gridColumns)
  if(layout.gridTemplate)style['--sp-grid-template']=layout.gridTemplate
  const panel=layout.panel==='blue-gradient'?' sp-panel sp-panel--blue sp-panel--gradient':layout.panel?` sp-panel sp-panel--${layout.panel}`:''
  // A row made only of widgets (flag tiles, icon cards) keeps sharing the row on small screens.
  const widgetRow=layout.direction==='row'&&block.children.length>1&&block.children.every(child=>child.type!=='container')
  const classes=['sp-con',layout.direction==='grid'?'sp-grid':layout.direction==='row'?'sp-row':'sp-col',widgetRow?'sp-row--widgets':'',layout.widthPct?'sp-w':'',layout.align?`sp-align-${layout.align}`:'',layout.mobileAlign?`sp-malign-${layout.mobileAlign}`:'',layout.justify?`sp-justify-${layout.justify}`:'',layout.rounded?'sp-rounded':''].filter(Boolean).join(' ')+panel
  const common={className:classes,'data-salmon-element':block.elementId}
  if(background?.mode==='photo')return <div {...common} className={`${classes} sp-photo sp-overlay--${layout.overlay?.tone??'dark'}`} style={style as CSSProperties}><Picture media={background.media} className="sp-photo-img" eager={ctx.eager}/><span className="sp-photo-shade" aria-hidden="true"/><div className="sp-photo-content">{children(block.children,ctx)}</div></div>
  if(background?.mode==='backdrop')return <div {...common} className={`${classes} sp-bg`} style={{...style,backgroundImage:`url("${background.media.src}")`,...(background.fit?{backgroundSize:background.fit}:{}),...(background.position?{backgroundPosition:background.position}:{})} as CSSProperties} data-source-background-sha256={background.media.sha256} data-source-src={background.media.sourceUrl}>{children(block.children,ctx)}</div>
  // A sized or overlaid source background panel keeps its Salmon crop (size/position) and shade.
  if(background?.mode==='image'&&(layout.minHeightPx||layout.overlay))return <div {...common} className={`${classes} sp-media sp-media--panel${layout.overlay?` sp-overlay--${layout.overlay.tone}`:''}`} style={{...style,backgroundImage:`url("${background.media.src}")`,backgroundSize:background.fit??'cover',backgroundPosition:background.position??'center'} as CSSProperties} role="img" aria-label={background.media.alt||undefined} aria-hidden={background.media.alt?undefined:true} data-source-background-sha256={background.media.sha256} data-source-src={background.media.sourceUrl}>{layout.overlay?<span className="sp-photo-shade" aria-hidden="true"/>:null}</div>
  if(background?.mode==='image')return <div {...common} className={`${classes} sp-media`} style={style as CSSProperties}><Picture media={background.media} className="sp-media-img" eager={ctx.eager}/></div>
  return <div {...common} style={style as CSSProperties}>{children(block.children,ctx)}</div>
}

/** A page section. Hero sections render their media eagerly. */
export function SectionView({section,ctx,className}:{section:SectionModel;ctx:RenderContext;className?:string}){
  const extra=[section.role==='related-products'?'sp-parts-related':'',...(section.root.hideOn??[]).map(device=>`sp-hide-${device}`),className??''].filter(Boolean).join(' ')
  return <section className={`sp-section sp-section--${section.treatment}${section.tone?` sp-section--${section.tone}`:''}${extra?` ${extra}`:''}`} data-salmon-section={section.index} data-salmon-element={section.elementId}>
    <div className="sp-section-inner"><ContainerView block={section.root} ctx={section.treatment==='hero'?{...ctx,eager:true}:ctx}/></div>
  </section>
}
