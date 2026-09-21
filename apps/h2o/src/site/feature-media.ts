/**
 * H2O Phase 2D — the bounded Visual R2 media overlay.
 *
 * The 68 rows of `MEDIA_PLACEMENT_AUTHORITY.tsv` are frozen and are loaded by `media.ts`, which
 * this module does not touch. This module loads a *separate* file that adds further recovered
 * images for the designed regions the R2 presentation introduces, and records a presentation crop
 * for each.
 *
 * **Why a crop is part of the authority rather than part of the CSS.**
 *
 * Almost all of the recovered ICS imagery is a branded editorial slide: an authentic photograph of
 * a cooling tower with a headline, a logo badge or a URL bar composited over part of it. The
 * photograph is evidence; the composited headline is stale marketing furniture that would be wrong
 * to reproduce as site design. Cropping to the clean rectangle is the only way to use the evidence
 * honestly — and the alternative, generating a replacement image, is forbidden.
 *
 * So the crop is data, not styling. It is recorded as a fractional window of the native image,
 * carried through to the renderer, and checked here on load:
 *
 *   1. the window is inside the image and non-degenerate;
 *   2. `cropped_width` and `cropped_height` are what that window actually measures, so the numbers
 *      in the file cannot drift from the geometry they claim;
 *   3. `rendered_max_width_px <= cropped_width <= native_width`, so no upscaling can enter at
 *      either step;
 *   4. the file on disk still hashes to the recorded sha256 — the same check `media.ts` makes, for
 *      the same reason: a rendered image is provably the recovered original.
 *
 * Nothing here resamples a pixel. The binary is served as recovered; the window is applied by the
 * browser at paint time.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileForSrc } from './media'

const OVERLAY = 'PHASE2D_VISUAL_R2_MEDIA_OVERLAY.json'

export class FeatureMediaError extends Error {}

export type CropWindow = { x0: number; y0: number; x1: number; y1: number }

export type FeatureMedia = {
  alt: string
  altState: string
  attachmentId: string
  crop: CropWindow
  croppedHeight: number
  croppedWidth: number
  nativeHeight: number
  nativeWidth: number
  region: string
  renderedMaxWidthPx: number
  routeId: string
  sha256: string
  src: string
}

type Row = {
  alt_text: string
  alt_text_state: string
  attachment_id: string
  crop: CropWindow
  cropped_height: number
  cropped_width: number
  native_height: number
  native_width: number
  presentation_region: string
  rendered_max_width_px: number
  sha256: string
  src: string
  target_route_id: string
}

let cache: FeatureMedia[] | null = null

const overlayFile = (): string =>
  path.join(process.cwd(), 'content', '2d-launch-cohort', OVERLAY)

const load = (): FeatureMedia[] => {
  const doc = JSON.parse(readFileSync(overlayFile(), 'utf8')) as { additions?: Row[] }
  const rows = doc.additions ?? []
  return rows.map((row) => {
    const { x0, y0, x1, y1 } = row.crop
    if (!(x0 >= 0 && y0 >= 0 && x1 <= 1 && y1 <= 1 && x1 > x0 && y1 > y0)) {
      throw new FeatureMediaError(`${OVERLAY}: ${row.attachment_id} has a crop window outside the image`)
    }
    // The recorded pixel size must be what the window actually measures, so a hand-edited number
    // cannot quietly claim a larger rectangle than the fractions describe.
    const w = Math.round((x1 - x0) * row.native_width)
    const h = Math.round((y1 - y0) * row.native_height)
    if (w !== row.cropped_width || h !== row.cropped_height) {
      throw new FeatureMediaError(
        `${OVERLAY}: ${row.attachment_id} records a ${row.cropped_width}x${row.cropped_height} crop, the window measures ${w}x${h}`,
      )
    }
    if (row.rendered_max_width_px > row.cropped_width || row.cropped_width > row.native_width) {
      throw new FeatureMediaError(
        `${OVERLAY}: ${row.attachment_id} would render at ${row.rendered_max_width_px}px from a ${row.cropped_width}px crop of a ${row.native_width}px original — upscaling is not permitted`,
      )
    }
    const file = fileForSrc(row.src)
    if (file === null) throw new FeatureMediaError(`${OVERLAY}: ${row.src} is not a cohort media path`)
    const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
    if (actual !== row.sha256) {
      throw new FeatureMediaError(
        `${OVERLAY}: ${row.src} is ${actual}, the overlay records ${row.sha256}. The rendered image is not the recovered original.`,
      )
    }
    return {
      alt: row.alt_text,
      altState: row.alt_text_state,
      attachmentId: row.attachment_id,
      crop: row.crop,
      croppedHeight: row.cropped_height,
      croppedWidth: row.cropped_width,
      nativeHeight: row.native_height,
      nativeWidth: row.native_width,
      region: row.presentation_region,
      renderedMaxWidthPx: row.rendered_max_width_px,
      routeId: row.target_route_id,
      sha256: row.sha256,
      src: row.src,
    }
  })
}

export const featureMedia = (): FeatureMedia[] => {
  cache = cache ?? load()
  return cache
}

/** The feature image for a named presentation region on a route, or null. */
export const featureFor = (routeId: string, region: string): FeatureMedia | null =>
  featureMedia().find((m) => m.routeId === routeId && m.region === region) ?? null

/** Every feature image bound to a route, in overlay order. */
export const featuresForRoute = (routeId: string): FeatureMedia[] =>
  featureMedia().filter((m) => m.routeId === routeId)

export const resetFeatureMediaCache = (): void => {
  cache = null
}
