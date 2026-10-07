import type {ReactNode} from 'react'
import {deliverySrc} from '../media-delivery'
import {LuxuryFooter,LuxuryHeader} from '../LuxuryShell'
import {SalmonSeo} from '../SalmonCanonical'
import {pageForSegments} from '../cohort'
import {R2Discovery} from '../R2Discovery'
import {RestoredSlot} from '../RestoredSlot'
import {quoteRfqAction} from '../SalmonFamilies'
import {salmonFamilyFor,salmonFamilyModel} from '../salmon-family-adapter'
import type {Block,MediaRef,RichText,SalmonFamilyPageModel,TextBlock} from '../salmon-family-model'
import type {SalmonDocument} from '../salmon'
import {r4Copy} from '../design-r4-media'
import {Eyebrow,R4Img} from './R4System'
import {R4LauncherReveal} from './R4LauncherReveal'

/**
 * Design R4 phase 2: All Projects (SALMON-pages-1353, spec H2O_DESIGN_R4_SPEC_all-projects.md). The page keeps its
 * project-portfolio model (the content contract): every text, link, year, flag and card photo comes from the model, so
 * CMS edits keep flowing. R4 only re-composes it: H1 hero, country chips, one uniform card grid per country.
 * CT ruling 2026-10-07: Nevada and Texas sit under the one "United States" chip (no state chips); their sections follow the
 * United States section and keep their own headings.
 */
export const R4_PORTFOLIO_ROUTE='SALMON-pages-1353'
const US_STATES=['texa','neva']

type Card={key:string;href:string;title:string;meta:string;year?:string;photo?:MediaRef;flag?:MediaRef}
type Country={key:string;anchor:string;heading:string;cards:Card[]}

const plain=(r?:RichText)=>(r??[]).map(x=>x.text).join('').replace(/\s+/g,' ').trim()
const paraText=(blocks:TextBlock[])=>blocks.flatMap(b=>'content' in b?[plain(b.content as RichText)]:[]).filter(Boolean)
function walk(b:Block,f:(b:Block,path:Block[])=>void,path:Block[]=[]){f(b,path);for(const c of ('children' in b?(b.children as Block[]):[]))walk(c,f,[...path,b])}
const find=(b:Block,pred:(x:Block)=>boolean)=>{let hit:Block|undefined;walk(b,x=>{if(!hit&&pred(x))hit=x});return hit}

/** The card around a project icon card: its nearest ancestor that holds a photo or the year button (never a sibling card's). */
function cardFor(icon:Extract<Block,{type:'iconCard'}>,path:Block[]):Card{
  const holder=[...path].reverse().find(a=>a.type==='container'&&!!find(a,x=>x.type==='button'||(x.type==='container'&&!!x.background)))
  const button=holder?find(holder,x=>x.type==='button') as Extract<Block,{type:'button'}>|undefined:undefined
  const bg=holder?find(holder,x=>x.type==='container'&&!!x.background) as Extract<Block,{type:'container'}>|undefined:undefined
  return {key:icon.key,href:icon.href!,title:plain(icon.title),meta:plain(icon.text),year:button?.label?.trim()||undefined,photo:bg?.background?.media,flag:icon.icon?.kind==='image'?icon.icon.media:undefined}
}

export function portfolioView(model:SalmonFamilyPageModel){
  const [head,...rest]=model.sections
  const h1=find(head!.root,x=>x.type==='heading'&&x.level===1) as Extract<Block,{type:'heading'}>
  const h2=find(head!.root,x=>x.type==='heading'&&x.level===2) as Extract<Block,{type:'heading'}>
  const texts:string[][]=[];walk(head!.root,x=>{if(x.type==='text')texts.push(paraText(x.blocks))})
  const chips:{key:string;href:string;label:string;flag?:MediaRef}[]=[]
  walk(head!.root,x=>{if(x.type==='imageCard'&&x.href?.startsWith('#')&&!US_STATES.includes(x.href.slice(1)))chips.push({key:x.key,href:x.href,label:plain(x.title),flag:x.media})})
  const countries:Country[]=rest.map(section=>{
    const anchor=(find(section.root,x=>x.type==='anchor') as Extract<Block,{type:'anchor'}>|undefined)?.id??section.key
    const heading=plain((find(section.root,x=>x.type==='heading') as Extract<Block,{type:'heading'}>|undefined)?.text)
    const cards:Card[]=[]
    walk(section.root,(x,path)=>{if(x.type==='iconCard'&&x.href?.startsWith('/all-projects/'))cards.push(cardFor(x,path))})
    return {key:section.key,anchor,heading,cards}
  }).filter(c=>c.cards.length)
  const states=US_STATES.map(a=>countries.find(c=>c.anchor===a)).filter((c):c is Country=>!!c)
  const ordered=countries.filter(c=>!US_STATES.includes(c.anchor)).flatMap(c=>c.anchor==='usa'?[c,...states]:[c])
  if(!ordered.some(c=>c.anchor==='usa'))ordered.push(...states)
  return {h1:plain(h1.text),h1Key:h1.key,h2:plain(h2?.text),h2Key:h2?.key,intro:texts[0]??[],lead:texts[1]??[],chips,countries:ordered}
}

/** One uniform card. Records without verified media get a navy panel (type and year) in the image's place (spec §1.4). */
function ProjectCard({card}:{card:Card}){
  const id=`r4-proj-${card.key.replace(/\W+/g,'-')}`
  return <li className={`dr4-proj${card.photo?'':' dr4-proj--text'}`} data-project-href={card.href}>
    {card.photo
      ?<div className="dr4-proj-media"><img className="dr4-proj-img" src={deliverySrc(card.photo.src)} width={card.photo.width} height={card.photo.height} alt={card.photo.alt} loading="lazy" decoding="async" data-source-sha256={card.photo.sha256}/></div>
      :<div className="dr4-proj-media dr4-proj-panel">{card.year?<span className="dr4-proj-year">{card.year}</span>:null}{card.meta?<p className="dr4-proj-panel-meta">{card.meta}</p>:null}</div>}
    <div className="dr4-proj-body">
      <div className="dr4-proj-top">{card.photo&&card.year?<span className="dr4-proj-year">{card.year}</span>:<span/>}{card.flag?<img className="dr4-proj-flag" src={deliverySrc(card.flag.src)} alt="" width={card.flag.width} height={card.flag.height} loading="lazy" decoding="async"/>:null}</div>
      <h3 className="dr4-proj-title" id={id}><a href={card.href}>{card.title}</a></h3>
      {card.photo&&card.meta?<p className="dr4-proj-meta">{card.meta}</p>:null}
      <span className="dr4-proj-more" aria-hidden="true">View project ↗</span>
    </div>
  </li>
}

function CountrySection({c}:{c:Country}){
  return <section className="dr4-section dr4-section--country" id={c.anchor} aria-labelledby={`r4-c-${c.anchor}`}>
    <div className="dr4-country-head"><h2 className="dr4-h2 dr4-h2--country" id={`r4-c-${c.anchor}`}>{c.heading}</h2><span className="dr4-country-count" aria-hidden="true">{String(c.cards.length).padStart(2,'0')}</span></div>
    <ul className="dr4-proj-grid">{c.cards.map(card=><ProjectCard key={card.key} card={card}/>)}</ul>
  </section>
}

/** Consecutive single-project countries share one row (each keeps its own section and heading). */
function groups(countries:Country[]):Country[][]{
  const out:Country[][]=[]
  for(const c of countries){const last=out.at(-1);if(c.cards.length===1&&last&&last[0]!.cards.length===1)last.push(c);else out.push([c])}
  return out
}

export function R4PortfolioMain({model,quote,restored}:{model:SalmonFamilyPageModel;quote:ReactNode;restored?:ReactNode}){
  const v=portfolioView(model)
  const e=r4Copy().eyebrows[model.path]??{}
  return <main id="main" className="sp-main" data-r4-family={model.family} data-content-contract={model.contract}>
    <div className="dr4" data-r4-route={model.path}>
      <section className="dr4-hero dr4-hero--hub dr4-hero--portfolio" aria-labelledby="r4-hero-title">
        <R4Img slot="projects.hero" eager className="dr4-hero-img" sizes="(min-width: 1300px) 1260px, calc(100vw - 32px)"/>
        <div className="dr4-hero-body">
          {e.hero?<Eyebrow label={e.hero} tone="dark"/>:null}
          <h1 className="dr4-hero-title" id="r4-hero-title" data-source-key={v.h1Key}>{v.h1}</h1>
          {v.h2?<h2 className="dr4-hero-subtitle" data-source-key={v.h2Key}>{v.h2}</h2>:null}
          {v.lead.map((p,i)=><p key={i} className="dr4-hero-lead">{p}</p>)}
          <div className="dr4-actions"><span className="dr4-btn dr4-btn--white" data-hero-action="quote">{quote}</span></div>
        </div>
      </section>
      <R4LauncherReveal/>
      <nav className="dr4-country-chips" aria-label="Projects by country">
        <ul>{v.chips.map(c=><li key={c.key}><a href={c.href}>{c.flag?<img src={deliverySrc(c.flag.src)} width={20} height={14} alt="" loading="lazy" decoding="async"/>:null}<span>{c.label}</span></a></li>)}</ul>
      </nav>
      {v.intro.length?<div className="dr4-portfolio-intro">{v.intro.map((p,i)=><p key={i} className="dr4-lead">{p}</p>)}</div>:null}
      {groups(v.countries).map(g=>g.length>1
        ?<div key={g[0]!.key} className="dr4-country-row">{g.map(c=><CountrySection key={c.key} c={c}/>)}</div>
        :<CountrySection key={g[0]!.key} c={g[0]!}/>)}
    </div>
    {model.modules.projectDiscovery?<R2Discovery kind="projects"/>:null}
    {restored}
  </main>
}

export function R4PortfolioPage({doc}:{doc:SalmonDocument}){
  const model=salmonFamilyModel(doc,salmonFamilyFor(doc)!)
  const page=pageForSegments(model.path.split('/').filter(Boolean))
  return <div className="luxury-site salmon-family salmon-family--project-portfolio" data-salmon-document={model.routeId} data-salmon-source-sha256={model.source.sha256}>
    <SalmonSeo doc={doc}/>
    <LuxuryHeader page={page} routePath={model.path}/>
    <R4PortfolioMain model={model} quote={quoteRfqAction(model.path,'Request a Quote')} restored={<RestoredSlot doc={doc} slot="body-end" className="sp-section-inner wave3-source-content"/>}/>
    <LuxuryFooter page={page} routePath={model.path}/>
  </div>
}
