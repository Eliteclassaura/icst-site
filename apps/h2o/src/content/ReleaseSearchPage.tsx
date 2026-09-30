import {LuxuryHeader,LuxuryFooter} from '../site/LuxuryShell'
import {RuntimeSearchController} from './RuntimeSearchController'

/** The exact published route this page serves; the RFQ context uses it verbatim as `page_path`. */
export const SEARCH_ROUTE_PATH = '/search/'

/**
 * Payload runtime search page: the accepted public release search (release/templates/search.tsx), apart from
 * import paths and one closed gap. It queries the publishing-driven Pagefind index served at /pagefind/ (see
 * src/content/search-index.ts).
 *
 * RFQ gap closure (Control Tower 2026-09-29): `/search/` is PUBLIC, export=true, indexable=false in the
 * published ledger, so it is an eligible quote surface; noindex is not a reason to omit conversion controls.
 * The accepted template rendered the shared header/footer without route context, so the header and footer
 * quote controls never mounted there (887/888). Here the shell gets the real route: the approved adapter
 * mounts `header_action` (desktop + mobile menu) and `footer_rfq_band` through the same public-release gate
 * as every other English route, with only `page_path` and `cta_placement` in the context — no product or
 * query context (the search term is visitor input and never travels). The ordinary Contact links (footer,
 * no-result alternatives) are unchanged, and the gate's `/contact-us/` fallback still applies.
 *
 * R1B: the client script is public/runtime-search.js, pinned to the request's search generation
 * (`data-search-generation`), with withdrawn results dropped.
 */
export function ReleaseSearchPage({searchGeneration}:{searchGeneration?:string|null}={}){
  return <div className="luxury-site"><LuxuryHeader routePath={SEARCH_ROUTE_PATH}/><main className="lux-search-page ics-search" id="main" data-pagefind-ignore data-search-generation={searchGeneration??undefined}>
    <header className="ics-search-header"><h1>Search ICS</h1><p>Find cooling towers, services, parts and technical resources.</p></header>
    <form className="ics-search-form" action="/search/" role="search">
      <label htmlFor="lux-query">Search the ICS website</label>
      <div className="ics-search-field"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="lux-query" name="q" type="search" placeholder="Try cooling tower, gearbox or maintenance" required maxLength={200}/><button type="submit">Search</button></div>
    </form>
    <div className="ics-search-body"><section aria-label="Search results"><p id="release-search-status" role="status" aria-live="polite">Enter a term to search the site.</p><ol id="release-search-results"/><div id="release-search-empty" className="ics-search-empty" hidden><h2>No matching pages</h2><p id="release-search-empty-query"/><p>Check the spelling or try a broader equipment or service term. You can also browse the sections below.</p><nav aria-label="No-result alternatives"><a href="/cooling-tower-parts-online/">Browse parts</a><a href="/resources/">Browse resources</a><a href="/contact-us/">Contact ICS</a></nav></div><button id="release-search-more" className="ics-search-more" type="button" hidden>Show more results</button><noscript>Enable JavaScript to search the static index, or browse the site sections.</noscript></section>
    <aside className="ics-search-browse"><h2>Browse by section</h2><nav aria-label="Site sections"><a href="/cooling-tower/">Cooling towers</a><a href="/cooling-tower-maintenance-repair-upgrade/">Repair &amp; maintenance</a><a href="/cooling-tower-parts-online/">Cooling tower parts</a><a href="/resources/">Resources</a><a href="/cooling-tower-brochures/">Brochures</a><a href="/tech-articles/">Technical articles</a></nav></aside></div>
  </main><LuxuryFooter routePath={SEARCH_ROUTE_PATH}/><RuntimeSearchController/></div>
}
