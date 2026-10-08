/**
 * The 404 page (owner + CT 2026-10-07; QA pre-pass S2; copy OGCS fe4feb16 / SEO DEEP R1 addendum). It keeps the HTTP 404
 * status (Next's not-found boundary) and tells crawlers not to index it. Site header and footer, a calm R4 hero, the four
 * ruled links, the parts search the hub already uses, and a quote pill to the native form's Contact fallback (the RFQ mount
 * itself is gated off non-public routes). Every visible word is OGCS's or an existing site label.
 */
import type {Metadata} from 'next'
import {LuxuryFooter,LuxuryHeader} from '../../site/LuxuryShell'

export const metadata:Metadata={title:{absolute:'Page Not Found - ICS'},robots:{index:false,follow:true}}

const LINKS=[
  {href:'/',label:'Home'},
  {href:'/cooling-tower-parts-online/',label:'Cooling Tower Parts'},
  {href:'/cooling-tower-maintenance-repair-upgrade/',label:'Services'},
  {href:'/contact-us/',label:'Contact Us'},
] as const

const NotFound = () => (
  <div className="luxury-site r5-site nf-site">
    <LuxuryHeader/>
    <main id="main" className="nf-main">
      <div className="dr4 nf" data-r4-route="/404/">
        <section className="nf-hero" aria-labelledby="nf-title">
          <h1 id="nf-title" className="nf-title">Page not found</h1>
          <p className="nf-lead">The page you’re looking for may have moved or no longer exists.</p>
          <div className="dr4-actions nf-actions">
            <a className="dr4-btn dr4-btn--white" href="/contact-us/#request-a-quote">Request a Quote</a>
          </div>
        </section>
        <nav className="nf-links" aria-label="Main sections">
          <ul>{LINKS.map(link=><li key={link.href}><a href={link.href}><span>{link.label}</span><span className="nf-arrow" aria-hidden="true">→</span></a></li>)}</ul>
        </nav>
        <form action="/cooling-tower-parts-online/" method="get" role="search" className="wave3-search nf-search">
          <label htmlFor="nf-query">Search cooling tower parts</label>
          <div><input id="nf-query" type="search" name="q" maxLength={100} placeholder="Search parts by name or description"/><button type="submit">Search</button></div>
        </form>
      </div>
    </main>
    <LuxuryFooter/>
  </div>
)

export default NotFound
