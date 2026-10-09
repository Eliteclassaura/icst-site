import {R5Chips} from './r5/R5Parts'
import {FAN_MENU_LINKS} from './moore-fans'

/**
 * CLIENT-FIX-1 / CATALOG-FANS-1: the brand tiles on the two fan listings: every fan brand and family in the catalog (derived data, see
 * ops/catalog/build-fan-menu.mjs) followed by the Moore Fans pages. The same list as the header Parts > Fans menu.
 */
export function MooreFansCard({path}:{path:string}){
  return <section className="dr4-section r5-moore" aria-labelledby="fan-brands-title" data-moore-fans-card data-fan-brands>
    <h2 id="fan-brands-title" className="dr4-h2">Fans by brand</h2>
    <R5Chips items={FAN_MENU_LINKS.map(([label,href])=>({href,label}))} current={path} label="Fan brands and families"/>
  </section>
}
