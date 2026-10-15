import type {ReactNode} from 'react'
import {CTABand,CardGrid,ChipGrid,Eyebrow,Facts,Figure,HeldImg,NavyPanel,Paras,PhotoCardTrio,R4Hero,R4Img,Section,Split,Src,StepList,type R4Api} from './R4System'
import {R4Tabs} from './R4Tabs'
import {r4Copy,r4Media,r4Reuse} from '../design-r4-media'
import {englishServicePages} from '../EnglishServices'
import {heroActionFor} from '../hero-actions'
import {r5bBuilders} from '../r5b/R5bPages'
import {drySodaRankingApi,DRY_SODA_RANKING_ROUTE_ID} from '../dry-soda-ranking-r4'

/**
 * Design R4 page compositions (CT GO 2026-10-07; DD specs H2O_DESIGN_R4_SPEC_<page>.md). Each composition lays the page's
 * own source text (by source key) into the shared R4 system. Headings keep their staging tag (the outline is unchanged);
 * routes, titles, H1s and metas are untouched. Section order follows the owner's Figma.
 */
type Builder=(api:R4Api,path:string)=>ReactNode
const eyebrows=(path:string)=>r4Copy().eyebrows[path]??{}

/** The hero actions: the quote action (white pill) and "Explore the service" (ghost), from content/design/hero-actions.json. */
function heroActions(api:R4Api,path:string,secondary?:ReactNode){
  const action=heroActionFor(path)
  return <>{api.quote('hero-primary',action?.label??'Request a Quote','white','quote')}{secondary??(action?.secondary?.href?<a className="dr4-btn dr4-btn--ghost" href={action.secondary.href} data-hero-action="secondary">{action.secondary.label}</a>:null)}</>
}

const repair:Builder=(api,path)=>{
  const e=eyebrows(path)
  const types=[1,3,5,7,9,11]
  const typeBody=['body.5.3.1.1.3.1.0','body.5.3.1.3.3.1.0','body.5.3.1.5.3.1','body.5.3.1.7.3.1','body.5.3.1.9.3.1.0','body.5.3.1.11.3.1.0']
  const destinations=englishServicePages()
  return <>
    <R4Hero api={api} slot="repair.hero" eyebrowRef="body.1.1.3.1.0.0" h1="body.1.1.1.1" lead="body.1.1.3.2.0" actions={heroActions(api,path)}/>
    <Section id="service-overview" className="dr4-section--overview">
      <Split media={<R4Img slot="repair.overview" className="dr4-photo dr4-photo--4x3" sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"/>}>
        <Eyebrow label={e.overview!}/>
        <Src api={api} r="body.3.1.1.1.1" as="h2" className="dr4-h2"/>
        <Paras api={api} refs={['body.3.1.1.3.1.0','body.3.1.1.3.2.0.0','body.3.1.1.5.1']} className="dr4-prose"/>
      </Split>
    </Section>
    <Section className="dr4-section--types">
      <Eyebrow label={e.types!}/>
      <Src api={api} r="body.5.1.1.1.1" as="h2" className="dr4-h2"/>
      <CardGrid items={types.map((n,i)=>{
        const destination=destinations[i]?.path
        if(!destination)throw new Error('Maintenance card destination missing')
        return {key:`type-${n}`,head:<Src api={api} r={`body.5.3.1.${n}.1.1`} as="h3" className="dr4-card-title"/>,body:<Src api={api} r={typeBody[i]!} className="dr4-card-body"/>,foot:<a className="dr4-card-link" href={destination}>View More <span aria-hidden="true">↗</span></a>}
      })}/>
    </Section>
    <Section className="dr4-section--repairs">
      <NavyPanel>
        <Eyebrow label={e.repairs!} tone="dark"/>
        <Src api={api} r="body.7.1.1.1.1" as="h2" className="dr4-h2 dr4-h2--on-navy"/>
        <R4Tabs label="Cooling tower repairs and upgrades" headingTag={api.tag('body.7.1.1.3.1.1.1.3.1')} items={[1,3,5,7,9,11,13,15].map(n=>({
          key:`repair-${n}`,title:api.inner(`body.7.1.1.3.${n}.1.1.3.1`),body:<Src api={api} r={`body.7.1.1.3.${n}.1.1.3.3`}/>,cta:api.quote(`repairs-${n}`,'Request a Quote','navy-ghost'),
        }))}/>
      </NavyPanel>
    </Section>
    <Section className="dr4-section--upgrade">
      <Split media={<R4Img slot="repair.louvers" className="dr4-photo dr4-photo--4x5" sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"/>} className="dr4-split--navy-text">
        <Src api={api} r="body.9.1.1.1.1" as="h2" className="dr4-h2 dr4-h2--on-navy"/>
        <Paras api={api} refs={['body.9.1.1.3.1.0','body.9.1.1.3.2.0']} className="dr4-prose dr4-prose--on-navy"/>
        <div className="dr4-actions">{api.action('body.9.1.1.5.1.1.1','white')}</div>
      </Split>
    </Section>
    <Section className="dr4-section--maintenance">
      <div className="dr4-intro-row">
        <div><Eyebrow label={e.maintenance!}/><Src api={api} r="body.11.1.1" as="h2" className="dr4-h2"/></div>
        <Src api={api} r="body.11.3.1.0" className="dr4-lead"/>
      </div>
      <ChipGrid items={[1,3,5,7].map(n=>({key:`chip-${n}`,label:api.inner(`body.11.7.1.1.${n}.1.3.1`)}))}/>
    </Section>
    <Section className="dr4-section--running">
      <Split media={<R4Img slot="repair.technicians" className="dr4-photo dr4-photo--5x4" sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"/>}>
        <Src api={api} r="body.11.5.1.1.3.1" as="h2" className="dr4-h2"/>
        <Paras api={api} refs={['body.11.5.1.1.5.1.0','body.11.5.1.1.5.2.0']} className="dr4-prose"/>
      </Split>
    </Section>
    <CTABand slot="repair.cta">
      <Src api={api} r="body.11.5.1.1.7.1" as="h2" className="dr4-cta-title"/>
      <Src api={api} r="body.11.5.1.1.9.1.0" className="dr4-cta-lead"/>
      <div className="dr4-actions dr4-actions--center">{api.action('body.1.1.5.1.1.1','white')}</div>
    </CTABand>
  </>
}

const thermal:Builder=(api,path)=>{
  const e=eyebrows(path)
  const signs=[0,1,2,3,4]
  const scope=[0,1,2,3,4]
  return <>
    <R4Hero api={api} slot="thermal.hero" eyebrow={e.hero} h1="body.1.1.1.1.1" lead="body.1.1.1.3.1" actions={heroActions(api,path)}/>
    <Section id="service-overview" className="dr4-section--problem">
      <div className="dr4-intro-row">
        <div><Eyebrow label={e.problem!}/><Src api={api} r="body.3.1.1.1.1.1" as="h2" className="dr4-h2"/></div>
        <Src api={api} r="body.3.1.1.1.3.1.0" className="dr4-lead"/>
      </div>
      <Split reverse media={<R4Img slot="thermal.problem" className="dr4-photo dr4-photo--16x10" sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"/>}>
        <div className="dr4-stack">
          <div className="dr4-panel"><Src api={api} r="body.3.1.1.1.3.2.0"/></div>
          <div className="dr4-panel dr4-panel--navy"><Src api={api} r="body.3.1.1.1.3.3.0"/></div>
        </div>
      </Split>
    </Section>
    <Section className="dr4-section--signs">
      <div className="dr4-aside-grid">
        <div className="dr4-aside">
          <Eyebrow label={e.signs!}/>
          <Src api={api} r="body.3.1.1.1.3.4.0" as="h3" className="dr4-h2 dr4-h2--sm"/>
          <div className="dr4-actions">{api.quote('signs-quote','Request a Quote','blue')}</div>
        </div>
        <CardGrid columns={2} className="dr4-cards--signs" items={signs.map(i=>({key:`sign-${i}`,head:<Src api={api} r={`body.3.1.1.1.3.5.${i}.0`} className="dr4-card-title dr4-card-title--sm"/>,wide:i===4,navy:i===4}))}/>
      </div>
    </Section>
    <Section className="dr4-section--solution">
      <Split reverse media={<R4Img slot="thermal.solution" className="dr4-photo dr4-photo--5x4" sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"/>}>
        <Eyebrow label={e.solution!}/>
        <Src api={api} r="body.5.1.1" as="h2" className="dr4-h2"/>
        <Src api={api} r="body.5.3.1.1.1.0" className="dr4-lead"/>
        <Paras api={api} refs={['body.5.3.1.1.2.0','body.5.3.1.1.3.0']} className="dr4-prose dr4-prose--ruled"/>
      </Split>
    </Section>
    <Section className="dr4-section--scope">
      <NavyPanel className="dr4-navy--split">
        <div className="dr4-aside">
          <Eyebrow label={e.scope!} tone="dark"/>
          <Src api={api} r="body.5.3.1.3.1.0" as="h3" className="dr4-h2 dr4-h2--on-navy"/>
          <div className="dr4-actions">{api.action('body.5.3.1.5.1.1.1','white')}</div>
        </div>
        <ol className="dr4-rows">{scope.map(i=><li key={i} className="dr4-row"><span className="dr4-row-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><Src api={api} r={`body.5.3.1.3.2.${i}.0`} as="span"/></li>)}</ol>
      </NavyPanel>
    </Section>
    <CTABand slot="thermal.cta">
      <Src api={api} r="body.7.1.1.1.1.1" as="h2" className="dr4-cta-title"/>
      <Src api={api} r="body.7.1.1.1.3.1.0" className="dr4-cta-lead"/>
      <div className="dr4-actions dr4-actions--center">{api.action('body.7.1.1.1.5.1.1.1','white')}</div>
    </CTABand>
  </>
}

const drysoda:Builder=(api,path)=>{
  if(path==='/dry-soda-blast-cleaning-services-2/')api=drySodaRankingApi(api)
  // The ranking LIVE URL reuses the accepted /dry-soda-blasting/ composition and its exact decorative labels/actions.
  const designPath=path==='/dry-soda-blast-cleaning-services-2/'?'/dry-soda-blasting/':path
  const e=eyebrows(designPath)
  const stat=r4Copy().statBar
  const labels=r4Copy().comparisonLabels
  const steps=[1,3,5,7,9]
  const why:[string,string][]=[['body.11.1.1.1.5.1.1.1.1.0','body.11.1.1.1.5.1.1.1.1.1'],['body.11.1.1.1.5.1.3.1.3.1','body.11.1.1.1.5.1.3.1.3.3'],['body.11.1.1.1.5.1.5.1.3.1','body.11.1.1.1.5.1.5.1.3.3'],['body.11.1.1.1.5.1.7.1.3.1','body.11.1.1.1.5.1.7.1.3.3'],['body.11.1.1.1.5.1.9.1.3.1','body.11.1.1.1.5.1.9.1.3.3']]
  const ctaMedia=r4Media('repair.overview')
  const charts=['drysoda.chart1','drysoda.chart2']
  return <>
    <R4Hero api={api} slot="drysoda.hero" eyebrow={e.hero} h1="body.1.1.1.1.1" lead="body.1.1.1.3.1.0" actions={heroActions(api,designPath,api.action('body.1.1.1.5.1.1.1','ghost'))}/>
    <Section id="service-overview" className="dr4-section--problem">
      <Split reverse media={<R4Img slot="drysoda.ache" className="dr4-photo dr4-photo--card" sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"/>}>
        <Eyebrow label={e.problem!}/>
        <Src api={api} r="body.3.1.1.1.1.1" as="h2" className="dr4-h2"/>
        <Paras api={api} refs={['body.3.1.1.1.3.1.0','body.3.1.1.1.3.2.0','body.3.1.1.1.3.3.0']} className="dr4-prose"/>
      </Split>
      <aside className="dr4-statbar" aria-label="ACHE performance">
        <p className="dr4-stat"><strong className="dr4-stat-value">{stat.stat}</strong> <span className="dr4-stat-label">{stat.label}</span></p>
        <p className="dr4-stat-footnote">{stat.footnote}</p>
        <p className="dr4-stat-cta">{stat.ctaText}</p>
        <div className="dr4-actions">{api.quote('statbar-quote','Request a Quote','white')}</div>
      </aside>
    </Section>
    <Section className="dr4-section--solution">
      <Split reverse media={<HeldImg className="dr4-photo dr4-photo--circle" src={r4Reuse('drysoda.crane')} width={1024} height={683} alt="Crane lifting a steel frame at a cooling tower site" position="50% 40%"/>}>
        <Eyebrow label={e.solution!}/>
        <Src api={api} r="body.5.1.1.1.1.1" as="h2" className="dr4-h2"/>
        <div className="dr4-stack">{['body.5.1.1.1.3.1','body.5.1.1.1.5.1','body.5.1.1.1.5.2.0'].map(r=><div key={r} className="dr4-panel"><Src api={api} r={r}/></div>)}</div>
      </Split>
    </Section>
    <Section className="dr4-section--statement"><Src api={api} r="body.7.1.1.1.1.1" className="dr4-statement"/></Section>
    <Section className="dr4-section--process">
      <div className="dr4-aside-grid">
        <div className="dr4-aside">
          <Eyebrow label={e.process!}/>
          {api.inner("body.7.1.1.1.3.3.1.1.0")===null?null:<Src api={api} r="body.7.1.1.1.3.3.1.1.0" as="h2" className="dr4-h2"/>}
          <R4Img slot="drysoda.process" className="dr4-photo dr4-photo--3x2" sizes="(min-width: 1024px) 544px, calc(100vw - 32px)"/>
          <div className="dr4-actions">{api.action('body.7.1.1.1.3.1.11.1.1.1','blue')}</div>
        </div>
        <StepList items={steps.map(n=>({key:`step-${n}`,head:<Src api={api} r={`body.7.1.1.1.3.1.${n}.1.1.0`} as="h3" className="dr4-step-title"/>,body:<Src api={api} r={`body.7.1.1.1.3.1.${n}.1.1.1`} className="dr4-step-body"/>}))}/>
      </div>
    </Section>
    <Section className="dr4-section--results">
      <NavyPanel>
        <Eyebrow label={e.results!} tone="dark"/>
        <Src api={api} r="body.9.1.1.1.1" as="h2" className="dr4-h2 dr4-h2--on-navy"/>
        <Src api={api} r="body.9.1.1.3.1.0" className="dr4-lead dr4-lead--on-navy"/>
        <ul className="dr4-charts">{charts.map(slot=>{const m=r4Media(slot);const v=m.variants.at(-1)!;return <li key={slot}><a className="dr4-chart" href={v.src} aria-label={`${m.alt} (opens the full-size image)`}><R4Img slot={slot} className="dr4-chart-img" sizes={`(min-width: 1024px) 592px, calc(100vw - 80px)`}/></a></li>})}</ul>
      </NavyPanel>
    </Section>
    <Section className="dr4-section--why">
      <div className="dr4-intro-row">
        <div><Eyebrow label={e.why!}/><Src api={api} r="body.11.1.1.1.1.1" as="h2" className="dr4-h2"/></div>
        <Src api={api} r="body.11.1.1.1.3.1.0" className="dr4-lead"/>
      </div>
      <div className="dr4-why-grid">
        <div className="dr4-photo-card">
          <HeldImg className="dr4-photo dr4-photo--4x5" src={r4Reuse('drysoda.why')} width={1024} height={683} alt="Technician soda blasting a rusted steel column" position="45% 50%"/>
          <div className="dr4-photo-card-body"><Src api={api} r="body.11.1.1.1.5.1.11.1.0"/><div className="dr4-actions">{api.action('body.11.1.1.1.5.1.13.1.1.1','white')}</div></div>
        </div>
        <CardGrid columns={2} items={why.map(([h,b],i)=>({key:`why-${i}`,head:<Src api={api} r={h} as="h3" className="dr4-card-title dr4-card-title--sm"/>,body:<Src api={api} r={b} className="dr4-card-body"/>}))}/>
      </div>
    </Section>
    <Section className="dr4-section--comparison">
      <Eyebrow label={e.comparison!}/>
      <Src api={api} r="body.13.1.1.1.1.1" as="h2" className="dr4-h2"/>
      <ul className="dr4-compare">{['body.13.1.1.1.3.1.0','body.13.1.1.1.3.2.0','body.13.1.1.1.3.3.0'].map((r,i)=><li key={r} className={`dr4-compare-card${i===2?' dr4-compare-card--ics':''}`}>
        <p className="dr4-compare-label"><span>{labels[i]}</span>{['✕','','✓'][i]?<span className="dr4-compare-mark" aria-hidden="true">{['✕','','✓'][i]}</span>:null}</p><Src api={api} r={r}/>
      </li>)}</ul>
      <div className="dr4-compare-footer"><Src api={api} r="body.13.1.1.1.3.4.0"/>{api.action('body.13.1.1.1.5.1.1.1','blue')}</div>
    </Section>
    <section className="dr4-cta-band"><R4Img media={ctaMedia} alt="" className="dr4-cta-img" sizes="(min-width: 1300px) 1260px, calc(100vw - 32px)"/><div className="dr4-cta-body">
      <Src api={api} r="body.15.1.1.1.1" as="h2" className="dr4-cta-title"/>
      <Paras api={api} refs={['body.15.1.1.3.1.0','body.15.1.1.3.2.0']} className="dr4-cta-lead"/>
      <div className="dr4-actions dr4-actions--center">{api.action('body.15.1.1.5.1.1.1','white')}</div>
    </div></section>
  </>
}

const replacement:Builder=(api,path)=>{
  const e=eyebrows(path)
  const reasons=[1,3,5,7,9]
  const benefits=[1,3,5,7,9]
  const why=[1,3,5,7,9]
  const maintain=[1,3,5,7]
  return <>
    <R4Hero api={api} slot="replacement.hero" eyebrow={e.hero} h1="body.1.1.1.1.1" lead="body.1.1.1.3.1.0" actions={heroActions(api,path)}/>
    <Section id="service-overview" className="dr4-section--overview">
      <Split reverse media={<R4Img slot="replacement.overview" className="dr4-photo dr4-photo--4x3" sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"/>}>
        <Eyebrow label={e.overview!}/>
        <Src api={api} r="body.3.1.1.1.1.1" as="h2" className="dr4-h2"/>
        <Paras api={api} refs={['body.3.1.1.1.3.1.0','body.3.1.1.1.3.2.0','body.3.1.1.1.3.3.0']} className="dr4-prose"/>
        <div className="dr4-actions">{api.action('body.1.1.1.5.1.1.1','blue')}</div>
      </Split>
    </Section>
    <Section className="dr4-section--reasons">
      <div className="dr4-intro-row"><div><Eyebrow label={e.reasons!}/><Src api={api} r="body.5.1.1.1.1" as="h2" className="dr4-h2"/></div><Src api={api} r="body.5.1.1.3.1.0" className="dr4-lead"/></div>
      <CardGrid className="dr4-cards--sentence" items={reasons.map((n,i)=>({key:`reason-${n}`,head:<Src api={api} r={`body.5.1.1.5.1.${n}.1.1.0`} as="h3" className="dr4-card-title dr4-card-title--sm"/>,body:<Src api={api} r={`body.5.1.1.5.1.${n}.1.1.1`} className="dr4-card-body"/>,wide:i===4,navy:i===4}))}/>
      <Src api={api} r="body.5.1.1.5.1.11.1.0" className="dr4-statement dr4-statement--left"/>
    </Section>
    <Section className="dr4-section--benefits">
      <NavyPanel>
        <Eyebrow label={e.benefits!} tone="dark"/>
        <Src api={api} r="body.7.1.1.1.1" as="h2" className="dr4-h2 dr4-h2--on-navy"/>
        <Src api={api} r="body.7.1.1.3.1.0" className="dr4-lead dr4-lead--on-navy"/>
        <ol className="dr4-rows dr4-rows--2">{benefits.map((n,i)=><li key={n} className="dr4-row"><span className="dr4-row-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><div><Src api={api} r={`body.7.1.1.5.1.${n}.1.1.0`} as="h3" className="dr4-row-title"/><Src api={api} r={`body.7.1.1.5.1.${n}.1.1.1`} className="dr4-row-body"/></div></li>)}</ol>
      </NavyPanel>
    </Section>
    <Section className="dr4-section--case">
      <p className="dr4-case-label">{api.inner('body.9.1.1.0')}</p>
      <div className="dr4-case-head"><p className="dr4-fact-label">{api.inner('body.9.3.1.1.1.1.3.1.1.0')}</p><Src api={api} r="body.9.3.1.1.1.1.3.3" as="h2" className="dr4-h2"/></div>
      <Facts api={api} items={[['body.9.3.1.3.1.1.3.1.1','body.9.3.1.3.1.1.3.3'],['body.9.3.1.5.1.1.3.1.1','body.9.3.1.5.1.1.3.3'],['body.9.5.1.1.1.1.3.1.1','body.9.5.1.1.1.1.3.3'],['body.9.5.1.3.1.1.3.1.1','body.9.5.1.3.1.1.3.3'],['body.9.5.1.5.1.1.3.1.1','body.9.5.1.5.1.1.3.3']]}/>
      <div className="dr4-case-grid">
        <div className="dr4-case-text">
          <Src api={api} r="body.11.1.1.1.1" as="h2" className="dr4-fact-label dr4-case-challenge"/>
          <Src api={api} r="body.11.1.1.3.1.0" className="dr4-lead"/>
          <div className="dr4-case-points">{[1,3,5].map(n=><div key={n}><Src api={api} r={`body.11.1.1.5.1.${n}.1.1.0`} as="h3" className="dr4-card-title dr4-card-title--sm"/><Src api={api} r={`body.11.1.1.5.1.${n}.1.1.1`} className="dr4-card-body"/></div>)}</div>
          <Src api={api} r="body.11.1.1.5.1.7.1.0" className="dr4-prose dr4-prose--quote"/>
        </div>
        <Figure slot="replacement.case" className="dr4-photo dr4-photo--4x3" sizes="(min-width: 1024px) 500px, calc(100vw - 32px)"/>
      </div>
    </Section>
    <Section className="dr4-section--why">
      <div className="dr4-intro-row"><div><Eyebrow label={e.why!}/><Src api={api} r="body.13.1.1.1.1" as="h2" className="dr4-h2"/></div><Src api={api} r="body.13.1.1.3.1.0" className="dr4-lead"/></div>
      <CardGrid className="dr4-cards--sentence" items={why.map(n=>({key:`why-${n}`,head:<Src api={api} r={`body.13.1.1.5.1.${n}.1.1.0`} as="h3" className="dr4-card-title dr4-card-title--sm"/>,body:<Src api={api} r={`body.13.1.1.5.1.${n}.1.1.1`} className="dr4-card-body"/>}))}/>
    </Section>
    <Section className="dr4-section--maintain">
      <div className="dr4-intro-row"><div><Eyebrow label={e.maintain!}/><Src api={api} r="body.15.1.1.1.1" as="h2" className="dr4-h2"/></div><Src api={api} r="body.15.1.1.3.1.0" className="dr4-lead"/></div>
      <ol className="dr4-chips dr4-chips--text">{maintain.map((n,i)=><li key={n} className="dr4-chip"><span className="dr4-chip-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><Src api={api} r={`body.15.1.1.5.1.${n}.1.1.0`} as="h3" className="dr4-chip-title"/><Src api={api} r={`body.15.1.1.5.1.${n}.1.1.1`} className="dr4-card-body"/></li>)}</ol>
    </Section>
    <CTABand slot="replacement.cta">
      <Src api={api} r="body.17.1.1" as="h2" className="dr4-cta-title"/>
      <Src api={api} r="body.17.3.1.0" className="dr4-cta-lead"/>
      <div className="dr4-actions dr4-actions--center">{api.action('body.17.5.1.1.1','white')}</div>
    </CTABand>
  </>
}

const aircoolers:Builder=(api,path)=>{
  const e=eyebrows(path)
  const perf=[1,3,5]
  const held=(name:string,alt:string,w:number,h:number,cls='dr4-photo dr4-photo--card')=><HeldImg className={cls} src={`/media/derivatives/${name}.webp`} width={w} height={h} alt={alt}/>
  // Services: spec option "no photo" (5ec64613 is a near-duplicate of the Maintenance photo 0f9ba15b; no repeats within a page).
  // CT ruling 2026-10-07: the duplicate "Repair/Reconstruction" chip (body.11.1.1.1.5.1.1.5) is not built.
  const services=['1.1','1.3','1.7','1.9','3.1','3.3','3.5','3.7']
  return <>
    <R4Hero api={api} slot="aircoolers.hero" variant="split" eyebrow={e.hero} h1="body.1.1.1.1.1" lead="body.1.1.1.3.1.0" actions={heroActions(api,path)}/>
    <Section id="service-overview" className="dr4-section--overview">
      <Split reverse media={held('2d8ad1561e0dbd44df4682d530ccf80d1ba15b3d33f091368425dc60f9d12789','Industrial air cooler fan bank at a process plant',908,826)}>
        <Eyebrow label={e.overview!}/>
        <Src api={api} r="body.3.1.1.1.1.1" as="h2" className="dr4-h2"/>
        <Paras api={api} refs={['body.3.1.1.1.3.1.0','body.3.1.1.1.3.2.0','body.3.1.1.1.3.3.0']} className="dr4-prose"/>
      </Split>
    </Section>
    <Section className="dr4-section--performance">
      <div className="dr4-intro-row"><div><Eyebrow label={e.performance!}/><Src api={api} r="body.5.1.1.1.1.1" as="h2" className="dr4-h2"/></div><Src api={api} r="body.5.1.1.1.3.1.0" className="dr4-lead"/></div>
      <CardGrid activeFirst items={perf.map(n=>({key:`perf-${n}`,head:<Src api={api} r={`body.5.1.1.1.5.${n}.1.1.3.1`} as="h3" className="dr4-card-title"/>,body:<Src api={api} r={`body.5.1.1.1.5.${n}.1.1.3.3`} className="dr4-card-body"/>}))}/>
      <div className="dr4-compare-footer"><Paras api={api} refs={['body.5.1.1.1.7.1.1.1','body.5.1.1.1.7.1.3.1']} className="dr4-prose"/>{api.action('body.5.1.1.1.7.1.5.1.1.1','blue')}</div>
    </Section>
    <Section className="dr4-section--options">
      <NavyPanel>
        <Eyebrow label={e.options!} tone="dark"/>
        <Src api={api} r="body.7.1.1.1.1" as="h2" className="dr4-h2 dr4-h2--on-navy"/>
        <PhotoCardTrio items={[
          {key:'fan',media:held('c54327b18d88f2acef44e870451561a83f50b7668f526b82328acceecf1f55e6','Technician working on an air cooler fan assembly',886,806,'dr4-photo dr4-photo--16x10'),head:<Src api={api} r="body.7.3.1.1.1.1" as="h3" className="dr4-card-title"/>,checks:[1,3,5].map(n=>api.inner(`body.7.3.1.1.3.1.${n}.3`))},
          {key:'frp',media:held('e817ab8cd34b4ea46985c792889255ca528026cd64160a20babeaec499b0e9d7','Technicians fitting FRP fan blades on an air cooler',1024,931,'dr4-photo dr4-photo--16x10'),head:<Src api={api} r="body.7.5.1.1.1.1" as="h3" className="dr4-card-title"/>,checks:[1,3,5,7].map(n=>api.inner(`body.7.5.1.1.3.1.${n}.3`))},
          {key:'tube',media:held('3f951b67f51c948d8de2ca8cbc78b3fa8f1069931eff16836fb3dbe86106e6c2','Technicians at an industrial cooling equipment area',1024,931,'dr4-photo dr4-photo--16x10'),head:<Src api={api} r="body.7.7.1.1.1.1" as="h3" className="dr4-card-title"/>,checks:[1,3].map(n=>api.inner(`body.7.7.1.1.3.1.${n}.3`))},
        ]}/>
      </NavyPanel>
    </Section>
    <Section className="dr4-section--maintenance">
      <div className="dr4-aside-grid">
        <div className="dr4-aside">
          <Eyebrow label={e.maintenance!}/>
          <Src api={api} r="body.9.1.1.1.1.1.1" as="h2" className="dr4-h2"/>
          {held('0f9ba15b55e1745925caf45684429ba2d7d53a47b80c64c0b0ac26b34a18a76f','Technicians servicing an air cooler on site',1024,931,'dr4-photo dr4-photo--3x2')}
        </div>
        <div className="dr4-stack">{[1,3,5].map((n,i)=><div key={n} className={`dr4-panel${i===0?' dr4-panel--navy':''}`}><Src api={api} r={`body.9.1.1.1.1.3.${n}.1.1.3.1`} as="h3" className="dr4-card-title dr4-card-title--sm"/><Src api={api} r={`body.9.1.1.1.1.3.${n}.1.1.3.3`}/></div>)}</div>
      </div>
    </Section>
    <Section className="dr4-section--services">
      <div className="dr4-intro-row"><div><Eyebrow label={e.services!}/><Src api={api} r="body.11.1.1.1.1.1" as="h2" className="dr4-h2"/></div><Src api={api} r="body.11.1.1.1.3.1.0" className="dr4-lead"/></div>
      <ol className="dr4-chips dr4-chips--3">{services.map((k,i)=><li key={k} className="dr4-chip"><span className="dr4-chip-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><Src api={api} r={`body.11.1.1.1.5.1.${k}.1.1.0`} as="h3" className="dr4-chip-title"/></li>)}</ol>
    </Section>
    {api.restored('body-end')}
    <CTABand slot="aircoolers.cta">
      <Src api={api} r="body.13.1.1.1.1.1" as="h2" className="dr4-cta-title"/>
      <Paras api={api} refs={['body.13.1.1.1.3.1.0','body.13.1.1.1.3.1.3']} className="dr4-cta-lead"/>
      <div className="dr4-actions dr4-actions--center">{api.action('body.13.1.1.1.5.1.1.1','white')}</div>
    </CTABand>
  </>
}

export const r4Builders:Record<string,Builder>={'SALMON-pages-1446':repair,'SALMON-pages-1555':thermal,'SALMON-pages-1722':drysoda,[DRY_SODA_RANKING_ROUTE_ID]:drysoda,'SALMON-pages-1572':replacement,'SALMON-pages-1668':aircoolers,...r5bBuilders}
/** Compositions that place the page's restored body-end sections themselves (before the CTA band). */
export const r4PlacesRestored=new Set(['SALMON-pages-1668'])
