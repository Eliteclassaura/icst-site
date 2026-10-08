import {Children,cloneElement,isValidElement,type ReactElement,type ReactNode} from 'react'
import {CardGrid,NavyPanel,Paras,R4Img,Section,Split,Src,StepList,type R4Api} from '../r4/R4System'
import {heroActionFor} from '../hero-actions'
import {r5bMedia} from './r5b-media'

/**
 * Design R5b (CT 2026-10-07; DD spec H2O_DESIGN_R5_SPEC_new-cooling-tower_disaster-recovery.md). Each composition lays the
 * page's own source text, by source key, into the shared R4 system (src/site/r4). Headings keep their staging tag, so the
 * outline is unchanged except where an OGCS row says otherwise (Disaster Recovery's "Cooling towers after reconstruction"
 * becomes a figcaption). Routes, titles and metas are untouched; no source text is imported from Figma.
 */
type Builder=(api:R4Api,path:string)=>ReactNode

function heroActions(api:R4Api,path:string){
  const action=heroActionFor(path)
  return <>{api.quote('hero-primary',action?.label??'Request a Quote','white','quote')}{action?.secondary?.href?<a className="dr4-btn dr4-btn--ghost" href={action.secondary.href} data-hero-action="secondary">{action.secondary.label}</a>:null}</>
}

function Hero({api,slot,h1,lead,path}:{api:R4Api;slot:string;h1:string;lead:string[];path:string}){
  return <section className="dr4-hero dr4-hero--photo" aria-labelledby="r4-hero-title">
    <R4Img media={r5bMedia(slot)} slot={slot} eager className="dr4-hero-img" sizes="(min-width: 1300px) 1260px, calc(100vw - 32px)"/>
    <div className="dr4-hero-body">
      <Src api={api} r={h1} as="h1" className="dr4-hero-title" id="r4-hero-title"/>
      {lead.map(r=><Src key={r} api={api} r={r} className="dr4-hero-lead"/>)}
      <div className="dr4-actions">{heroActions(api,path)}</div>
    </div>
  </section>
}

/** A source heading shown as a small kicker; it stays a heading so the outline is unchanged. */
const Kicker=({api,r}:{api:R4Api;r:string})=><Src api={api} r={r} as="h2" className="r5b-kicker"/>

/** Source label text without link wrappers or whitespace-only fragments (the source wraps chip labels in empty "#" anchors). */
function plain(node:ReactNode):ReactNode{
  if(typeof node==='string')return node.trim()?node:null
  if(Array.isArray(node))return Children.toArray(node).map(plain)
  if(!isValidElement(node))return node
  const el=node as ReactElement<{children?:ReactNode}>
  const inner=plain(el.props.children)
  if(el.type==='a')return <>{inner}</>
  return cloneElement(el,{},inner)
}

/** A source list item: its own label text. */
const Check=({api,r}:{api:R4Api;r:string})=><li className="r5b-check"><svg className="dr4-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>{plain(api.inner(r))}</span></li>

const coolingTower:Builder=(api,path)=>{
  const services=['7.3.1.1.1.1.3','7.3.1.3.1.1.3','7.3.1.5.1.1.3','7.5.1.1.1.1.3','7.5.1.3.1.1.3','7.5.1.5.1.1.3']
  const industries=['9.7.1.1.1.1.3','9.7.1.3.1.1.3','9.7.1.5.1.1.3','9.9.1.1.1.1.3','9.9.1.3.1.1.3','9.9.1.5.1.1.3','9.11.1.1.1.1.3','9.11.1.3.1.1.3','9.11.1.5.1.1.3']
  const counterflow=['11.3.1.1.3.1.1','11.3.1.1.3.1.3','11.3.1.1.3.1.5','11.3.1.1.3.3.1','11.3.1.1.3.3.3','11.3.1.1.3.3.5','11.3.1.3.1.1','11.3.1.3.1.3','11.3.1.3.1.5','11.3.1.3.1.7','11.3.1.3.1.9','11.3.1.3.1.11']
  const crossflow=['11.5.1.1.3.1.1','11.5.1.1.3.1.3','11.5.1.1.3.1.5','11.5.1.1.3.3.1','11.5.1.1.3.3.3','11.5.1.1.3.3.5','11.5.1.3.1.1','11.5.1.3.1.3','11.5.1.3.1.5','11.5.1.3.1.7','11.5.1.3.1.9']
  const materials=[
    {key:'frp',h:'17.1.3.1.1.1.1.1',p:'17.1.3.1.1.1.3.1',li:['17.1.3.1.3.1.1.1.1','17.1.3.1.3.1.1.1.3','17.1.3.1.3.1.1.1.5']},
    {key:'concrete',h:'17.1.5.1.1.1.1.1',p:'17.1.5.1.1.1.3.1',li:['17.1.5.1.3.1.1.1.1','17.1.5.1.3.1.1.1.3','17.1.5.1.3.1.1.1.5','17.1.5.1.3.1.1.1.7']},
    {key:'stainless',h:'17.1.7.1.1.1.1.1',p:'17.1.7.1.1.1.3.1',li:['17.1.7.1.3.1.1.1.1','17.1.7.1.3.1.1.1.3','17.1.7.1.3.1.1.1.5','17.1.7.1.3.1.1.1.7']},
  ]
  const draft=r5bMedia('ct.cutaway')
  return <>
    <Hero api={api} slot="ct.hero" h1="body.1.1.1.1.1.1" lead={['body.1.1.1.1.3.1']} path={path}/>
    <Section id="service-overview" className="dr4-section--overview">
      <Split media={<R4Img media={r5bMedia('ct.droplet')} slot="ct.droplet" className="r5b-droplet" sizes="286px"/>}>
        <Kicker api={api} r="body.3.1.1.1.1"/>
        <Src api={api} r="body.3.1.1.3.1" as="h2" className="dr4-h2"/>
        <Paras api={api} refs={['body.3.1.1.5.1']} className="dr4-prose"/>
      </Split>
    </Section>
    <Section className="r5b-center">
      <Kicker api={api} r="body.5.1.1"/>
      <Src api={api} r="body.5.3.1" as="h2" className="dr4-h2"/>
      <Paras api={api} refs={['body.5.5.1','body.5.5.2']} className="dr4-prose"/>
      <div className="dr4-actions">{api.quote('process-quote','Request a Quote','blue')}</div>
    </Section>
    <Section className="dr4-section--repairs">
      <NavyPanel>
        <Kicker api={api} r="body.7.1.1.1.1"/>
        <Src api={api} r="body.7.1.1.3.1" as="h2" className="dr4-h2 dr4-h2--on-navy"/>
        <CardGrid items={services.map(s=>({key:s,head:<Src api={api} r={`body.${s}.1`} as="h3" className="dr4-card-title"/>,body:<Src api={api} r={`body.${s}.3`} className="dr4-card-body"/>}))}/>
        <Src api={api} r="body.7.7.1.1.1" className="dr4-prose dr4-prose--on-navy"/>
        <div className="dr4-actions">{api.action('body.7.7.1.3.1','white')}</div>
      </NavyPanel>
    </Section>
    <Section>
      <Kicker api={api} r="body.9.1.1"/>
      <Src api={api} r="body.9.3.1" as="h2" className="dr4-h2"/>
      <Src api={api} r="body.9.5.1" className="dr4-prose"/>
      <CardGrid items={industries.map(s=>({key:s,head:<Src api={api} r={`body.${s}.1`} as="h3" className="dr4-card-title"/>,body:<Src api={api} r={`body.${s}.3`} className="dr4-card-body"/>}))}/>
    </Section>
    <Section>
      <Kicker api={api} r="body.11.1.1.1.1"/>
      <Src api={api} r="body.11.1.1.3.1" as="h2" className="dr4-h2"/>
      <Src api={api} r="body.11.1.1.5.1" className="dr4-prose"/>
      <div className="r5b-types">
        <article className="r5b-type-card">
          <Src api={api} r="body.11.3.1.1.1.1.1" as="h2" className="dr4-card-title"/>
          <Paras api={api} refs={['body.11.3.1.1.1.3.1','body.11.3.1.1.1.3.2']} className="dr4-prose"/>
          <ul className="r5b-checks">{counterflow.map(c=><Check key={c} api={api} r={`body.${c}.1`}/>)}</ul>
        </article>
        <article className="r5b-type-card">
          <Src api={api} r="body.11.5.1.1.1.1.1" as="h2" className="dr4-card-title"/>
          <Paras api={api} refs={['body.11.5.1.1.1.3.1']} className="dr4-prose"/>
          <ul className="r5b-checks">{crossflow.map(c=><Check key={c} api={api} r={`body.${c}.1`}/>)}</ul>
        </article>
      </div>
    </Section>
    <Section>
      <div className="r5b-stack">
        <Kicker api={api} r="body.13.1.1"/>
        <Src api={api} r="body.13.3.1" as="h2" className="dr4-h2"/>
        <Src api={api} r="body.13.5.1" className="dr4-prose"/>
        <figure className="r5b-diagram"><img className="r5b-diagram-img" src={draft.variants[0]!.src} srcSet={draft.variants.map(v=>`${v.src} ${v.w}w`).join(', ')} sizes="(min-width: 1060px) 1020px, calc(100vw - 32px)" width={draft.variants[0]!.w} height={draft.variants[0]!.h} alt={draft.alt} loading="lazy" decoding="async" data-r4-media="ct.cutaway" data-source-sha256={draft.source.sha256}/></figure>
      </div>
    </Section>
    <Section>
      <Split media={<R4Img media={r5bMedia('ct.draft')} slot="ct.draft" className="r5b-render" sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"/>} reverse>
        <Kicker api={api} r="body.15.1.1"/>
        <Src api={api} r="body.15.3.1" as="h2" className="dr4-h2"/>
        <Src api={api} r="body.15.5.1" className="dr4-prose"/>
      </Split>
    </Section>
    <Section>
      <Kicker api={api} r="body.17.1.1.1.1.1"/>
      <Src api={api} r="body.17.1.1.1.3.1" as="h2" className="dr4-h2"/>
      <Src api={api} r="body.17.1.1.1.5.1" className="dr4-prose"/>
      <div className="r5b-materials">{materials.map(m=><article key={m.key} className="r5b-type-card">
        <Src api={api} r={`body.${m.h}`} as="h2" className="dr4-card-title"/>
        <Src api={api} r={`body.${m.p}`} className="dr4-prose"/>
        <ul className="r5b-checks">{m.li.map(l=><Check key={l} api={api} r={`body.${l}`}/>)}</ul>
      </article>)}</div>
    </Section>
    <section className="dr4-cta-band r5b-band" aria-label="Water treatment">
      <R4Img media={r5bMedia('ct.band')} slot="ct.band" className="dr4-cta-img" sizes="(min-width: 1300px) 1260px, calc(100vw - 32px)" alt=""/>
      <div className="dr4-cta-body">
        <Src api={api} r="body.19.1.1.1.1.1.0.0" as="p" className="dr4-h2 dr4-h2--on-navy"/>
        <Src api={api} r="body.19.1.1.1.1.1.0.1" as="p" className="dr4-prose dr4-prose--on-navy"/>
        <div className="dr4-actions">{api.quote('closing-quote','Get a Cooling Tower Quote','white')}</div>
      </div>
    </section>
  </>
}

const disasterRecovery:Builder=(api,path)=>{
  const after=r5bMedia('dr.after')
  return <>
    <Hero api={api} slot="dr.hero" h1="body.1.1.1.1.1" lead={['body.1.1.1.3.1','body.1.1.1.5.1']} path={path}/>
    <Section id="service-overview">
      <StepList items={[
        {key:'power',head:<Src api={api} r="body.3.1.1.1.1.1.1" as="h2" className="dr4-card-title"/>,body:<Src api={api} r="body.3.1.1.1.1.3.1" className="dr4-card-body"/>},
        {key:'staged',head:<Src api={api} r="body.3.1.1.1.3.3.1.1" as="h2" className="dr4-card-title"/>,body:<Src api={api} r="body.3.1.1.1.3.3.3.1" className="dr4-card-body"/>},
        {key:'assess',head:<Src api={api} r="body.3.1.1.3.1.1.1" as="h2" className="dr4-card-title"/>,body:<Src api={api} r="body.3.1.1.3.1.3.1" className="dr4-card-body"/>},
      ]}/>
      <figure className="r5b-figure r5b-figure--wide"><R4Img media={after} slot="dr.after" className="dr4-photo dr4-photo--4x3" sizes="(min-width: 1024px) 920px, calc(100vw - 32px)"/><figcaption className="dr4-caption">{api.inner('body.3.1.1.1.3.1.1.1')}</figcaption><Src api={api} r="body.3.1.1.1.3.1.3.1" className="dr4-prose r5b-figure-text"/></figure>
    </Section>
    <Section>
      <Src api={api} r="body.5.1.1" as="h2" className="dr4-h2"/>
      <CardGrid columns={3} items={[
        {key:'matters',head:<Src api={api} r="body.5.3.1.1.1.1" as="h2" className="dr4-card-title"/>,body:<Src api={api} r="body.5.3.1.1.3.1" className="dr4-card-body"/>},
        {key:'leyte',navy:true,head:<Src api={api} r="body.5.3.1.3.1.1" as="h2" className="dr4-card-title"/>,body:<Src api={api} r="body.5.3.1.3.3.1" className="dr4-card-body"/>},
        {key:'hour',head:<Src api={api} r="body.5.3.1.5.1.1" as="h2" className="dr4-card-title"/>,body:<Paras api={api} refs={['body.5.3.1.5.3.1','body.5.3.1.5.3.2','body.5.3.1.5.3.3']} className="dr4-card-body"/>,foot:<div className="dr4-actions">{api.action('body.5.3.1.5.5.1','blue')}</div>},
      ]}/>
    </Section>
    <Section className="r5b-closing">
      <NavyPanel className="r5b-closing-panel">
        <Src api={api} r="body.7.1.1.1.1" as="h2" className="dr4-h2 dr4-h2--on-navy"/>
        <Src api={api} r="body.7.1.1.3.1" className="dr4-prose dr4-prose--on-navy"/>
        <div className="dr4-actions">{api.quote('closing-quote','Contact ICS Today','white')}</div>
      </NavyPanel>
    </Section>
  </>
}

export const r5bBuilders:Record<string,Builder>={'SALMON-pages-1230':coolingTower,'SALMON-pages-1534':disasterRecovery}
