import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ServiceBandBlock } from '../src/blocks/serviceBand/index'
import { ProjectCarouselBlock } from '../src/blocks/projectCarousel/index'
import * as fx from '../src/blocks/fixtures/index'
import { HeaderBlock } from '../src/blocks/header/index'
import { RenderBlocks } from '../src/blocks/render'
import { FooterBlock } from '../src/blocks/footer/index'
import { ProductGridBlock } from '../src/blocks/productGrid/index'
import { ChipNavBlock } from '../src/blocks/chipNav/index'

describe('serviceBand (N1 three-service band)', () => {
  it('renders each card as an h3 with its text, and a link only when an href is given', () => {
    const html = renderToStaticMarkup(<ServiceBandBlock {...fx.serviceBand.default} />)
    expect(html.match(/<h3\b/g)).toHaveLength(3)
    expect(html.match(/<a\b/g)).toHaveLength(2)
    expect(html).toContain('href="/service-one/"')
    expect(html).toContain('View service')
    const bare = renderToStaticMarkup(<ServiceBandBlock items={[{ title: 'C', text: 'c', href: '/c/' }]} />)
    expect(bare).toContain('Learn more')
  })
  it('keeps the section heading and lede in source order before the grid', () => {
    const html = renderToStaticMarkup(<ServiceBandBlock {...fx.serviceBand.default} />)
    expect(html.indexOf(fx.serviceBand.default.title!)).toBeLessThan(html.indexOf('blk-services__grid'))
  })
})

describe('projectCarousel (N1 projects track)', () => {
  it('is a labelled, focusable region with one list item per project and no controls', () => {
    const html = renderToStaticMarkup(<ProjectCarouselBlock {...fx.projectCarousel.default} />)
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain(`aria-label="${fx.projectCarousel.default.title}"`)
    expect(html.match(/<li\b/g)).toHaveLength(fx.projectCarousel.default.items.length)
    expect(html.match(/<button/g)).toHaveLength(2)
  })
  it('renders a decorative image with an empty alt and a real image with its alt text', () => {
    const html = renderToStaticMarkup(
      <ProjectCarouselBlock
        items={[
          { title: 'A', text: 'a', image: { url: '/x.webp', alt: 'ignored', width: 4, height: 3, decorative: true } },
          { title: 'B', text: 'b', image: { url: '/y.webp', alt: 'Refinery tower', width: 4, height: 3 } },
        ]}
      />,
    )
    expect(html).toContain('src="/x.webp" alt=""')
    expect(html).toContain('src="/y.webp" alt="Refinery tower"')
  })
})

describe('phoneCta (number from the render context, never from the page)', () => {
  const layout = [{ blockType: 'phoneCta', title: 'Speak to an engineer', eyebrow: 'Call us' }]
  it('links the context number with its tel: scheme and the visible text', () => {
    const html = renderToStaticMarkup(<>{RenderBlocks({ layout, ctx: { phone: { display: '+662-661-7723', tel: 'tel:+6626617723' } } })}</>)
    expect(html).toContain('href="tel:+6626617723"')
    expect(html).toContain('+662-661-7723')
  })
  it('adds the scheme when the context number lacks it', () => {
    const html = renderToStaticMarkup(<>{RenderBlocks({ layout, ctx: { phone: { display: '+662-661-7723', tel: '+6626617723' } } })}</>)
    expect(html).toContain('href="tel:+6626617723"')
  })
  it('renders nothing without a number (fail closed)', () => {
    const html = renderToStaticMarkup(<>{RenderBlocks({ layout, ctx: { phone: null } })}</>)
    expect(html).not.toContain('blk-phone')
    expect(html).not.toContain('tel:')
  })
})

describe('header menu (narrow screens: native disclosure, no JavaScript)', () => {
  const links = [
    { label: 'Home', href: '/' },
    { label: 'Services', href: '/services/' },
  ]
  it('keeps every link in a Menu disclosure and marks the current page', () => {
    const html = renderToStaticMarkup(
      <HeaderBlock brand={{ name: 'ICST', href: '/' }} links={links} currentPath="/services/" cta={{ label: 'Request a quote', href: '/quote/' }} />,
    )
    expect(html).toContain('<details class="blk-header__menu">')
    expect(html).toContain('<summary class="blk-header__toggle">')
    expect(html).toContain('Menu')
    expect(html.match(/class="blk-header__panel"/g)).toHaveLength(1)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('class="blk-header__panel-cta" href="/quote/"')
  })
  it('renders no button in the header (the toggle is a summary, so the menu works without JavaScript)', () => {
    const html = renderToStaticMarkup(<HeaderBlock brand={{ name: 'ICST', href: '/' }} links={links} />)
    expect(html).not.toContain('<button')
  })
})

describe('project carousel arrows', () => {
  it('render as labelled buttons, controlled by the track id', () => {
    const html = renderToStaticMarkup(<ProjectCarouselBlock {...fx.projectCarousel.default} />)
    expect(html).toContain('aria-label="Previous projects"')
    expect(html).toContain('aria-label="Next projects"')
    expect(html).toContain('id="blk-projects-selected-projects"')
  })
  it('stay hidden in the server markup (shown only after mount, so no dead controls without JavaScript)', () => {
    const html = renderToStaticMarkup(<ProjectCarouselBlock {...fx.projectCarousel.default} />)
    expect(html).not.toContain('data-enhanced')
  })
})

describe('articleBody (N3 article layout)', () => {
  it('is an article landmark with one h2 per section and real lists and links', () => {
    const html = renderToStaticMarkup(<>{RenderBlocks({ layout: [{ blockType: 'articleBody', ...fx.articleBody.default }] })}</>)
    expect(html).toContain('<article class="blk-article">')
    expect(html.match(/<h2\b/g)).toHaveLength(fx.articleBody.default.sections.length)
    expect(html).toContain('<ol class="blk-article__numbered">')
    expect(html).toContain('<ul class="blk-article__bullets">')
    expect(html).toContain('Read the full article')
  })
  it('takes paragraph rows from the Payload shape (objects) as text, and drops links without an href', () => {
    const html = renderToStaticMarkup(
      <>
        {RenderBlocks({
          layout: [
            {
              blockType: 'articleBody',
              sections: [
                {
                  heading: 'H',
                  paragraphs: [{ text: 'Row text' }],
                  links: [
                    { label: 'Kept', href: '/kept/' },
                    { label: 'Dropped', href: '' },
                  ],
                },
              ],
            },
          ],
        })}
      </>,
    )
    expect(html).toContain('Row text')
    expect(html).toContain('href="/kept/"')
    expect(html).not.toContain('Dropped')
  })
})

describe('serviceBand media slot', () => {
  it('renders an optional card image (alt text, or empty when decorative) and a date line above the title', () => {
    const html = renderToStaticMarkup(
      <ServiceBandBlock
        items={[
          { title: 'A', text: 'a', date: 'September 4, 2026', image: { url: '/a.webp', alt: 'Tower', width: 4, height: 3 } },
          { title: 'B', text: 'b', image: { url: '/b.webp', alt: 'ignored', width: 4, height: 3, decorative: true } },
        ]}
      />,
    )
    expect(html).toContain('src="/a.webp" alt="Tower"')
    expect(html).toContain('src="/b.webp" alt=""')
    expect(html).toContain('September 4, 2026')
    expect(html.indexOf('blk-services__date')).toBeLessThan(html.indexOf('blk-services__title'))
  })
  it('keeps cards without media unchanged (no img element)', () => {
    const html = renderToStaticMarkup(<ServiceBandBlock items={[{ title: 'C', text: 'c' }]} />)
    expect(html).not.toContain('<img')
  })
})

describe('productGrid (RFQ-only cards)', () => {
  it('renders one card per item with an action and never a price', () => {
    const html = renderToStaticMarkup(<ProductGridBlock {...fx.productGrid.default} />)
    expect(html.match(/<article\b/g)).toHaveLength(fx.productGrid.default.items.length)
    expect(html).toContain('Request a quote')
    expect(html).not.toMatch(/\$|USD|THB|price/i)
  })
  it('uses the action label when one is given', () => {
    const html = renderToStaticMarkup(<ProductGridBlock items={[{ title: 'P', text: 't', href: '/p/' }]} actionLabel="Ask for a quote" />)
    expect(html).toContain('Ask for a quote')
  })
})

describe('chipNav', () => {
  it('is a labelled nav with aria-current on the current chip', () => {
    const html = renderToStaticMarkup(<ChipNavBlock {...fx.chipNav.default} />)
    expect(html).toContain('aria-label="Parts categories"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })
})

describe('parts hub blocks through RenderBlocks', () => {
  it('renders productGrid rows with image normalisation and chipNav rows, dropping links without an href', () => {
    const html = renderToStaticMarkup(
      <>
        {RenderBlocks({
          layout: [
            { blockType: 'productGrid', items: [{ title: 'P', text: 't', href: '/p/', image: { url: '/x.webp', alt: 'Fan', width: 4, height: 3 } }] },
            { blockType: 'chipNav', label: 'Cats', links: [{ label: 'Kept', href: '/kept/' }, { label: 'Dropped', href: '' }] },
          ],
        })}
      </>,
    )
    expect(html).toContain('src="/x.webp" alt="Fan"')
    expect(html).toContain('href="/kept/"')
    expect(html).not.toContain('Dropped')
  })
})

describe('footer contact slot (address and phone from the manifest)', () => {
  it('renders the address lines and a tel: phone when the route supplies them', () => {
    const html = renderToStaticMarkup(
      <FooterBlock columns={[]} copyrightHolder="Legal Name" year={2026} contact={{ lines: ['159 Serm-Mit Tower', 'Bangkok'], phone: { display: '+662-661-7723', tel: 'tel:+6626617723' } }} />,
    )
    expect(html).toContain('159 Serm-Mit Tower')
    expect(html).toContain('href="tel:+6626617723"')
    expect(html).toContain('+662-661-7723')
  })
  it('renders no contact block without a contact prop (fail closed)', () => {
    const html = renderToStaticMarkup(<FooterBlock columns={[]} copyrightHolder="Legal Name" year={2026} />)
    expect(html).not.toContain('blk-footer__contact')
  })
})
