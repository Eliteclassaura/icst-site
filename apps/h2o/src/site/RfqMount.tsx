/**
 * H2O Phase 2D — the RFQ mount, gated, on a named accepted surface.
 *
 * This attaches the existing Typeform adapter to named surfaces. Cohort and product routes retain
 * their historical gates; exported PUBLIC English routes use the release-ledger gate below.
 *
 * For historical cohort routes, every mount is a named surface from the accepted mount contract.
 * The `mountId` decides three things, all from that authority:
 *
 *   - whether the mount applies to this route at all (`applies_to`, resolved against the accepted
 *     route registry);
 *   - the label, carried verbatim from the contract;
 *   - the `cta_placement` value, which is the contract's own `mount_id` — not a string invented
 *     here, and asserted against the contract by test.
 *
 * Public-route mounts require an exact exported PUBLIC route, an eligible `/contact-us/` fallback,
 * an authorized placement and a resolved adapter configuration. Generic routes pass only
 * `page_path` and `cta_placement`. An ineligible route renders no RFQ control.
 */
import type { CohortPage } from './cohort'
import { categoryAndFamilyGate,mountGate,productMountGate,publicMountGate,type PublicMountId,RFQ_FALLBACK_PATH } from './gate'
import { implementedMounts, mountTreatment } from './mounts'
import { QuoteCta } from '../conversion/QuoteCta'
import { resolveQuoteCta } from '../conversion/resolve'
import {productSlug} from './Wave3Products'
import type {SalmonDocument} from './salmon'
import {nativeIntakeOn} from '../rfq-native/server'
import {NativeRfqTrigger} from '../rfq-native/NativeRfqTrigger'

export type RfqMountProps = {
  /** The accepted `mount_id` this surface renders. */
  mountId: string
  page: CohortPage
  product?:never
  routePath?:never
}|{mountId:'header_action'|'footer_rfq_band'|'rfq_page';product:SalmonDocument;named?:boolean;page?:never;routePath?:never}
 |{mountId:PublicMountId;routePath:string;label?:string;page?:never;product?:never}
 |{mountId:'category_and_family';routePath:string;cardProduct:SalmonDocument|null;cardHref:string;label?:string;page?:never;product?:never}

/** Native intake (H2O_NATIVE_INTAKE=on): a gate passes when every rule but the Typeform configuration holds (config is checked last). */
const nativeEligible=(gate:{mounted:boolean;reason:string}):boolean=>gate.mounted||gate.reason==='CONFIGURATION_UNRESOLVED'
const productTitle=(doc:SalmonDocument):string=>(doc.seo?.h1?.[0]||doc.title||'').replace(/\s+/g,' ').trim()

/**
 * Native RFQ (Control Tower brief 2026-10-05): every existing RFQ control, on the same surfaces and under the same route and
 * product rules, opens the corner panel with its page context (a link to the /contact-us/ form before hydration). The
 * Typeform adapter below stays in code, switched off by the same flag (contract §4.2).
 */
const NativeRfqMount=(props:RfqMountProps)=>{
  const {mountId}=props
  // QA R16 M1: on a product card the link's name carries the product ("Request a Quote for <product>"); the added words
  // are visually hidden, so the visible label is unchanged (the trigger itself is CRM's, rfq-native).
  const trigger=(context:Record<string,string|undefined>,label:string,routeAttr?:string,contextLabel?:string,named?:string)=>
    <span className="rfq rfq-signal" data-rfq-public-route={routeAttr}><NativeRfqTrigger context={context} contextLabel={contextLabel} placement={mountId}>{named?<>{label}<span className="visually-hidden"> for {named}</span></>:label}</NativeRfqTrigger></span>
  if('cardProduct' in props&&props.mountId==='category_and_family'){
    const gate=categoryAndFamilyGate(props.routePath,props.cardProduct,props.cardHref)
    const product=props.cardProduct
    if(!nativeEligible(gate)||!product)return null
    const id=product.routeId.split('-').at(-1),slug=productSlug(product)
    if(!id||!slug)return null
    return trigger({context_type:'product',context_id:id,product_id:id,product_slug:slug,product_path:product.targetPath,product_title:productTitle(product),page_path:props.routePath},props.label??'Request a Quote',props.routePath,productTitle(product),productTitle(product))
  }
  if(props.product){
    if(!['header_action','footer_rfq_band','rfq_page'].includes(mountId))return null
    const product=props.product
    if(!nativeEligible(productMountGate(product)))return null
    const id=product.routeId.split('-').at(-1),slug=productSlug(product)
    if(!id||!slug)return null
    return trigger({context_type:'product',context_id:id,product_id:id,product_slug:slug,product_path:product.targetPath,product_title:productTitle(product),page_path:product.targetPath},'Request a Quote',undefined,productTitle(product),props.named?productTitle(product):undefined)
  }
  if(props.routePath){
    if(!nativeEligible(publicMountGate(props.routePath,mountId)))return null
    return trigger({context_type:'page',page_path:props.routePath},props.label??'Request a Quote',props.routePath)
  }
  const {page}=props
  if(!page||!page.ctaPresent)return null
  const mount=implementedMounts().find((candidate)=>candidate.mountId===mountId)??null
  if(mount===null||!nativeEligible(mountGate(page,{mountId})))return null
  return trigger({context_type:'page',page_path:page.canonicalPath},mount.label)
}

export const RfqMount = (props: RfqMountProps) => {
  if(nativeIntakeOn())return NativeRfqMount(props)
  const {mountId}=props
  if('cardProduct' in props&&props.mountId==='category_and_family'){
    // D1: the listing page is page_path; product context comes from the verified card relation only.
    const gate=categoryAndFamilyGate(props.routePath,props.cardProduct,props.cardHref)
    if(!gate.mounted||!gate.productSlug||!gate.productId)return null
    const context={page_path:props.routePath,product_slug:gate.productSlug,product_id:gate.productId,cta_placement:'category_and_family'}
    const resolved=resolveQuoteCta(context)
    if(!resolved.available||!resolved.contextIncluded||resolved.dropped.length!==0)return null
    const label=props.label??'Request a Quote'
    return <span className="rfq rfq-signal" data-rfq-public-route={props.routePath} data-rfq-placement="category_and_family" data-rfq-card-product={props.cardProduct?.routeId}><QuoteCta ctaPlacement="category_and_family" formUrl={resolved.formUrl} label={label} origin={resolved.origin} pagePath={props.routePath} productId={gate.productId} productSlug={gate.productSlug} title={label}/></span>
  }
  if(props.product){
    if(!['header_action','footer_rfq_band','rfq_page'].includes(mountId))return null
    const product=props.product
    const gate=productMountGate(product)
    if(!gate.mounted)return null
    const slug=productSlug(product)
    const id=product.routeId.split('-').at(-1)
    if(!slug||!id)return null
    const context={page_path:product.targetPath,product_slug:slug,product_id:id,cta_placement:mountId}
    const resolved=resolveQuoteCta(context)
    if(!resolved.available||!resolved.contextIncluded||resolved.dropped.length!==0)return null
    return <span className="rfq rfq-signal wave3-product-rfq"><QuoteCta ctaPlacement={mountId} formUrl={resolved.formUrl} label="Request a Quote" origin={resolved.origin} pagePath={product.targetPath} productId={id} productSlug={slug} title="Request a Quote"/></span>
  }
  if(props.routePath){
    const gate=publicMountGate(props.routePath,mountId)
    if(!gate.mounted){
      return gate.reason==='CONFIGURATION_UNRESOLVED'?<a className="lux-button" href={RFQ_FALLBACK_PATH}>{props.label??'Request a Quote'}</a>:null
    }
    const resolved=resolveQuoteCta({page_path:props.routePath,cta_placement:mountId})
    if(!resolved.available||!resolved.contextIncluded||resolved.dropped.length!==0)return null
    const label=props.label??'Request a Quote'
    return <span className="rfq rfq-signal" data-rfq-public-route={props.routePath} data-rfq-placement={mountId}><QuoteCta ctaPlacement={mountId} formUrl={resolved.formUrl} label={label} origin={resolved.origin} pagePath={props.routePath} title={label}/></span>
  }
  const {page}=props
  if (!page) return null
  // A route with no accepted CTA never mounts one, whatever the surface says.
  if (!page.ctaPresent) return null

  // Only a surface this build implements renders: an applicable mount whose pattern the accepted
  // adapter can actually render. A mount whose pattern has no accepted component is reported by
  // `undeterminedMounts` and renders nothing rather than substituting a different pattern.
  const mount = implementedMounts().find((candidate) => candidate.mountId === mountId) ?? null
  if (mount === null) return null

  const gate = mountGate(page, { mountId })
  if (!gate.mounted) return null

  // Beyond this line the mount applies, the route is publication-ready, the fallback is
  // publication-ready and the configuration resolved. The adapter then applies its own allowlist
  // and its own fail-closed configuration check; this component adds no key outside the accepted
  // eleven.
  const resolved = resolveQuoteCta({
    cta_placement: mount.ctaPlacement,
    page_path: page.canonicalPath,
  })
  if (!resolved.available) return null

  const treatment = mountTreatment(mountId, page)

  // The dialog heading carries the mount's own accepted label, so the contract's "one intent, one
  // label" rule holds inside the dialog as well as on the control that opened it.

  return (
    <span className={treatment === 'SIGNAL' ? 'rfq rfq-signal' : 'rfq rfq-neutral'}>
      <QuoteCta
        ctaPlacement={mount.ctaPlacement}
        formUrl={resolved.formUrl}
        label={mount.label}
        origin={resolved.origin}
        pagePath={page.canonicalPath}
        title={mount.label}
      />
    </span>
  )
}
