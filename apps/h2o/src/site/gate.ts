/**
 * H2O publication and RFQ gates, and everything that depends on them.
 *
 * Every one of the 29 implemented routes carries
 * `publication_condition = PUBLICATION_READY_REQUIRED;OWNER_SME_GATE_OUTSTANDING`, and the accepted
 * route registry records **0 publication-ready routes**. So this build implements 29 routes and
 * publishes none of them, which is exactly what the authorization asks for.
 *
 * The gate is a function, not a comment. Everything that must not happen before publication —
 * indexing in page metadata, the `X-Robots-Tag` response header, the private-preview notice,
 * navigation links, the Typeform mount — asks this module and gets `false` for the same measured
 * reason. That is the point: a single reading, applied consistently, rather than several hardcoded
 * facts that agree today and drift apart the day one route becomes ready.
 *
 * Every function here takes the cohort as an argument with `cohort()` as its default. That is what
 * lets a test prove the positive path — a synthetic page that *is* publication-ready — without
 * altering an accepted authority to manufacture readiness.
 *
 * Nothing here decides readiness. Readiness is an owner and Control Tower decision recorded in the
 * accepted authorities; this module only reads it and fails closed when it is absent. The later
 * PUBLIC English RFQ extension reads the release ledger without changing the historical cohort
 * publication or private-staging gates.
 *
 * **Two readinesses, two authorities, deliberately not merged.**
 *
 *   - *Publication readiness* — may this route be published and indexed? — is read from the
 *     historical frozen fields and is still `no` for all 29. It governs page robots metadata, the
 *     `X-Robots-Tag` header, the private-preview notice and navigation-label suppression.
 *   - *Staging-validation readiness* — may the accepted Typeform interface be exercised here in a
 *     private staging validation? — is read from the bounded overlay in `staging.ts` and is `yes`
 *     for all 29. It governs the mount gate, and nothing else.
 *
 * Merging them would have been the easy change and the wrong one: it would have opened indexing on
 * 29 unpublished routes as a side effect of turning on a button.
 */
import { cohort, type CohortPage } from './cohort'
import {readFileSync} from 'node:fs'
import {isPayloadContent,releaseLedger,requestEditorialRoutes} from '../content/runtime-read'
import path from 'node:path'
import { mountAppliesToRoute } from './mounts'
import { stagingNavigationAuthorized, stagingValidationReady } from './staging'
import { resolveTypeformConfig } from '../conversion/config'
import {productIdentityValid,productSlug} from './Wave3Products'
import type {SalmonDocument} from './salmon'

/** The RFQ no-script fallback route named by the accepted mount contract. */
export const RFQ_FALLBACK_PATH = '/contact-us/'

export type PublicationState = {
  /** Why, in the accepted authority's own words. */
  condition: string
  ready: boolean
}

/**
 * Publication readiness for one route.
 *
 * A route is publication-ready only if its accepted `publication_condition` says so. Today none
 * does, and this function is written so that the day one does, nothing else has to change.
 */
export const publicationState = (page: CohortPage): PublicationState => ({
  condition: page.publicationCondition,
  ready: page.publicationCondition === 'PUBLICATION_READY',
})

/** Indexability. `INDEX_ON_PUBLICATION_READY` means: not until publication, so noindex now. */
export const isIndexable = (page: CohortPage): boolean =>
  page.indexabilityInstruction === 'INDEX_ON_PUBLICATION_READY' && publicationState(page).ready

/**
 * Estate-level readiness.
 *
 * Used where no single route is in hand — the root layout's default metadata. It is the same
 * reading as `publicationState`, aggregated, never a second hardcoded fact.
 */
export const estateHasPublicationReadyRoute = (pages: CohortPage[] = cohort()): boolean =>
  pages.some((page) => publicationState(page).ready)

/**
 * Whether the private-preview notice renders on a route.
 *
 * The notice says the page is not published. A published page must not carry it, so it is bound to
 * the same gate as robots rather than rendered unconditionally.
 */
export const showsPreviewNotice = (page: CohortPage): boolean => !publicationState(page).ready

export type MountGateReason =
  | 'CONFIGURATION_UNRESOLVED'
  | 'FALLBACK_ROUTE_NOT_STAGING_VALIDATION_READY'
  | 'MOUNTED'
  | 'MOUNT_NOT_APPLICABLE_TO_ROUTE'
  | 'ROUTE_NOT_IN_COHORT'
  | 'ROUTE_NOT_STAGING_VALIDATION_READY'
  | 'ROUTE_NOT_PUBLIC_EXPORT'
  | 'FALLBACK_ROUTE_NOT_PUBLIC_EXPORT'
  | 'MOUNT_NOT_AUTHORIZED_FOR_PUBLIC'

export type MountGate = {
  /** Present only when `mounted` is true, so an unmounted gate cannot leak a target. */
  formUrl?: string
  mounted: boolean
  origin?: string
  reason: MountGateReason
}

export type MountGateOptions = {
  env?: Record<string, string | undefined>
  /** The accepted mount this surface is rendering. Omitted only by tests of the shared conditions. */
  mountId?: string
  pages?: CohortPage[]
}

/**
 * Decide whether the accepted Typeform RFQ interface may mount on a route, on a named surface.
 *
 * Four independent conditions, each from an accepted authority, all of which must hold:
 *
 *   1. the mount applies to this route at all, per the accepted contract's own `applies_to` token
 *      resolved against the accepted route registry — or, for a mount the bounded staging overlay
 *      adds, per that overlay's own `applies_to` token resolved the same way;
 *   2. the route is ready for **private staging validation**;
 *   3. the no-script fallback route `/contact-us/` is ready for private staging validation too —
 *      otherwise a viewer without scripting is sent to a page that is not itself exercisable;
 *   4. the adapter's own configuration resolves, which the accepted 2C-min contract already makes
 *      fail-closed.
 *
 * **Conditions 2 and 3 changed authority in this increment, and that is the whole of the change.**
 * They previously asked `publicationState`, taken from the historical frozen fields. They now ask
 * `stagingValidationReady`, taken from the bounded staging-readiness overlay Control Tower
 * authorized. Nothing else moved: `isIndexable`, `showsPreviewNotice` and `navTargetRenderable`
 * below still read `publicationState`, so robots direction, the private-preview notice and
 * navigation-label suppression are exactly as accepted. Publication and staging validation are two
 * questions, and this module keeps answering both — from different files.
 *
 * The order matters for the reason code, not for the outcome: the first failing condition is
 * reported, so the evidence names the nearest blocker rather than the last one checked.
 */
export const mountGate = (page: CohortPage | null, options: MountGateOptions = {}): MountGate => {
  const { env = process.env, mountId, pages = cohort() } = options

  if (page === null) return { mounted: false, reason: 'ROUTE_NOT_IN_COHORT' }
  if (mountId !== undefined && !mountAppliesToRoute(mountId, page)) {
    return { mounted: false, reason: 'MOUNT_NOT_APPLICABLE_TO_ROUTE' }
  }
  if (!stagingValidationReady(page)) {
    return { mounted: false, reason: 'ROUTE_NOT_STAGING_VALIDATION_READY' }
  }

  const fallback = pages.find((candidate) => candidate.canonicalPath === RFQ_FALLBACK_PATH) ?? null
  if (fallback === null || !stagingValidationReady(fallback)) {
    return { mounted: false, reason: 'FALLBACK_ROUTE_NOT_STAGING_VALIDATION_READY' }
  }

  const config = resolveTypeformConfig({
    H2O_TYPEFORM_FORM_ID: env.H2O_TYPEFORM_FORM_ID,
    H2O_TYPEFORM_ORIGIN: env.H2O_TYPEFORM_ORIGIN,
  })
  if (!config.ok) return { mounted: false, reason: 'CONFIGURATION_UNRESOLVED' }

  return {
    formUrl: `${config.value.origin}/to/${config.value.formId}`,
    mounted: true,
    origin: config.value.origin,
    reason: 'MOUNTED',
  }
}

/** Wave 3 product-only private-staging extension; publication readiness is untouched. */
export const productMountGate = (doc:SalmonDocument,env:Record<string,string|undefined>=process.env):MountGate=>{
  if(!productIdentityValid(doc)||!productSlug(doc)||!/^[0-9]+$/.test(doc.routeId.split('-').at(-1)??''))return {mounted:false,reason:'ROUTE_NOT_IN_COHORT'}
  const fallback=cohort().find(page=>page.canonicalPath===RFQ_FALLBACK_PATH)
  if(!fallback||!stagingValidationReady(fallback))return {mounted:false,reason:'FALLBACK_ROUTE_NOT_STAGING_VALIDATION_READY'}
  const config=resolveTypeformConfig({H2O_TYPEFORM_FORM_ID:env.H2O_TYPEFORM_FORM_ID,H2O_TYPEFORM_ORIGIN:env.H2O_TYPEFORM_ORIGIN})
  if(!config.ok)return {mounted:false,reason:'CONFIGURATION_UNRESOLVED'}
  return {mounted:true,formUrl:`${config.value.origin}/to/${config.value.formId}`,origin:config.value.origin,reason:'MOUNTED'}
}

export type PublicReleaseRoute = {
  path:string;state:string;export:boolean;redirect:unknown;routeClass:string
}
export type PublicMountId = 'header_action'|'footer_rfq_band'|'editorial_inline'|'rfq_page'
/**
 * R1B.1: add published editor-created pages (family `editorial`, validated address) to the release routes the
 * public gate reads. A path the release already lists as PUBLIC is left as it is; a path the release lists
 * otherwise (held, redirect, withdrawn) is never overridden — only an address the release does not know yet.
 */
export const mergeEditorialRoutes=(routes:PublicReleaseRoute[],editorial:PublicReleaseRoute[]):PublicReleaseRoute[]=>{
  const extra=editorial.filter(e=>e.routeClass==='editorial'&&!routes.some(r=>r.path===e.path))
  return extra.length?[...routes,...extra]:routes
}
let publicRoutesCache:PublicReleaseRoute[]|null=null
const publicRoutes=():PublicReleaseRoute[]=>{
  // Content bridge seam: payload content mode follows the current published ledger (cached per generation).
  if(isPayloadContent()){
    const routes=(releaseLedger() as {routes:PublicReleaseRoute[]}).routes
    // R1B.1: a published editor-created page rendered in this request (see runtime-read `markPublishedEditorial`).
    return mergeEditorialRoutes(routes,requestEditorialRoutes())
  }
  if(publicRoutesCache===null){
    const file=path.join(process.cwd(),'content/release/route-ledger.json')
    publicRoutesCache=(JSON.parse(readFileSync(file,'utf8')) as {routes:PublicReleaseRoute[]}).routes
  }
  return publicRoutesCache
}
const englishPublicPath=(value:string):boolean=>
  value.startsWith('/')&&!/[?#]/.test(value)&&
  !/^\/(?:api|admin|my-account|_next|preview|internal|__|ja|jp|th)(?:\/|$)/i.test(value)&&
  !/%(?:e0%b8|e3%8[123])/i.test(value)
const publicReleaseReady=(value:string,routes:PublicReleaseRoute[]):boolean=>{
  if(!englishPublicPath(value))return false
  const row=routes.find(candidate=>candidate.path===value)
  return !!row&&row.state==='PUBLIC'&&row.export===true&&!row.redirect&&
    !['internal','admin','preview'].includes(row.routeClass)
}

/** Public-release extension only. Historical cohort and product gates above are unchanged. */
export const publicMountGate=(
  routePath:string,
  mountId:string,
  options:{env?:Record<string,string|undefined>;routes?:PublicReleaseRoute[]}={},
):MountGate=>{
  const routes=options.routes??publicRoutes()
  if(!(['header_action','footer_rfq_band','editorial_inline','rfq_page'] as string[]).includes(mountId))
    return {mounted:false,reason:'MOUNT_NOT_AUTHORIZED_FOR_PUBLIC'}
  if(!publicReleaseReady(routePath,routes))return {mounted:false,reason:'ROUTE_NOT_PUBLIC_EXPORT'}
  if(!publicReleaseReady(RFQ_FALLBACK_PATH,routes))return {mounted:false,reason:'FALLBACK_ROUTE_NOT_PUBLIC_EXPORT'}
  const env=options.env??process.env
  const config=resolveTypeformConfig({H2O_TYPEFORM_FORM_ID:env.H2O_TYPEFORM_FORM_ID,H2O_TYPEFORM_ORIGIN:env.H2O_TYPEFORM_ORIGIN})
  if(!config.ok)return {mounted:false,reason:'CONFIGURATION_UNRESOLVED'}
  return {mounted:true,formUrl:`${config.value.origin}/to/${config.value.formId}`,origin:config.value.origin,reason:'MOUNTED'}
}

/**
 * D1 (Control Tower 2026-09-30, owner-authorised): `category_and_family`, the one bounded extension of the public
 * placements. It opens ONLY on an exported PUBLIC listing/family page (the nine Parts family landings, or a
 * `product_cat` route), ONLY for a product card whose destination is exactly a PUBLIC, identity-valid product
 * of the active cohort, and ONLY with the approved configuration. Every other public gate rule is unchanged.
 * Context (product_slug/product_id) is derived here from the product record, never typed by content.
 */
/** Product archive pages (Control Tower ruling 2026-10-02, archive template): category and tag listings and their pages. */
export const PRODUCT_ARCHIVE_PATH=/^\/product-(?:category|tag)\//
export const CATEGORY_AND_FAMILY_PAGES=new Set(['/cooling-tower-fan-stacks/','/drive-shafts-assembles/','/fans/','/fill-media/','/frp-members/','/gear-box/','/motors/','/nozzles/','/tower-hardware/'])
export type CardProductGate=MountGate&{productSlug?:string;productId?:string}
export const categoryAndFamilyGate=(
  routePath:string,
  product:SalmonDocument|null,
  cardHref:string,
  options:{env?:Record<string,string|undefined>;routes?:PublicReleaseRoute[]}={},
):CardProductGate=>{
  const routes=options.routes??publicRoutes()
  if(!publicReleaseReady(routePath,routes))return {mounted:false,reason:'ROUTE_NOT_PUBLIC_EXPORT'}
  const row=routes.find(candidate=>candidate.path===routePath)
  if(!CATEGORY_AND_FAMILY_PAGES.has(routePath)&&row?.routeClass!=='product_cat'&&!PRODUCT_ARCHIVE_PATH.test(routePath))return {mounted:false,reason:'MOUNT_NOT_AUTHORIZED_FOR_PUBLIC'}
  if(!product)return {mounted:false,reason:'ROUTE_NOT_IN_COHORT'}
  if(!publicReleaseReady(product.targetPath,routes))return {mounted:false,reason:'ROUTE_NOT_IN_COHORT'}
  let cardPath:string
  try{cardPath=new URL(cardHref,product.sourceUrl||'https://h2ocooling.com/').pathname}catch{cardPath=''}
  if(decodeURIComponent(cardPath)!==decodeURIComponent(product.targetPath))return {mounted:false,reason:'ROUTE_NOT_IN_COHORT'}
  const slug=productSlug(product),id=product.routeId.split('-').at(-1)
  if(!productIdentityValid(product)||!slug||!id||!/^[0-9]+$/.test(id))return {mounted:false,reason:'ROUTE_NOT_IN_COHORT'}
  if(!publicReleaseReady(RFQ_FALLBACK_PATH,routes))return {mounted:false,reason:'FALLBACK_ROUTE_NOT_PUBLIC_EXPORT'}
  const env=options.env??process.env
  const config=resolveTypeformConfig({H2O_TYPEFORM_FORM_ID:env.H2O_TYPEFORM_FORM_ID,H2O_TYPEFORM_ORIGIN:env.H2O_TYPEFORM_ORIGIN})
  if(!config.ok)return {mounted:false,reason:'CONFIGURATION_UNRESOLVED'}
  return {mounted:true,formUrl:`${config.value.origin}/to/${config.value.formId}`,origin:config.value.origin,reason:'MOUNTED',productSlug:slug,productId:id}
}

/**
 * A navigation label may render only when its target route is publication-ready.
 *
 * The accepted navigation contract's first rule: "A navigation label whose target route is not
 * publication-ready is suppressed, never rendered as a dead link and never repointed at a
 * substitute page. BUILD alone never makes a label render."
 *
 * Note what this does *not* say: it does not say the label is suppressed forever. Readiness is the
 * condition, so this is a question asked of the current cohort every time, not a verdict baked in.
 */
export const navTargetRenderable = (targetPath: string, pages: CohortPage[] = cohort()): boolean => {
  const page = pages.find((candidate) => candidate.canonicalPath === targetPath) ?? null
  return page !== null && publicationState(page).ready
}

/**
 * May a navigation label render on **private staging**?
 *
 * This is the second reading, and it is deliberately a different function from the one above
 * rather than a flag inside it. `navTargetRenderable` answers the publication question from the
 * historical frozen field and is unchanged; this answers the staging question from the bounded
 * overlay. Merging them would be the reinterpretation the whole two-readings discipline exists to
 * prevent — the same field governs indexing.
 *
 * Both conditions the directive names are evaluated here, against the live cohort on every call:
 *
 *   1. the target is a canonical path of the accepted cohort — a label pointing anywhere else,
 *      including every held route, stays suppressed exactly as before;
 *   2. that route is ready for private staging validation under the overlay.
 *
 * The authorization itself is read from the overlay rather than assumed, so a build whose overlay
 * does not carry it renders no navigation at all and says why.
 */
export const navTargetStagingRenderable = (
  targetPath: string,
  pages: CohortPage[] = cohort(),
): boolean => {
  if (!stagingNavigationAuthorized()) return false
  const page = pages.find((candidate) => candidate.canonicalPath === targetPath) ?? null
  return page !== null && stagingValidationReady(page)
}
