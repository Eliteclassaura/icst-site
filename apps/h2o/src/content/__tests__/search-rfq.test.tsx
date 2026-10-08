import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReleaseSearchPage, SEARCH_ROUTE_PATH } from '../ReleaseSearchPage'
import { rfqConfigState } from '../rfq-config'
import path from 'node:path'

const APP = path.resolve(__dirname, '../../..')
const saved = { id: process.env.H2O_TYPEFORM_FORM_ID, origin: process.env.H2O_TYPEFORM_ORIGIN }
const set = (id?: string, origin?: string) => {
  if (id === undefined) delete process.env.H2O_TYPEFORM_FORM_ID
  else process.env.H2O_TYPEFORM_FORM_ID = id
  if (origin === undefined) delete process.env.H2O_TYPEFORM_ORIGIN
  else process.env.H2O_TYPEFORM_ORIGIN = origin
}
beforeEach(() => set('F22cAgx3', 'https://form.typeform.com'))
afterEach(() => set(saved.id, saved.origin))

const quoteLinks = (html: string) =>
  [...html.matchAll(/<a[^>]*href="(https:\/\/form\.typeform\.com\/to\/F22cAgx3[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'))
const fragment = (u: string) => Object.fromEntries(new URLSearchParams(new URL(u).hash.slice(1)))

describe('/search/ RFQ gap closure in the canonical Payload search page', () => {
  it('mounts the approved adapter at header (desktop + mobile menu) and footer with only page_path and cta_placement', () => {
    const html = renderToStaticMarkup(<ReleaseSearchPage />)
    const links = quoteLinks(html)
    expect(links).toHaveLength(3)
    const ctx = links.map(fragment)
    expect(ctx.map((c) => c.cta_placement).sort()).toEqual(['footer_rfq_band', 'header_action', 'header_action'])
    for (const c of ctx) expect(Object.keys(c).sort()).toEqual(['cta_placement', 'page_path'])
    for (const c of ctx) expect(c.page_path).toBe(SEARCH_ROUTE_PATH)
    expect(html).toContain(`data-rfq-public-route="${SEARCH_ROUTE_PATH}"`)
  })

  it('keeps all six ordinary Contact links (header nav ×2, mobile contact, no-result alternative, footer band + column) as links', () => {
    const html = renderToStaticMarkup(<ReleaseSearchPage />)
    expect(html).toContain('<a class="sp-footer-contact" href="/contact-us/">Contact Us</a>')
    expect(html).toContain('<a href="/contact-us/">Contact ICS</a>')
    expect(html).toContain('<a class="site-mobile-contact" href="/contact-us/">Contact us</a>')
    expect((html.match(/href="\/contact-us\/"/g) ?? []).length).toBe(6)
  })

  it('falls back to the gate’s Contact link, never a dead control, when the configuration is unresolved', () => {
    set(undefined, undefined)
    const html = renderToStaticMarkup(<ReleaseSearchPage />)
    expect(quoteLinks(html)).toHaveLength(0)
    expect((html.match(/<a class="lux-button" href="\/contact-us\/">Request a Quote<\/a>/g) ?? []).length).toBe(3)
  })

  it('runtime readiness requires the approved RFQ configuration (no default, no substitute)', () => {
    expect(rfqConfigState({ H2O_TYPEFORM_FORM_ID: 'F22cAgx3', H2O_TYPEFORM_ORIGIN: 'https://form.typeform.com' }, APP)).toBe('ok')
    expect(rfqConfigState({}, APP)).toBe('fail')
    expect(rfqConfigState({ H2O_TYPEFORM_FORM_ID: 'Other123', H2O_TYPEFORM_ORIGIN: 'https://form.typeform.com' }, APP)).toBe('fail')
    expect(rfqConfigState({ H2O_TYPEFORM_FORM_ID: 'F22cAgx3', H2O_TYPEFORM_ORIGIN: 'https://evil.example' }, APP)).toBe('fail')
  })
})
