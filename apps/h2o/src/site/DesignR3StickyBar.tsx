/**
 * Design R3 (CT rulings 6 and R-b, 2026-10-06): the mobile action bar of the About and Contact designs, below 768 px only.
 * ✆ goes to the Offices section on /contact-us/ (an in-page anchor there); "Request a Quote" opens the native RFQ with the
 * page's context. The page reserves the bar's height (and the safe-area inset) at its end, and the corner launcher sits above it.
 */
import {RfqMount} from './RfqMount'
import {pageCopy} from './page-copy'

export function DesignR3StickyBar({routePath}:{routePath:string}){
  const copy=pageCopy().contact
  return <div className="dr3-sticky" data-design-r3-sticky="">
    <a className="dr3-sticky-call" href={routePath==='/contact-us/'?'#offices':'/contact-us/#offices'} aria-label={copy.callLabel}><svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.8 2z"/></svg></a>
    <span className="dr3-sticky-quote"><RfqMount mountId="header_action" routePath={routePath}/></span>
  </div>
}
