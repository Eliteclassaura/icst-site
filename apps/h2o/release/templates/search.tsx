import type {Metadata} from 'next'
import {LuxuryHeader,LuxuryFooter} from '../../../site/LuxuryShell'
import {StaticSearchController} from '../../../site/StaticSearchController'
export const metadata:Metadata={title:'Search ICS',alternates:{canonical:'https://h2ocooling.com/search/'},robots:{index:false,follow:true}}
export default function SearchPage(){
  return <div className="luxury-site"><LuxuryHeader/><main className="lux-search-page ics-search" id="main" data-pagefind-ignore>
    <header className="ics-search-header"><h1>Search ICS</h1><p>Find cooling towers, services, parts and technical resources.</p></header>
    <form className="ics-search-form" action="/search/" role="search">
      <label htmlFor="lux-query">Search the ICS website</label>
      <div className="ics-search-field"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="lux-query" name="q" type="search" placeholder="Try cooling tower, gearbox or maintenance" required maxLength={200}/><button type="submit">Search</button></div>
    </form>
    <div className="ics-search-body"><section aria-label="Search results"><p id="release-search-status" role="status" aria-live="polite">Enter a term to search the site.</p><ol id="release-search-results"/><div id="release-search-empty" className="ics-search-empty" hidden><h2>No matching pages</h2><p id="release-search-empty-query"/><p>Check the spelling or try a broader equipment or service term. You can also browse the sections below.</p><nav aria-label="No-result alternatives"><a href="/cooling-tower-parts-online/">Browse parts</a><a href="/resources/">Browse resources</a><a href="/contact-us/">Contact ICS</a></nav></div><button id="release-search-more" className="ics-search-more" type="button" hidden>Show more results</button><noscript>Enable JavaScript to search the static index, or browse the site sections.</noscript></section>
    <aside className="ics-search-browse"><h2>Browse by section</h2><nav aria-label="Site sections"><a href="/cooling-tower/">Cooling towers</a><a href="/cooling-tower-maintenance-repair-upgrade/">Repair &amp; maintenance</a><a href="/cooling-tower-parts-online/">Cooling tower parts</a><a href="/resources/">Resources</a><a href="/cooling-tower-brochures/">Brochures</a><a href="/tech-articles/">Technical articles</a></nav></aside></div>
  </main><LuxuryFooter/><StaticSearchController/></div>
}
