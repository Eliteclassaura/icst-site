/**
 * Native RFQ wiring (server render): with H2O_NATIVE_INTAKE=on every existing RFQ control renders the native trigger with its
 * page context (no Typeform URL anywhere), the layout carries the corner launcher, and /contact-us/ carries the inline form
 * section. With it off (the default), nothing native renders and the Typeform path is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Page from '../../app/(site)/[[...slug]]/page'
import SiteLayout from '../../app/(site)/layout'
import { nativeIntakeOn } from '../server'

const env = { ...process.env }
const render = async (p: string) => renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: p.split('/').filter(Boolean).map(decodeURIComponent) }), searchParams: Promise.resolve({}) }))
beforeEach(() => { process.env.H2O_PUBLIC_EXPORT = '1'; process.env.H2O_TYPEFORM_FORM_ID = 'F22cAgx3'; process.env.H2O_TYPEFORM_ORIGIN = 'https://form.typeform.com' })
afterEach(() => { process.env = { ...env } })
const contextOf = (html: string) => [...html.matchAll(/<a href="\/contact-us\/#request-a-quote" class="[^"]*" data-rfq-native="" data-rfq-placement="([^"]+)"/g)].map((m) => m[1])

describe('native intake gate (contract §4.2: H2O_NATIVE_INTAKE=on|off)', () => {
  it('is off unless explicitly on', () => {
    expect(nativeIntakeOn({})).toBe(false)
    expect(nativeIntakeOn({ H2O_NATIVE_INTAKE: 'off' })).toBe(false)
    expect(nativeIntakeOn({ H2O_NATIVE_INTAKE: 'on' })).toBe(true)
  })
})

describe('with native intake on', () => {
  beforeEach(() => { process.env.H2O_NATIVE_INTAKE = 'on' })
  it('a product page: every RFQ control is the native trigger (a real link to the inline form); no Typeform URL', async () => {
    const html = await render('/product/site-assembly/')
    expect(contextOf(html).length).toBeGreaterThan(0)
    expect(html).not.toContain('form.typeform.com')
    expect(html).not.toMatch(/<iframe/)
  })
  it('a service page and an article: the same triggers on the existing surfaces', async () => {
    for (const p of ['/cooling-tower-replacement/', '/cooling-tower-efficiency-calculation/']) {
      const html = await render(p)
      expect(contextOf(html).length, p).toBeGreaterThan(0)
      expect(html, p).not.toContain('form.typeform.com')
    }
  })
  it('/contact-us/: the inline form section (#request-a-quote) replaces the Typeform action; offices keep #offices', async () => {
    const html = await render('/contact-us/')
    expect(html).toContain('<section id="request-a-quote"')
    expect(html).toContain('id="offices"')
    expect(html).not.toContain('form.typeform.com')
  })
  it('the layout carries the corner launcher with its registry strings', async () => {
    const html = renderToStaticMarkup(await SiteLayout({ children: null }))
    expect(html).toMatch(/<button type="button" class="[^"]*" aria-label="Open the quote request panel" title="Ask about parts, towers or service" aria-haspopup="dialog" aria-expanded="false" data-rfq-launcher="">/)
    expect(html).toContain('Request a quote')
  })
})

describe('with native intake off (default)', () => {
  it('nothing native renders; the Typeform controls are as before', async () => {
    const html = await render('/product/site-assembly/')
    expect(html).not.toContain('data-rfq-native')
    expect(html).toContain('form.typeform.com/to/F22cAgx3')
    const layout = renderToStaticMarkup(await SiteLayout({ children: null }))
    expect(layout).not.toContain('data-rfq-launcher')
    expect(await render('/contact-us/')).not.toContain('id="request-a-quote"')
  })
})
