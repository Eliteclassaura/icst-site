import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = process.cwd()
const r3Css = readFileSync(path.join(appRoot, 'src', 'app', '(site)', 'r3.css'), 'utf8')
const article = readFileSync(path.join(appRoot, 'src', 'site', 'ArticleComposition.tsx'), 'utf8')
const render = readFileSync(path.join(appRoot, 'src', 'site', 'render.tsx'), 'utf8')
const capture = readFileSync(path.join(appRoot, '..', '..', 'tools', 'capture-responsive.mjs'), 'utf8')

describe('R3 R1.1 responsive regressions', () => {
  it('draws the native menu icon throughout the 1024px disclosure breakpoint', () => {
    const query = r3Css.slice(r3Css.lastIndexOf('@media (max-width: 1024px) {'))
    expect(query).toContain('.header .nav-bars')
    expect(query).toContain('box-shadow:')
    expect(query).toContain('inline-size: 18px')
    expect(query).toContain('.header .nav-button:focus-visible')
  })

  it('only displays the mobile RFQ bar when a real RFQ control exists', () => {
    expect(r3Css).toContain('body:has(.mobile-rfq-bar > .rfq)')
    expect(r3Css).toContain('.mobile-rfq-bar:has(> .rfq)')
    expect(capture).toContain('MOBILE_RFQ_UNAVAILABLE_FAIL_CLOSED')
    expect(capture).toContain('MOBILE_RFQ_CONTROL_VISIBLE')
  })

  it('uses an initially closed native disclosure for the mobile article index', () => {
    expect(article).toContain('<details className="article-index article-index--mobile">')
    expect(article).toContain('<summary>On this page</summary>')
    expect(article).toContain("articleIndexLinks('mobile-index')")
  })

  it('does not mislabel a duplicated homepage capture as a construction route', () => {
    expect(capture).not.toContain("{ id: 'construction', route: '/' }")
    expect(capture).toContain(
      "{ id: 'maintenance-article', route: '/cooling-tower-maintenance/', surface: 'article' }",
    )
    expect(render).toContain('decoding="sync"')
    expect(capture).toContain('waitForCapabilityImages')
    expect(capture).toContain('home-capability-media-${capabilityNames[index] ?? index + 1}.png')
    expect(capture).toContain('does not intersect its frame')
    expect(capture).toContain('renders above its native size')
    expect(capture).toContain('capabilityRequests')
    expect(r3Css).toContain('.testimonial-feature')
    expect(r3Css).toContain('.testimonial-row')
    expect(r3Css).not.toContain('testimonial-carousel')
  })
})
