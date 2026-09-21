/**
 * H2O Phase 2D — the bounded Visual R2 media overlay, tested as an authority.
 *
 * The overlay adds images and records a crop for each. The risks it introduces are specific, and
 * these tests are aimed at them rather than at the loader's happy path:
 *
 *   - a crop that is not a crop: a window that claims a larger rectangle than it measures, or a
 *     rendered width above the window, either of which would reintroduce upscaling by arithmetic;
 *   - a placement that alters the frozen 68, directly or by shadowing one;
 *   - a binary that is not the recovered original;
 *   - alt text that asserts something the photograph cannot show.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cohort } from '../cohort'
import { featureMedia, FeatureMediaError, featureFor } from '../feature-media'
import { fileForSrc, mediaFor } from '../media'

const CONTENT = path.join(process.cwd(), 'content', '2d-launch-cohort')
const overlay = JSON.parse(
  readFileSync(path.join(CONTENT, 'PHASE2D_VISUAL_R2_MEDIA_OVERLAY.json'), 'utf8'),
) as {
  additions: Array<{
    alt_text: string
    attachment_id: string
    binary_altered: string
    crop: { x0: number; x1: number; y0: number; y1: number }
    cropped_height: number
    cropped_width: number
    native_height: number
    native_width: number
    presentation_region: string
    project_or_product_identity: string
    rendered_max_width_px: number
    sha256: string
    source_uploads_rel_path: string
    src: string
    target_route_id: string
    upscaled: string
  }>
}

describe('the overlay adds placements and changes none', () => {
  it('loads every addition', () => {
    expect(featureMedia().length).toBe(overlay.additions.length)
    expect(featureMedia().length).toBeGreaterThan(0)
  })

  it('leaves all 68 frozen placements loading and hash-verified', () => {
    let placed = 0
    for (const page of cohort()) placed += mediaFor(page.routeId).length
    expect(placed).toBe(68)
  })

  it('binds every addition to a route of the accepted cohort', () => {
    const ids = new Set(cohort().map((p) => p.routeId))
    for (const m of featureMedia()) expect(ids.has(m.routeId)).toBe(true)
  })

  it('gives each route-and-region pair exactly one image', () => {
    const seen = new Set<string>()
    for (const m of featureMedia()) {
      const key = `${m.routeId}|${m.region}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      expect(featureFor(m.routeId, m.region)?.attachmentId).toBe(m.attachmentId)
    }
  })
})

describe('every crop is a crop', () => {
  it('records a window inside the image, measured correctly', () => {
    for (const row of overlay.additions) {
      const { x0, y0, x1, y1 } = row.crop
      expect(x0).toBeGreaterThanOrEqual(0)
      expect(y0).toBeGreaterThanOrEqual(0)
      expect(x1).toBeLessThanOrEqual(1)
      expect(y1).toBeLessThanOrEqual(1)
      expect(x1).toBeGreaterThan(x0)
      expect(y1).toBeGreaterThan(y0)
      expect(Math.round((x1 - x0) * row.native_width)).toBe(row.cropped_width)
      expect(Math.round((y1 - y0) * row.native_height)).toBe(row.cropped_height)
    }
  })

  it('never renders above the window, and the window is never above the native image', () => {
    for (const row of overlay.additions) {
      expect(row.rendered_max_width_px).toBeLessThanOrEqual(row.cropped_width)
      expect(row.cropped_width).toBeLessThanOrEqual(row.native_width)
      expect(row.cropped_height).toBeLessThanOrEqual(row.native_height)
      expect(row.upscaled).toBe('NO')
      expect(row.binary_altered).toBe('NO')
    }
  })

  it('exports the error a bad window would throw', () => {
    expect(new FeatureMediaError('x')).toBeInstanceOf(Error)
  })
})

describe('every binary is the recovered original', () => {
  it('hashes to the recorded sha256, on disk', () => {
    for (const row of overlay.additions) {
      const file = fileForSrc(row.src)
      expect(file).not.toBeNull()
      const actual = createHash('sha256').update(readFileSync(file as string)).digest('hex')
      expect(actual).toBe(row.sha256)
    }
  })

  it('records where each file came from', () => {
    for (const row of overlay.additions) {
      expect(row.source_uploads_rel_path).toMatch(/^\d{4}\/\d{2}\//)
    }
  })
})

describe('alt text asserts nothing the photograph cannot show', () => {
  const FORBIDDEN =
    /\bISO\b|\bcertifi|\baccredited\b|\bproject\b|\bcustomer\b|\bclient\b|\bMW\b|\b\d{1,3}\s?%|\bworld[- ]?class\b|\bbest\b|\blargest\b/i
  it('carries no certification, project, customer or performance assertion', () => {
    for (const row of overlay.additions) {
      expect(row.alt_text.length).toBeGreaterThan(40)
      expect(row.alt_text).not.toMatch(FORBIDDEN)
      expect(row.project_or_product_identity).toBe('NONE_ASSERTED')
    }
  })

  it('repeats no term more than three times', () => {
    for (const row of overlay.additions) {
      const counts = new Map<string, number>()
      for (const word of row.alt_text.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
        counts.set(word, (counts.get(word) ?? 0) + 1)
      }
      for (const [, n] of counts) expect(n).toBeLessThanOrEqual(3)
    }
  })
})
