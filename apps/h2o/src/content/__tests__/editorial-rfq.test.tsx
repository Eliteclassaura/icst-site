import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { mergeEditorialRoutes, publicMountGate, type PublicReleaseRoute } from '../../site/gate'

/**
 * R1B.1 — approved generic RFQ on published editor-created pages. Generic placements only (header_action,
 * footer_rfq_band, editorial_inline); context is page_path + cta_placement; never product context; nothing is
 * submitted (URLs are inspected only).
 */
const env = { H2O_TYPEFORM_FORM_ID: 'F22cAgx3', H2O_TYPEFORM_ORIGIN: 'https://form.typeform.com' }
const base: PublicReleaseRoute[] = [
  { path: '/contact-us/', state: 'PUBLIC', export: true, redirect: null, routeClass: 'pages' },
  { path: '/held/', state: 'REVIEW_HOLD', export: false, redirect: null, routeClass: 'pages' },
]
const ed = (p: string): PublicReleaseRoute => ({ path: p, state: 'PUBLIC', export: true, redirect: null, routeClass: 'editorial' })

describe('published editor-created pages: generic RFQ eligibility', () => {
  it('a published editorial page not yet in the release mounts the three generic placements', () => {
    const routes = mergeEditorialRoutes(base, [ed('/synthetic-news/')])
    for (const m of ['header_action', 'footer_rfq_band', 'editorial_inline']) expect(publicMountGate('/synthetic-news/', m, { env, routes }).mounted, m).toBe(true)
  })
  it('without the published mark (draft, preview, withdrawn) the page is not eligible — the /contact-us/ fallback applies', () => {
    expect(publicMountGate('/synthetic-news/', 'editorial_inline', { env, routes: base })).toMatchObject({ mounted: false, reason: 'ROUTE_NOT_PUBLIC_EXPORT' })
  })
  it('never overrides a path the release already classifies (held, redirect, withdrawn) and ignores non-editorial rows', () => {
    const routes = mergeEditorialRoutes(base, [ed('/held/'), { ...ed('/x/'), routeClass: 'pages' }])
    expect(publicMountGate('/held/', 'editorial_inline', { env, routes }).mounted).toBe(false)
    expect(publicMountGate('/x/', 'editorial_inline', { env, routes }).mounted).toBe(false)
  })
  it('placements other than the generic ones stay closed; configuration unresolved stays closed', () => {
    const routes = mergeEditorialRoutes(base, [ed('/synthetic-news/')])
    for (const m of ['category_and_family', 'project_inline', 'product_hero']) expect(publicMountGate('/synthetic-news/', m, { env, routes }).mounted, m).toBe(false)
    expect(publicMountGate('/synthetic-news/', 'editorial_inline', { env: {}, routes })).toMatchObject({ mounted: false, reason: 'CONFIGURATION_UNRESOLVED' })
  })
})

describe('EditorialPage renders the adapter with generic context only', () => {
  const saved = { ...process.env }
  beforeEach(() => Object.assign(process.env, env))
  afterEach(() => {
    process.env = { ...saved }
  })
  it('quote button → editorial_inline with page_path + cta_placement; ordinary buttons stay links', async () => {
    const { EditorialPage } = await import('../EditorialPage')
    // Repository mode: the accepted release ledger is the route authority; use a PUBLIC exported path from it.
    const doc = { routeId: 'EDITORIAL-000000000000', targetPath: '/contact-us/', title: 'T', lead: '', sections: [{ blockType: 'button' as const, label: 'Request a quote', href: '', intent: 'quote' as const }, { blockType: 'button' as const, label: 'Read more', href: '/resources/', intent: 'none' as const }] }
    const html = renderToStaticMarkup(<EditorialPage doc={doc} />).replace(/&amp;/g, '&')
    const ctx = [...html.matchAll(/href="https:\/\/form\.typeform\.com\/to\/F22cAgx3#([^"]+)"/g)].map((m) => Object.fromEntries(new URLSearchParams(m[1])))
    expect(ctx.some((c) => c.cta_placement === 'editorial_inline' && c.page_path === '/contact-us/')).toBe(true)
    for (const c of ctx) expect(Object.keys(c).sort()).toEqual(['cta_placement', 'page_path'])
    expect(html).toContain('href="/resources/"')
  })
})
