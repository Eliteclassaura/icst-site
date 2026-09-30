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

export type RfqMountProps = {
  /** The accepted `mount_id` this surface renders. */
  mountId: string
  page: CohortPage
  product?:never
  routePath?:never
}|{mountId:'header_action'|'footer_rfq_band'|'rfq_page';product:SalmonDocument;page?:never;routePath?:never}
 |{mountId:PublicMountId;routePath:string;label?:string;page?:never;product?:never}
 |{mountId:'category_and_family';routePath:string;cardProduct:SalmonDocument|null;cardHref:string;label?:string;page?:never;product?:never}

export const RfqMount = (props: RfqMountProps) => {
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
