/**
 * H2O Phase 2D — the visual implementation may not lose a frozen media selection.
 *
 * The article template distributes each route's accepted inline images over the body's own H2
 * boundaries. Its first draft placed image `i - 1` before section `i` and stopped, which meant a
 * body with fewer interior boundaries than images silently rendered fewer images than its
 * authority names. The 87-load browser QA caught it on one route — `17542` on
 * `/cooling-tower-performance-testing/`, where a two-section body was asked to carry two images —
 * and 68 frozen selections became 67 rendered.
 *
 * That is a content loss, not a layout choice, so the property is asserted here over every
 * accepted body rather than measured after the fact on one page. The browser QA still measures the
 * rendered result; this test is what makes the regression fail at `pnpm check` instead.
 */
import { describe, expect, it } from 'vitest'
import { splitMedia, MediaPlacementError } from '../ArticleComposition'
import { cohort } from '../cohort'
import { inlineFor, mediaFor } from '../media'
import { correctLeadingHeadings } from '../headings'
import { parseBody } from '../markdown'
import { partitionByHeading } from '../sections'

const DISCOVERY = 'Related pages'

describe('every accepted inline image is placed, on every accepted body', () => {
  it('splits each route total-preservingly', () => {
    let totalInline = 0
    let totalPlaced = 0
    for (const page of cohort()) {
      const inline = inlineFor(page.routeId)
      // The article template renders all sections after the lead-in, minus the discovery section
      // when it is lifted out into the grid. That is the section count the split sees.
      const sections = partitionByHeading(correctLeadingHeadings(parseBody(page.bodyMarkdown, page.routeId)).blocks)
      const rendered = sections
        .slice(1)
        .filter((section) => section.title !== DISCOVERY)
      const { head, tail } = splitMedia(inline, rendered.length)
      expect(head.length + tail.length).toBe(inline.length)
      // No image is in both halves, and order is preserved.
      expect([...head, ...tail]).toEqual(inline)
      totalInline += inline.length
      totalPlaced += head.length + tail.length
    }
    expect(totalPlaced).toBe(totalInline)
  })

  it('places every accepted selection across the cohort, hero and inline together', () => {
    const accepted = cohort().reduce((n, page) => n + mediaFor(page.routeId).length, 0)
    const placed = cohort().reduce((n, page) => {
      const sections = partitionByHeading(correctLeadingHeadings(parseBody(page.bodyMarkdown, page.routeId)).blocks)
        .slice(1)
        .filter((section) => section.title !== DISCOVERY)
      const { head, tail } = splitMedia(inlineFor(page.routeId), sections.length)
      const hero = mediaFor(page.routeId).filter((m) => m.role === 'HERO').length
      return n + hero + head.length + tail.length
    }, 0)
    expect(placed).toBe(accepted)
  })

  it('refuses rather than drops — the error type exists and is an Error', () => {
    expect(new MediaPlacementError('x')).toBeInstanceOf(Error)
  })

  it('carries the tail when a body has fewer boundaries than images', () => {
    // Two sections have one interior boundary; three images cannot all sit on it.
    const { head, tail } = splitMedia([1, 2, 3], 2)
    expect(head).toEqual([1])
    expect(tail).toEqual([2, 3])
  })
})
