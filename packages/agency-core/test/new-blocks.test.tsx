import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ServiceBandBlock } from '../src/blocks/serviceBand/index'
import { ProjectCarouselBlock } from '../src/blocks/projectCarousel/index'
import * as fx from '../src/blocks/fixtures/index'

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
    expect(html).not.toContain('<button')
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
