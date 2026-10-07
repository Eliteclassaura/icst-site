import {createElement,type CSSProperties,type ReactNode} from 'react'
import {deliverySrc} from '../media-delivery'
import {r4Media,type R4Media} from '../design-r4-media'

/**
 * Design R4 (CT GO 2026-10-07): the shared hero and section system (H2O_DESIGN_R4_SPEC_SHARED_SYSTEM.md). One system for
 * every R4 page. Every visible text on an R4 page is the page's own source text, rendered through the page renderer's
 * key-addressed pipeline (`R4Api`), so CMS edits and recorded claim edits keep flowing; the only R4-authored strings are the
 * decorative eyebrow labels (aria-hidden) and the CT-ruled Dry Soda StatBar (content/design/design-r4-copy.json).
 */
export type R4Api={
  /** The children of a source node (text, inline links, RFQ controls), rendered by the page's own pipeline. */
  inner:(ref:string)=>ReactNode
  /** The source node's tag (h1…h6, p, div, span). */
  tag:(ref:string)=>string
  /** A source call to action, as a styled control: an RFQ control for a quote label, otherwise its link. */
  action:(ref:string,variant:R4ButtonVariant)=>ReactNode
  /** The page's RFQ control with page context (native panel; /contact-us/ fallback), under a given label. */
  quote:(key:string,label:string,variant:R4ButtonVariant,heroAction?:'quote')=>ReactNode
  /** The page's restored sections for a template slot (content/restored-sections), placed by the composition. */
  restored:(slot:string)=>ReactNode
}
export type R4ButtonVariant='white'|'ghost'|'blue'|'navy-ghost'

const HEADING=/^h[1-6]$/
/** A source text element: its own heading tag (the outline is unchanged), otherwise `as`. */
export function Src({api,r,as='p',className,id}:{api:R4Api;r:string;as?:string;className?:string;id?:string}){
  const tag=api.tag(r)
  return createElement(HEADING.test(tag)?tag:as,{className,id},api.inner(r))
}

/** Several source paragraphs in one block. */
export function Paras({api,refs,className}:{api:R4Api;refs:string[];className?:string}){
  return <div className={className}>{refs.map(r=><Src key={r} api={api} r={r}/>)}</div>
}

/** "● 0N / Label": decorative text, never a heading (the audit's "01 coded as H2" fix). */
export function Eyebrow({label,tone='light'}:{label:string;tone?:'light'|'dark'}){
  return <p className={`dr4-eyebrow dr4-eyebrow--${tone}`} aria-hidden="true"><span className="dr4-eyebrow-dot"/>{label}</p>
}

/** A responsive image from the R4 ledger: srcset never exceeds the source; explicit dimensions; eager only for heroes. */
export function R4Img({slot,media,eager=false,className,sizes,alt,style}:{slot?:string;media?:R4Media;eager?:boolean;className?:string;sizes:string;alt?:string;style?:CSSProperties}){
  const m=media??r4Media(slot!)
  const largest=m.variants.at(-1)!
  return <img className={className} src={largest.src} srcSet={m.variants.map(v=>`${v.src} ${v.w}w`).join(', ')} sizes={sizes} width={largest.w} height={largest.h}
    alt={alt??m.alt} loading={eager?'eager':'lazy'} fetchPriority={eager?'high':undefined} decoding={eager?'sync':'async'}
    style={{objectPosition:m.position,...style}} data-r4-media={slot} data-source-sha256={m.source.sha256}/>
}

/** A held staging image reused at its own size (no new bytes). */
export function HeldImg({src,width,height,alt,className,position='50% 50%'}:{src:string;width:number;height:number;alt:string;className?:string;position?:string}){
  return <img className={className} src={deliverySrc(src)} width={width} height={height} alt={alt} loading="lazy" decoding="async" style={{objectPosition:position}}/>
}

export function R4Hero({api,slot,eyebrow,eyebrowRef,h1,lead,actions,variant='photo',id='r4-hero-title'}:{api:R4Api;slot:string;eyebrow?:string;eyebrowRef?:string;h1:string;lead:string|string[];actions:ReactNode;variant?:'photo'|'hub'|'split';id?:string}){
  // The split variant (Air Coolers: a 1024 px owner image) shows the photo in the right 48 % at ≥ 1024, never upscaled.
  const sizes=variant==='split'?'(min-width: 1024px) 600px, calc(100vw - 32px)':'(min-width: 1300px) 1260px, calc(100vw - 32px)'
  return <section className={`dr4-hero dr4-hero--${variant}`} aria-labelledby={id}>
    <R4Img slot={slot} eager className="dr4-hero-img" sizes={sizes}/>
    <div className="dr4-hero-body">
      {eyebrowRef?<p className="dr4-eyebrow dr4-eyebrow--on-photo"><span className="dr4-eyebrow-dot" aria-hidden="true"/>{api.inner(eyebrowRef)}</p>:eyebrow?<Eyebrow label={eyebrow} tone="dark"/>:null}
      <Src api={api} r={h1} as="h1" className="dr4-hero-title" id={id}/>
      {(Array.isArray(lead)?lead:[lead]).map(r=><Src key={r} api={api} r={r} className="dr4-hero-lead"/>)}
      <div className="dr4-actions">{actions}</div>
    </div>
  </section>
}

export function Section({children,className='',id,label}:{children:ReactNode;className?:string;id?:string;label?:string}){
  return <section className={`dr4-section ${className}`} id={id} aria-label={label}>{children}</section>
}

export function Split({media,children,reverse=false,className=''}:{media:ReactNode;children:ReactNode;reverse?:boolean;className?:string}){
  return <div className={`dr4-split${reverse?' dr4-split--reverse':''} ${className}`}><div className="dr4-split-media">{media}</div><div className="dr4-split-text">{children}</div></div>
}

export function NavyPanel({children,className=''}:{children:ReactNode;className?:string}){
  return <div className={`dr4-navy ${className}`}>{children}</div>
}

/** Numbered cards; the badge numerals are decorative. `active` marks the first card only (never random). */
export function CardGrid({items,columns=3,activeFirst=false,className=''}:{items:{key:string;head:ReactNode;body?:ReactNode;foot?:ReactNode;wide?:boolean;navy?:boolean}[];columns?:2|3;activeFirst?:boolean;className?:string}){
  return <ol className={`dr4-cards dr4-cards--${columns} ${className}`}>{items.map((item,i)=><li key={item.key} className={`dr4-card${(activeFirst&&i===0)||item.navy?' dr4-card--navy':''}${item.wide?' dr4-card--wide':''}`}>
    <span className="dr4-badge" aria-hidden="true">{String(i+1).padStart(2,'0')}</span>{item.head}{item.body}{item.foot}
  </li>)}</ol>
}

export function ChipGrid({items}:{items:{key:string;label:ReactNode}[]}){
  return <ol className="dr4-chips">{items.map((item,i)=><li key={item.key} className="dr4-chip"><span className="dr4-chip-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span>{item.label}</li>)}</ol>
}

/** Numbered steps: CSS text numerals (Bebas, aria-hidden); the order lives in the <ol>. */
export function StepList({items}:{items:{key:string;head:ReactNode;body:ReactNode}[]}){
  return <ol className="dr4-steps">{items.map((item,i)=><li key={item.key} className="dr4-step"><span className="dr4-step-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><div className="dr4-step-text">{item.head}{item.body}</div></li>)}</ol>
}

export function CTABand({slot,children}:{slot:string;children:ReactNode}){
  return <section className="dr4-cta-band"><R4Img slot={slot} className="dr4-cta-img" sizes="(min-width: 1300px) 1260px, calc(100vw - 32px)"/><div className="dr4-cta-body">{children}</div></section>
}

/** A photo with a visible caption (only where CT has ruled a caption allowed). */
export function Figure({slot,className,sizes}:{slot:string;className?:string;sizes:string}){
  const m=r4Media(slot) as R4Media&{caption?:string}
  return <figure className="dr4-figure"><R4Img slot={slot} className={className} sizes={sizes}/>{m.caption?<figcaption className="dr4-caption">{m.caption}</figcaption>:null}</figure>
}

/** Case-study facts: label / value pairs from the page's own source text. */
export function Facts({api,items}:{api:R4Api;items:[string,string][]}){
  return <dl className="dr4-facts">{items.map(([label,value])=><div key={label} className="dr4-fact"><dt>{api.inner(label)}</dt><dd>{api.inner(value)}</dd></div>)}</dl>
}

/** Three photo cards with checklists (Air Coolers upgrade options); stacked below 1024 (no scrollable region to focus). */
export function PhotoCardTrio({items}:{items:{key:string;media:ReactNode;head:ReactNode;checks:ReactNode[]}[]}){
  return <ul className="dr4-trio">{items.map(item=><li key={item.key} className="dr4-trio-card">{item.media}<div className="dr4-trio-body">{item.head}<ul className="dr4-checks">{item.checks.map((c,i)=><li key={i}><svg className="dr4-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>{c}</span></li>)}</ul></div></li>)}</ul>
}
