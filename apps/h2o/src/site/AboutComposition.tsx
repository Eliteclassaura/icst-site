/**
 * Design R3 (CT approval 2026-10-06): the owner's About design (Figma CAqW9ItKIAxm7EiGO1qWat, desktop 3:3647, mobile 3:2978)
 * for /about-ics-industrial-cooling-solutions/, with the Design Director's visual direction.
 *
 * Copy is data (content/design/about-page.json, OGCS review 1625df21); photos are verified ICS originals
 * (content/design/design-r3-media.json, ./design-r3-media). The route's decided title, meta description, canonical and
 * schema come from its record through SalmonSeo, unchanged. Headings: one H1, a H2 per section, a H3 per office card.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'
import type {SalmonDocument} from './salmon'
import {SalmonSeo} from './SalmonCanonical'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {pageForSegments} from './cohort'
import {RfqMount} from './RfqMount'
import {ClientSocialLinks} from './ClientReview'
import {clientLogo,designR3Media,type DesignR3Media} from './design-r3-media'
import {DesignR3StickyBar} from './DesignR3StickyBar'

type AboutCopy={
  hero:{eyebrow:string;heading:string;lead:string;body:string;contactLabel:string;quoteLabel:string;presenceLabel:string;presencePrimary:string;presenceSecondary:string}
  clients:{label:string;items:Array<{name:string;desktop:boolean}>}
  presence:{heading:string;lead:string;body:string;contactLabel:string;offices:Array<{office:string;title:string;badge:string;chip:string;subheading:string;lead:string;body:string;media:string}>}
  team:{heading:string;lead:string;turnkey:string;turnkeyLink:string;clients:string}
  services:{heading:string;lead:string;items:string[];closing:string}
  commitment:{lines:string[];lead:string;body:string;badge:string;band:string;bandLink:string}
}
let cache:AboutCopy|undefined
export const aboutCopy=():AboutCopy=>cache??=JSON.parse(readFileSync(path.join(process.cwd(),'content/design/about-page.json'),'utf8')) as AboutCopy

export const ABOUT_ROUTE_ID='SALMON-pages-1931'
const CONTACT='/contact-us/'

/** A verified photo at its own dimensions (never displayed wider than its native width; CSS crops with object-fit). */
export function R3Photo({media,className,eager=false,sizes}:{media:DesignR3Media;className?:string;eager?:boolean;sizes?:string}){
  const srcSet=(media as DesignR3Media&{srcset?:Array<{src:string;width:number}>}).srcset?.map(s=>`${s.src} ${s.width}w`).join(', ')
  return <img className={className} src={media.src} srcSet={srcSet} sizes={srcSet?sizes:undefined} width={media.width} height={media.height} alt={media.alt}
    loading={eager?'eager':'lazy'} decoding={eager?undefined:'async'} fetchPriority={eager?'high':undefined} data-media-sha256={media.sha256}/>
}
/** An office card photo with its honest caption: the project it shows, never the office building (D1). */
export function R3CaptionedPhoto({slot,className}:{slot:string;className?:string}){
  const media=designR3Media(slot)
  return <figure className={className}><R3Photo media={media}/>{media.caption?<figcaption>{media.caption}</figcaption>:null}</figure>
}

export function AboutComposition({doc}:{doc:SalmonDocument}){
  const copy=aboutCopy()
  const page=pageForSegments(doc.targetPath.split('/').filter(Boolean))
  const offices=copy.presence.offices
  return <div className="luxury-site dr3 dr3-about" data-salmon-document={doc.routeId} data-salmon-source-sha256={doc.sourceIdentity.sha256} data-design="DESIGN_R3">
    <SalmonSeo doc={doc}/>
    <LuxuryHeader page={page} routePath={doc.targetPath}/>
    <main id="main" className="dr3-main">
      <section className="dr3-about-hero" aria-labelledby="dr3-about-title">
        <R3Photo media={designR3Media('about.hero')} className="dr3-about-hero-photo" eager/>
        <div className="dr3-about-hero-inner">
          <ol className="dr3-rail" aria-hidden="true"><li className="is-current">1</li><li>2</li><li>3</li></ol>
          <div className="dr3-about-hero-copy">
            <p className="dr3-eyebrow">{copy.hero.eyebrow}</p>
            <h1 id="dr3-about-title">{copy.hero.heading}</h1>
            <p className="dr3-lead">{copy.hero.lead}</p>
            <p>{copy.hero.body}</p>
            <div className="dr3-actions">
              <a className="dr3-button" href={CONTACT}>{copy.hero.contactLabel}</a>
              <span className="dr3-quote-circle"><RfqMount mountId="rfq_page" routePath={doc.targetPath} label={copy.hero.quoteLabel}/></span>
            </div>
          </div>
        </div>
        <div className="dr3-presence-card">
          <a href="#global-presence" className="dr3-presence-link">{copy.hero.presenceLabel}<span aria-hidden="true">→</span></a>
          <div className="dr3-presence-places">
            <span className="dr3-avatars" aria-hidden="true">{offices.map(o=>{const m=designR3Media(o.media);return <img key={o.office} src={m.src} width={m.width} height={m.height} alt="" loading="lazy" decoding="async"/>})}</span>
            <span><strong>{copy.hero.presencePrimary}</strong><span>{copy.hero.presenceSecondary}</span></span>
          </div>
        </div>
      </section>

      <div className="dr3-strip">
        <ClientSocialLinks compact/>
        <div className="dr3-clients" role="region" aria-label={copy.clients.label} tabIndex={0}>
          <ul>{copy.clients.items.map(client=>{const logo=clientLogo(client.name);return <li key={client.name} className={client.desktop?undefined:'dr3-client-extra'}>
            {logo?<img src={logo.src} width={logo.width} height={logo.height} alt={client.name} loading="lazy" decoding="async"/>:<span className="dr3-wordmark">{client.name}</span>}
          </li>})}</ul>
        </div>
      </div>

      <section className="dr3-section dr3-presence" id="global-presence" aria-labelledby="dr3-presence-title">
        <div className="dr3-section-head">
          <div>
            <h2 id="dr3-presence-title">{copy.presence.heading}</h2>
            <p>{copy.presence.lead}</p>
            <p>{copy.presence.body}</p>
          </div>
          <a className="dr3-arrow-link" href={CONTACT}>{copy.presence.contactLabel}<span aria-hidden="true">→</span></a>
        </div>
        <div className="dr3-office-track" role="region" aria-label={copy.presence.heading} tabIndex={0}>
          <ul className="dr3-office-cards">{offices.map(o=><li key={o.office} className="dr3-office-card" data-office={o.office}>
            <R3CaptionedPhoto slot={o.media} className="dr3-office-photo"/>
            <div className="dr3-office-title"><h3>{o.title}</h3><span className="dr3-chip">{o.chip}</span></div>
            <p className="dr3-badge">{o.badge}</p>
            <div className="dr3-office-text"><p className="dr3-office-subheading">{o.subheading}</p><p>{o.lead}</p><p>{o.body}</p></div>
          </li>)}</ul>
        </div>
      </section>

      <section className="dr3-section dr3-team" aria-labelledby="dr3-team-title">
        <div className="dr3-section-head dr3-centered"><h2 id="dr3-team-title">{copy.team.heading}</h2><p>{copy.team.lead}</p></div>
        <ul className="dr3-team-cards">
          <li className="dr3-team-card"><span className="dr3-index" aria-hidden="true">01</span><R3Photo media={designR3Media('about.team.installation')}/></li>
          <li className="dr3-team-card dr3-team-card--accent"><span className="dr3-index" aria-hidden="true">02</span><p>{copy.team.turnkey}</p><a href={CONTACT}>{copy.team.turnkeyLink}<span aria-hidden="true"> →</span></a></li>
          <li className="dr3-team-card"><span className="dr3-index" aria-hidden="true">03</span><p>{copy.team.clients}</p></li>
        </ul>
      </section>

      <section className="dr3-section dr3-services" aria-labelledby="dr3-services-title">
        <div className="dr3-services-copy">
          <h2 id="dr3-services-title">{copy.services.heading}</h2>
          <p>{copy.services.lead}</p>
          <ol className="dr3-service-list">{copy.services.items.map((item,i)=><li key={item}><span aria-hidden="true">{String(i+1).padStart(2,'0')}</span>{item}</li>)}</ol>
          <p className="dr3-closing">{copy.services.closing}</p>
        </div>
        <R3Photo media={designR3Media('about.whatWeDo')} className="dr3-services-photo"/>
      </section>

      <section className="dr3-section dr3-commitment" aria-labelledby="dr3-commitment-title">
        <div className="dr3-commitment-media">
          <R3Photo media={designR3Media('about.commitment')}/>
          <p className="dr3-badge-plate"><strong>ICS</strong><span>{copy.commitment.badge}</span></p>
        </div>
        <div className="dr3-commitment-copy">
          <h2 id="dr3-commitment-title" className="dr3-display">{copy.commitment.lines.map((line,i)=><span key={line} className={i===copy.commitment.lines.length-1?'is-accent':undefined}>{i?' ':''}{line}</span>)}</h2>
          <p className="dr3-commitment-lead">{copy.commitment.lead}</p>
          <p className="dr3-commitment-body">{copy.commitment.body}</p>
          <a className="dr3-band" href={CONTACT}>
            <R3Photo media={designR3Media('about.ctaBand')} className="dr3-band-photo"/>
            <span className="dr3-band-text">{copy.commitment.band}</span>
            <strong className="dr3-band-link">{copy.commitment.bandLink}<span aria-hidden="true"> →</span></strong>
          </a>
        </div>
      </section>
    </main>
    <LuxuryFooter page={page} routePath={doc.targetPath}/>
    <DesignR3StickyBar routePath={doc.targetPath}/>
  </div>
}
