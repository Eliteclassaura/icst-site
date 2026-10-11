/**
 * LUXURY-PLACEHOLDER-1 (CT FIX-5, 2026-10-11): PLACEHOLDER-CARDS-1 blanks the retired demo-product cards to a public-exclusion stub. The nine
 * dedicated luxury layouts address their source text by key, so the keys under a stubbed card vanish: the layout frames of those cards draw
 * nothing (like the stub) and no source lookup throws.
 */
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {LuxuryCanonical,luxuryIds} from '../LuxuryCanonical'
import {salmonDocument,salmonRoutes} from '../salmon'
import {placeholderCardCount} from '../../content/placeholder-cards'
import {r4Builders} from '../r4/R4Pages'

const routes=()=>salmonRoutes().filter(r=>luxuryIds.has(r.routeId))
/** Every route LuxuryCanonical draws: the nine luxury layouts and the Design R4 pages (their source accessors throw on a missing key). */
const drawn=()=>salmonRoutes().filter(r=>luxuryIds.has(r.routeId)||r4Builders[r.routeId])
const DEMO=/-example\/|\bABB Motor Example|Westinghouse Motor Example|Vibration Switch Example/i

describe('luxury layouts over documents without the placeholder cards',()=>{
 it('renders the nine luxury routes and the R4 pages without a missing-key throw and without a demo product',()=>{
  expect(routes()).toHaveLength(9)
  expect(drawn().length).toBeGreaterThanOrEqual(9)
  for(const r of drawn()){
   const doc=salmonDocument(r)
   expect(placeholderCardCount(doc),`${r.routeId} still holds a placeholder card`).toBe(0)
   const html=renderToStaticMarkup(<LuxuryCanonical doc={doc}/>)
   expect(html,r.routeId).not.toMatch(DEMO)
  }
 })
 it('the Parts hub (SALMON-pages-411) draws no frame, picture or label for the retired ABB demo card, and keeps the rest of its page',()=>{
  const r=routes().find(x=>x.routeId==='SALMON-pages-411')!
  const html=renderToStaticMarkup(<LuxuryCanonical doc={salmonDocument(r)}/>)
  expect(html).not.toContain('data-layout-node="100"') // the demo card's frame (picture 101, title 102, shared "Buy Now" 103)
  expect(html).not.toContain('data-layout-node="101"')
  expect(html).toContain('data-layout-node="99"')
  expect(html.length).toBeGreaterThan(20000)
 })
})
