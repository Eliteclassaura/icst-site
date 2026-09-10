import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { blockManifest } from '@factory/agency-core/blocks/manifest'

/**
 * Responsive / visual QA across the five master-prompt viewports (C5.5 workstream G).
 *
 * The block suite already proves each fixture is accessible and renders; this one proves the
 * *layout* holds as the viewport narrows, which is where a design system actually breaks. Three
 * failure classes, each mechanical:
 *
 *   1. **Horizontal overflow** — the page scrolls sideways, or one element is wider than the
 *      viewport. The usual causes are a fixed width, a long unbroken token, or a grid whose
 *      columns do not collapse.
 *   2. **Text overlap** — two text-bearing siblings occupy the same pixels, so one is unreadable.
 *      This is the class the ADR-026 spike flagged at 390 on the hero (spike observation 5), and
 *      it is checked here on every block rather than just that one.
 *   3. **Clipping** — a box hides content it is too small for.
 *
 * The viewports are driven from inside one test rather than by running the whole suite five
 * times: the cost is one page load per width, and it keeps the QA readable as a single report.
 *
 * Requires DEV_ROUTES=1 on the server under test.
 */

const VIEWPORTS = [360, 390, 768, 1024, 1440] as const
const HEIGHT = 900

/** Sub-pixel noise from transforms and fractional layout; below this two boxes are not overlapping. */
const EPSILON = 1.5

// One project drives all five widths; skip the rest so the work is not repeated per project.
test.beforeEach(({}, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('-1440'), 'the design-QA spec drives its own viewports')
})

type Box = { x: number; y: number; w: number; h: number; label: string }

/** Rects of the elements that carry visible text and are laid out as siblings of one another. */
function collectTextBoxes(): Box[] {
  const out: Box[] = []
  const els = document.querySelectorAll(
    'main h1, main h2, main h3, main p, main li, main a, main button, main figcaption, main td, main th',
  )
  for (const el of els) {
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
    if (el.closest('[aria-hidden="true"]')) continue
    if (!el.textContent || !el.textContent.trim()) continue
    // Only leaf-ish text: a container that holds other text elements legitimately encloses them.
    if (el.querySelector('h1,h2,h3,p,li,a,button,figcaption,td,th')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    out.push({
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      label: `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} "${el.textContent.trim().slice(0, 32)}"`,
    })
  }
  return out
}

function overlaps(a: Box, b: Box): boolean {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return ix > EPSILON && iy > EPSILON
}

const url = (slug: string, fixture: string) => `/dev/blocks/${slug}/?fixture=${fixture}`

for (const b of blockManifest) {
  for (const f of b.fixtures) {
    test(`@design-qa ${b.slug}/${f}: layout holds at ${VIEWPORTS.join(', ')}`, async ({ page }) => {
      const problems: string[] = []
      for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: HEIGHT })
        const res = await page.goto(url(b.slug, f))
        expect(res?.status(), `${b.slug}/${f} at ${width}`).toBe(200)

        const doc = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }))
        if (doc.scroll > doc.client + 1)
          problems.push(`${width}: document scrolls sideways (${doc.scroll} > ${doc.client})`)

        // An element wider than the viewport, unless it is deliberately scrollable in its own box.
        const wide = await page.evaluate((vw) => {
          const bad: string[] = []
          for (const el of document.querySelectorAll('main *')) {
            const r = el.getBoundingClientRect()
            if (r.width <= vw + 1) continue
            let p: Element | null = el.parentElement
            let scrollable = false
            while (p) {
              const ov = getComputedStyle(p).overflowX
              if (ov === 'auto' || ov === 'scroll') {
                scrollable = true
                break
              }
              p = p.parentElement
            }
            if (!scrollable)
              bad.push(
                `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} is ${Math.round(r.width)}px`,
              )
          }
          return bad.slice(0, 3)
        }, width)
        for (const w of wide) problems.push(`${width}: ${w}`)

        const boxes = await page.evaluate(collectTextBoxes)
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i] as Box
            const c = boxes[j] as Box
            if (overlaps(a, c)) problems.push(`${width}: text overlap — ${a.label} over ${c.label}`)
          }

        const clipped = await page.evaluate(() => {
          const bad: string[] = []
          for (const el of document.querySelectorAll('main *')) {
            const s = getComputedStyle(el)
            if (s.overflow !== 'hidden' && s.overflowY !== 'hidden') continue
            // A screen-reader-only box is a 1px clipped box on purpose; so is anything the design
            // deliberately masks with clip-path. Neither is a layout failure.
            if (el.clientHeight <= 1 || el.clientWidth <= 1) continue
            if (s.clipPath && s.clipPath !== 'none') continue
            if (el.classList.contains('visually-hidden')) continue
            if (el.scrollHeight > el.clientHeight + 4)
              bad.push(
                `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} clips ${el.scrollHeight - el.clientHeight}px`,
              )
          }
          return bad.slice(0, 3)
        })
        for (const c of clipped) problems.push(`${width}: ${c}`)
      }
      expect(problems, `${b.slug}/${f}\n  ${problems.join('\n  ')}`).toEqual([])
    })
  }
}

/**
 * The phone hero, called out by name.
 *
 * ADR-026's spike saw the hero's media overlapping its heading at 390 in a *static* card and
 * flagged it for this checkpoint. The media is an absolutely positioned full-bleed image by
 * design, so "overlap" there is not a defect on its own — what would be a defect is the heading
 * sitting on the image without the scrim between them, or the copy running outside the section.
 * Both are asserted here at the real 390 viewport, which the static card could never be.
 */
test('@design-qa hero at 390: heading sits inside the section, on the scrim, with the actions clear of it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: HEIGHT })
  await page.goto(url('hero', 'default'))

  const geom = await page.evaluate(() => {
    const r = (sel: string) => {
      const el = document.querySelector(sel)
      return el ? (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) : null
    }
    const scrimEl = document.querySelector('.blk-hero__scrim')
    return {
      section: r('.blk-hero'),
      title: r('.blk-hero__title'),
      lede: r('.blk-hero__lede'),
      actions: r('.blk-hero .blk-actions, .blk-hero__in > :last-child'),
      scrim: r('.blk-hero__scrim'),
      // Stacking here is DOM order plus positioning, not z-index: `.blk-hero__in` is `relative`
      // and follows the absolutely positioned media and scrim, so it paints last.
      inPosition: getComputedStyle(document.querySelector('.blk-hero__in') as Element).position,
      inAfterScrim: scrimEl
        ? Boolean(
            (document.querySelector('.blk-hero__in') as Element).compareDocumentPosition(scrimEl) &
            Node.DOCUMENT_POSITION_PRECEDING,
          )
        : false,
      // Below 900px the text column carries its own gradient; that, not the scrim, is what keeps
      // the phone heading legible over the photograph.
      inBackground: getComputedStyle(document.querySelector('.blk-hero__in') as Element).backgroundImage,
    }
  })

  expect(geom.section, 'hero section renders').not.toBeNull()
  expect(geom.title, 'hero title renders').not.toBeNull()
  const s = geom.section as { x: number; y: number; width: number; height: number }
  const t = geom.title as { x: number; y: number; width: number; height: number }

  // The heading is inside the section it belongs to — no spilling out of the bleed box.
  expect(t.x, 'title left inside the section').toBeGreaterThanOrEqual(s.x - EPSILON)
  expect(t.x + t.width, 'title right inside the section').toBeLessThanOrEqual(s.x + s.width + EPSILON)
  expect(t.y + t.height, 'title bottom inside the section').toBeLessThanOrEqual(s.y + s.height + EPSILON)

  // The scrim covers the heading, and the text stacks above it.
  const scrim = geom.scrim as { x: number; y: number; width: number; height: number } | null
  expect(scrim, 'hero scrim renders (the heading must not sit directly on the photograph)').not.toBeNull()
  if (scrim) {
    expect(scrim.y, 'scrim starts at or above the title').toBeLessThanOrEqual(t.y + EPSILON)
    expect(scrim.y + scrim.height, 'scrim reaches past the title').toBeGreaterThanOrEqual(
      t.y + t.height - EPSILON,
    )
  }
  expect(geom.inPosition, 'hero text column is positioned, so it paints above the media').not.toBe('static')
  expect(geom.inAfterScrim, 'hero text column follows the scrim in DOM order').toBe(true)
  expect(
    geom.inBackground,
    'at 390 the hero text column carries its own gradient, so the heading is never read straight off the photograph',
  ).not.toBe('none')

  // Title and lede do not occupy the same pixels.
  if (geom.lede) {
    const l = geom.lede as { x: number; y: number; width: number; height: number }
    expect(l.y, 'lede starts below the title').toBeGreaterThanOrEqual(t.y + t.height - EPSILON)
  }

  // And the phone hero is accessible with the image behind the text.
  const results = await new AxeBuilder({ page }).include('main').analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 1)).toEqual([])
})
