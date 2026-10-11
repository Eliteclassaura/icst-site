import {salmonDocument,publicReleaseRoutes} from './salmon'

type Kind='pages'|'articles'|'parts'|'projects'
/** OGCS team audit TA-080/081: a post-form confirmation page and a single product page are not site-directory entries; DIR-LABELS-1 (OGCS): the Brochures and Tools library pages are the pathway cards at the top of /resources/, not directory items. */
const notListed=new Set(['/thank-you/','/dyna-fab-10-height-fan-stack/','/resources/cooling-tower-brochures/','/resources/tools/'])
const regional=['/cooling-tower-japan/','/cooling-tower-construction-repair-in-singapore/','/cooling-tower-thailand/','/cooling-tower-construction-repair-in-united-states/']
const productSpecifications=['/class-1000/','/class-10000-heavy-duty-standard-chord/','/class-10000-minimum-acoustic-geometry/','/class-10000-xc/','/class-20000/','/fans/moore-fans/']

/** A bounded, source-titled route directory for legitimate pages left undiscoverable in R1. */
export function R2Discovery({kind}:{kind:Kind}){
  const routes=publicReleaseRoutes().filter(route=>kind==='articles'?route.routeId.startsWith('LIVE-posts-')&&route.targetPath!=='/hello-world-2/':kind==='pages'?(route.routeId.startsWith('LIVE-pages-')||regional.includes(route.targetPath))&&!notListed.has(route.targetPath):kind==='projects'?route.routeId.startsWith('LIVE-portfolio-'):productSpecifications.includes(route.targetPath))
  if(!routes.length)return null
  const title=kind==='articles'?'More ICS technical articles and news':kind==='pages'?'More ICS pages':kind==='projects'?'Additional historical project records':'Additional component specifications'
  return <section className="r2-discovery" aria-label={title}>
    <details><summary>{title}<span>{routes.length} pages</span></summary>
      <ul>{routes.map(route=>{const doc=salmonDocument(route);return <li key={route.routeId}><a href={route.targetPath}>{doc.title||doc.seo.h1[0]}</a></li>})}</ul>
    </details>
  </section>
}
