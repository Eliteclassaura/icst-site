import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { client } from '../index'
import { IntakeHero } from '../site/IntakeHero'
import { IntakeSplit, type IntakeContact } from '../site/IntakeSplit'
import { listPages } from '../site/content'
import { segments } from '../site/segments'

/** The ICST native intake skin (WP-27), no browser: the section's markup, the page record, the layout split, and the stylesheet's rules. */
const repo = path.resolve(__dirname, '../../../../..')
const css = readFileSync(path.join(repo, 'apps/h2o/src/client/site/intake-split.css'), 'utf8')
const page = listPages(client().slug).find((p) => p.path === '/contact-us/')
const text = { title: 'Send us a message', lede: 'Intro line.', asideTitle: 'Here to help', hotlineLabel: 'Hotline:', officeLabel: 'Office:' }
const contact = { phone: { display: '+000-000-0000', tel: 'tel:+0000000000' }, address: { lines: ['1 Test Road', 'Level 2'], city: 'Testville', region: 'TV', postalCode: '10000', country: 'Examplestan' } }
const html = (c: IntakeContact = contact) => renderToStaticMarkup(<IntakeSplit {...text} contact={c} form={<form data-testid="the-form" />} />)

describe('IntakeSplit', () => {
  it('puts the form in the left card under the title and lede, and the contact card in an aside labelled by its title', () => {
    const h = html()
    expect(h).toContain('aria-labelledby="intake-title"')
    expect(h.indexOf('Send us a message')).toBeLessThan(h.indexOf('data-testid="the-form"'))
    expect(h).toContain('<aside class="intake__aside" aria-labelledby="intake-aside-title">')
    expect(h).toContain('Here to help')
  })
  it('the hotline is a real tel: link with the visible number; the address lists its lines, city, postcode and country', () => {
    const h = html()
    expect(h).toContain('<a href="tel:+0000000000">+000-000-0000</a>')
    for (const v of ['1 Test Road', 'Level 2', 'Testville 10000', 'Examplestan']) expect(h).toContain(v)
    expect(h).toContain('<address>') // an address element is not nested in a paragraph (that breaks hydration)
    expect(h).not.toMatch(/<p[^>]*>(?:(?!<\/p>).)*<address/)
  })
  it('without a phone or an address the card shows only what exists (nothing is invented)', () => {
    const h = html({ phone: null, address: null })
    expect(h).not.toContain('tel:')
    expect(h).not.toContain('<address>')
    expect(h).toContain('Here to help')
  })
  it('the icons are decorative (hidden from assistive technology)', () => {
    expect(html().match(/class="intake__icon" aria-hidden="true"/g)).toHaveLength(2)
  })
})

describe('the Contact page record and the layout split', () => {
  it('/contact-us/ exists with the contact hero (photo, title) and one intake section carrying all its text', () => {
    expect(page).toBeTruthy()
    const types = (page!.page.layout ?? []).map((b) => (b as { blockType: string }).blockType)
    expect(types).toEqual(['contactHero', 'intakeForm'])
    const seg = segments(page!.page.layout as never)
    expect(seg.map((s) => s.kind)).toEqual(['hero', 'intake'])
    const intake = seg[1]!
    if (intake.kind === 'intake') for (const k of ['title', 'asideTitle', 'hotlineLabel', 'officeLabel'] as const) expect(intake.props[k].length, k).toBeGreaterThan(0)
  })
  it('the hero names the client media path of the approved photograph, its dimensions, and a title; the page keeps its final title', () => {
    const hero = (page!.page.layout as unknown as Array<{ blockType: string; image?: { url: string; width: number; height: number }; title?: string }>)[0]!
    expect(hero.image).toMatchObject({ url: '/brand-media/hero/A_ICST-Cooling-Tower.jpg', width: 1472, height: 832 })
    expect(hero.title).toMatch(/contact ICST today/i)
    expect(page!.page.title).toBe('Contact ICST | Parts, New Towers and Service')
  })
  it('the page record holds no phone number or address (they come from the manifest)', () => {
    const raw = readFileSync(path.join(repo, 'clients', client().slug, 'content/pages/contact-us.json'), 'utf8')
    expect(raw).not.toMatch(/\+?\d[\d\s().-]{7,}\d/)
    expect(raw).not.toMatch(/Serm-Mit|Sukhumvit|Asoke|Klongtoey|Wattana|10110|Bangkok/i)
  })
  it('the split keeps order and drops nothing: blocks before, the intake section, blocks after', () => {
    const rows = [{ blockType: 'hero' }, { blockType: 'faq' }, { blockType: 'intakeForm', title: 't', asideTitle: 'a', hotlineLabel: 'h', officeLabel: 'o' }, { blockType: 'cta' }]
    const seg = segments(rows)
    expect(seg.map((s) => s.kind)).toEqual(['blocks', 'intake', 'blocks'])
    expect(seg[0]).toMatchObject({ layout: [{ blockType: 'hero' }, { blockType: 'faq' }] })
    expect(seg[2]).toMatchObject({ layout: [{ blockType: 'cta' }] })
    expect(segments(null)).toEqual([])
    expect(segments([{ blockType: 'hero' }]).map((s) => s.kind)).toEqual(['blocks'])
  })
})

describe('the hero', () => {
  const hero = readFileSync(path.join(repo, 'apps/h2o/src/client/site/contact-hero.css'), 'utf8')
  it('layers a solid base, the photograph and the three-stop scrim, with the title white, capital and centred', () => {
    expect(hero).toMatch(/--hero-base: rgb\(28 43 61\)/) // #1c2b3d
    for (const stop of ['rgb(14 24 38 / 72%)', 'rgb(10 63 124 / 55%)', 'rgb(14 24 38 / 70%)']) expect(hero).toContain(stop)
    expect(hero).toMatch(/text-transform: uppercase/)
    expect(hero).toMatch(/text-align: center/)
    expect(hero).not.toMatch(/prefers-color-scheme|transition|animation/)
  })
  it('the picture is decorative (empty alt) and the title is the page h1', () => {
    const h = renderToStaticMarkup(<IntakeHero title="T" eyebrow="E" image={{ url: '/x.jpg', width: 10, height: 5, decorative: true }} />)
    expect(h).toContain('alt=""')
    expect(h).toContain('<h1 class="contact-hero__title" id="contact-hero-title">T</h1>')
    expect(h).toContain('aria-hidden="true"')
  })
  it('without an image the band is the solid base and the title is still there', () => {
    const h = renderToStaticMarkup(<IntakeHero title="T" />)
    expect(h).not.toContain('<img')
    expect(h).toContain('contact-hero__title')
  })
})

describe('the stylesheet', () => {
  it('reads only the client theme tokens and the design-system scale, with no hard-coded colour', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\brgb\(/)
    expect(css).toContain('var(--client-accent)')
  })
  it('has no dark rules and no motion (the client is light only and the form needs none)', () => {
    expect(css).not.toMatch(/prefers-color-scheme|transition|animation/)
  })
  it('stacks to one column on a phone and pairs the four fields the design pairs', () => {
    expect(css).toMatch(/@media \(max-width: 960px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
    for (const f of ['first_name', 'last_name', 'phone', 'country']) expect(css).toContain(`data-rfq-field='${f}'`)
  })
})
