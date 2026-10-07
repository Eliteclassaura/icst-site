/**
 * Design R3 (CT approval 2026-10-06): the owner's Contact design (Figma HyH4ognJmJfSxxezLish01, desktop 3:2, mobile 3:304)
 * for /contact-us/, with the Design Director's visual direction. Copy is data (content/design/page-copy.json, OGCS review
 * bdc9a49b); offices and numbers come from the owner contact authority (./contact); photos are verified ICS originals
 * (./design-r3-media). The native inline RFQ form sits in "How to request a quote" (R-a: it replaces that column's button);
 * every other "Request a Quote" opens the native RFQ with this page's context.
 */
import type {ReactNode} from 'react'
import type {CohortPage} from './cohort'
import {contactOffices} from './contact'
import {pageCopy} from './page-copy'
import {RfqMount} from './RfqMount'
import {designR3Media} from './design-r3-media'
import {R3CaptionedPhoto,R3Photo} from './AboutComposition'
import {nativeIntakeOn} from '../rfq-native/server'
import {NativeRfqFormSection} from '../rfq-native/NativeRfqForm'

export function ContactComposition({title,page,routePath}:{title:ReactNode;page:CohortPage|null;routePath:string}){
  const copy=pageCopy().contact
  return <main className="luxury-site dr3 dr3-contact" id="main" data-salmon-region="body" data-design="DESIGN_R3">
    <section className="dr3-contact-hero">
      <R3Photo media={designR3Media('contact.hero')} className="dr3-contact-hero-photo" eager sizes="100vw"/>
      <div className="dr3-contact-hero-inner">
        <div className="dr3-contact-title">{title}</div>
        <p className="dr3-contact-lead">{copy.heroLead}</p>
      </div>
      <div className="dr3-phone-strip">
        {contactOffices.map(office=><a key={office.officeKey} href={office.telephoneHref}><span>{office.displayLabel}</span><strong>{office.telephoneDisplay}</strong></a>)}
        <span className="dr3-phone-strip-quote"><RfqMount mountId="rfq_page" routePath={routePath}/></span>
      </div>
    </section>

    <div className="dr3-contact-intro">
      {copy.eyebrow?<span className="dr3-chip-label">{copy.eyebrow}</span>:null}
      <h2 id="dr3-contact-intro-heading">{copy.heading}</h2>
      <p>{copy.lead}</p>
      <span className="dr3-progress" aria-hidden="true"><span/><span/><span/></span>
    </div>

    <section className="dr3-section dr3-start" id="how-to-request" aria-labelledby="dr3-start-title" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
      <div className="dr3-start-copy">
        <span className="dr3-chip-label">{copy.requestChip}</span>
        <h2 id="dr3-start-title">{copy.requestTitle}</h2>
        <p>{copy.requestBody}</p>
        {nativeIntakeOn()?<NativeRfqFormSection/>:page?<div className="client-rfq figma-contact-action dr3-start-fallback"><RfqMount mountId="rfq_page" page={page}/></div>:null}
      </div>
      <div className="dr3-send">
        <h3 id="dr3-send-heading">{copy.sendHeading}</h3>
        {/* LEGAL-FIX-1 (axe scrollable-region-focusable): a phone scrolls this list sideways, so it is a named, focusable region */}
        <div className="dr3-send-track" role="region" aria-labelledby="dr3-send-heading" tabIndex={0}><ol className="dr3-send-cards">{copy.send.map((item,i)=><li key={item.media} className="dr3-send-card">
          <span className="dr3-send-photo"><R3Photo media={designR3Media(item.media)}/><span className="dr3-send-index" aria-hidden="true">{String(i+1).padStart(2,'0')}</span></span>
          <p>{item.text}</p>
        </li>)}</ol></div>
      </div>
    </section>

    <section className="dr3-section dr3-offices" id="offices" aria-labelledby="dr3-offices-title" data-owner-override="OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21">
      <div className="dr3-offices-head">
        <div><span className="dr3-chip-label">{copy.officesChip}</span><h2 id="dr3-offices-title">{copy.officesHeading}</h2></div>
        {copy.officesNote?<p>{copy.officesNote}</p>:null}
      </div>
      <ul className="dr3-contact-offices">{contactOffices.map(office=>{
        const subtitle=copy.officeSubtitles[office.officeKey]
        return <li key={office.officeKey} className="dr3-contact-office" data-office={office.officeKey}>
          <div className="dr3-office-title">
            <div><h3>{copy.officeTitles[office.officeKey]??office.displayLabel}</h3>{subtitle?<p className="dr3-office-subtitle">{subtitle}</p>:null}</div>
            <span className="dr3-badge-pill">{copy.officeBadges[office.officeKey]}</span>
          </div>
          <R3CaptionedPhoto slot={`contact.office.${office.officeKey}`} className="dr3-office-photo"/>
          <address data-office={office.officeKey}>
            {office.company?<span>{office.company}</span>:null}
            {office.addressLines.map(line=><span key={line}>{line}</span>)}
            {office.addressLines.length?<span>{office.city}{office.region?`, ${office.region}`:''}{office.postalCode?` ${office.postalCode}`:''}</span>:null}
            {office.addressLines.length?<span>{office.countryName}</span>:null}
            <a className="dr3-phone-pill" href={office.telephoneHref}>{office.addressLines.length===0?copy.phoneOnlyPrefix:''}{office.telephoneDisplay}<span aria-hidden="true">↗</span></a>
          </address>
        </li>})}</ul>
    </section>
  </main>
}
