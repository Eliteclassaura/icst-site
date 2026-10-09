/**
 * Salmon family pages (SALMON_FULL_PAGE_VISUAL_PARITY_REMEDIATION_R1).
 *
 * `SalmonFamilyView` is the canonical React presentation: it renders a `SalmonFamilyPageModel`
 * (the content-input contract) inside the global chrome. `SalmonFamilyPage` is the transitional
 * entry used by the current route loader: it asks the transitional adapter for the model. When
 * the runtime Factory's Payload adapter produces the model, only that entry changes.
 *
 * Owner-accepted later-authority routes (homepage, New Towers, the six Figma service pages,
 * Contact, commerce utilities) are not Salmon families and keep their accepted presentation.
 */
import type {ReactNode} from 'react'
import {LuxuryFooter,LuxuryHeader} from './LuxuryShell'
import {SalmonSeo} from './SalmonCanonical'
import {pageForSegments} from './cohort'
import {RfqMount} from './RfqMount'
import {ProjectGallery} from './ProjectGallery'
import {R2Discovery} from './R2Discovery'
import {activeProductRoutes} from './Wave3Products'
import {salmonDocument,type SalmonDocument} from './salmon'
import {SectionView,type RenderContext} from './SalmonComposer'
import {salmonFamilyFor,salmonFamilyModel,salmonFamilyRouteIds,type FamilyConfig} from './salmon-family-adapter'
import type {ProductCardInput,SalmonFamilyPageModel} from './salmon-family-model'
import {isPayloadContent} from '../content/runtime-read'
import {RestoredSlot} from './RestoredSlot'

export {salmonFamilyFor,salmonFamilyRouteIds}

/** Verified product context only: the card's product reference must be one of the 183 products. */
export function productRfqAction(product:ProductCardInput,routePath?:string):ReactNode{
  const route=product.productRouteId?activeProductRoutes().find(candidate=>candidate.routeId===product.productRouteId&&candidate.targetPath===product.productPath):undefined
  if(route&&routePath&&isPayloadContent())return <RfqMount mountId="category_and_family" routePath={routePath} cardProduct={salmonDocument(route)} cardHref={route.targetPath}/>
  return route?<RfqMount mountId="rfq_page" product={salmonDocument(route)} named/>:undefined
}

/**
 * Generic quote action through the approved adapter (form resolved from configuration, context
 * `page_path` + `cta_placement=editorial_inline`). The adapter keeps its own deliberate
 * `/contact-us/` fallback when configuration is unresolved, and renders nothing on a route that
 * is not an exported PUBLIC page. No product identity is attached here.
 */
export function quoteRfqAction(routePath:string,label:string):ReactNode{
  return <RfqMount mountId="editorial_inline" routePath={routePath} label={label}/>
}

function AboutPresence(){
  return <div className="sp-section-inner"><div className="about-presence-list sp-presence" aria-label="Confirmed ICS presence"><span>Lakewood, Colorado <small>Main office</small></span><span>Japan <small>Confirmed presence</small></span><span>Bangkok, Thailand <small>Confirmed presence</small></span></div></div>
}

export function SalmonFamilyMain({model,ctx,restored}:{model:SalmonFamilyPageModel;ctx:RenderContext;restored?:ReactNode}){
  const {modules}=model
  return <main id="main" className={`sp-main sp-family--${model.family}`} data-salmon-region="body" data-salmon-family={model.family} data-audit-family={model.auditFamily} data-content-contract={model.contract} data-content-source={model.source.kind}>
    {modules.pageTitle?<div className="sp-section-inner sp-page-title"><h1 className="sp-heading sp-type-display sp-c-ink">{modules.pageTitle}</h1></div>:null}
    {modules.projectNavigation?<div className="sp-section-inner sp-project-back"><a href="/all-projects/">← All projects</a></div>:null}
    {model.sections.map(section=><SectionSlot key={section.key}>
      <SectionView section={section} ctx={ctx}/>
      {modules.aboutPresence&&section.index===1?<AboutPresence/>:null}
    </SectionSlot>)}
    {modules.projectCoverage?.length?<section className="sp-section sp-section--boxed" aria-labelledby="sp-more-projects"><div className="sp-section-inner"><h2 id="sp-more-projects" className="sp-heading sp-type-display">More project records</h2><ul className="sp-iconlist">{modules.projectCoverage.map(row=><li key={row.path}><a href={row.path}>{row.title}</a></li>)}</ul></div></section>:null}
    {modules.projectDiscovery?<R2Discovery kind="projects"/>:null}
    {restored}
    {modules.projectNavigation?<nav className="sp-section-inner sp-project-next" aria-label="Project and enquiry links"><a className="sp-btn sp-btn--outline" href="/all-projects/">View all projects</a>{ctx.quoteAction?.('Request a Quote')}</nav>:null}
  </main>
}
const SectionSlot=({children}:{children:ReactNode})=><>{children}</>

/** Canonical presentation: model in, page out. SEO/head stays with the route's source record. */
export function SalmonFamilyView({model,doc}:{model:SalmonFamilyPageModel;doc:SalmonDocument}){
  const page=pageForSegments(model.path.split('/').filter(Boolean))
  return <div className={`luxury-site salmon-family salmon-family--${model.family}`} data-salmon-document={model.routeId} data-salmon-source-sha256={model.source.sha256}>
    <SalmonSeo doc={doc}/>
    <LuxuryHeader page={page} routePath={model.path}/>
    <SalmonFamilyMain model={model} ctx={{productAction:product=>productRfqAction(product,model.path),quoteAction:label=>quoteRfqAction(model.path,label),projectDetail:model.family==='project-detail'}} restored={<><ProjectGallery path={model.path}/><RestoredSlot doc={doc} slot="body-end" className="sp-section-inner wave3-source-content"/></>}/>
    <LuxuryFooter page={page} routePath={model.path}/>
  </div>
}

/** Transitional entry for the current repository-JSON route loader. */
export function SalmonFamilyPage({doc,config}:{doc:SalmonDocument;config:FamilyConfig}){
  return <SalmonFamilyView model={salmonFamilyModel(doc,config)} doc={doc}/>
}
