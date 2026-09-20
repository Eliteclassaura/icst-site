/**
 * H2O Phase 2D — cohort media placement, loaded from the accepted authority file.
 *
 * Nothing here chooses an image. `MEDIA_PLACEMENT_AUTHORITY.tsv` is the decision record produced by
 * the cohort media recovery pass: every row names a recovered binary, the WordPress attachment it
 * came from, the route its `post_parent` associates it with, the role a human inspection assigned
 * it, and the alt text proposed from what the image was observed to depict.
 *
 * Two properties are structural rather than procedural:
 *
 *   1. **Each file is hashed on load** and compared with the `sha256` the authority records. A
 *      substituted or re-encoded image fails the build, so a rendered image is provably the
 *      recovered original.
 *   2. **`rendered_max_width_px` never exceeds `native_width`.** That is asserted here, so no image
 *      can be upscaled by a placement decision; a low-resolution asset renders small or not at all.
 *
 * Alt text is `PROPOSED_FOR_PRIVATE_PREVIEW`. It authorizes local rendering and nothing else: no
 * Payload, database or media-metadata write is performed by this module or by anything it feeds.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const AUTHORITY = 'MEDIA_PLACEMENT_AUTHORITY.tsv'

/**
 * Every placement resolves inside this one directory, and the authority may not point anywhere
 * else. That is both a safety property — an authority row cannot name a file outside the recovered
 * cohort media — and what lets the build's static tracer scope the read to a subfolder instead of
 * tracing the whole project.
 */
const MEDIA_PREFIX = '/media/cohort/'

/**
 * Both paths are built inline from `process.cwd()` rather than memoized in a module constant. That
 * is deliberate twice over: the working directory is read at call time, so a test can point the
 * module at another tree and the verification below actually applies to that tree; and the build's
 * static tracer can see the literal subfolder, so it scopes the traced input to the cohort media
 * directory instead of the whole project.
 */
export const fileForSrc = (src: string): string | null => {
  if (!src.startsWith(MEDIA_PREFIX)) return null
  const name = src.slice(MEDIA_PREFIX.length)
  if (name === '' || name !== path.basename(name)) return null
  return path.join(process.cwd(), 'public', 'media', 'cohort', name)
}

const authorityFile = (): string => path.join(process.cwd(), 'content', '2d-launch-cohort', AUTHORITY)

export type MediaRole = 'HERO' | 'INLINE'

export type PlacedMedia = {
  alt: string
  altState: string
  attachmentId: string
  height: number
  renderedMaxWidthPx: number
  role: MediaRole
  sha256: string
  src: string
  width: number
}

let byRoute: Map<string, PlacedMedia[]> | null = null

const verifiedSha = (src: string): string => {
  const file = fileForSrc(src)
  if (file === null)
    throw new Error(`${AUTHORITY}: ${src} is not a file under ${MEDIA_PREFIX}; refusing to read it`)
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

const load = (): Map<string, PlacedMedia[]> => {
  const text = readFileSync(authorityFile(), 'utf8')
  const lines = text.split('\n').filter((line) => line !== '')
  const header = (lines[0] ?? '').split('\t')
  const out = new Map<string, PlacedMedia[]>()

  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const row: Record<string, string> = {}
    header.forEach((name, i) => {
      row[name] = cells[i] ?? ''
    })

    const role = row.role === 'HERO' ? 'HERO' : 'INLINE'
    const width = Number(row.native_width)
    const rendered = Number(row.rendered_max_width_px)

    if (!Number.isFinite(width) || width <= 0)
      throw new Error(`${AUTHORITY}: ${row.attachment_id} has no usable native width`)
    if (!Number.isFinite(rendered) || rendered <= 0 || rendered > width)
      throw new Error(
        `${AUTHORITY}: ${row.attachment_id} would render at ${rendered}px from a ${width}px original — upscaling is not permitted`,
      )

    const actual = verifiedSha(row.src)
    if (actual !== row.sha256)
      throw new Error(
        `${AUTHORITY}: ${row.src} is ${actual}, the authority records ${row.sha256}. The rendered image is not the recovered original.`,
      )

    const placed: PlacedMedia = {
      alt: row.alt_text,
      altState: row.alt_text_state,
      attachmentId: row.attachment_id,
      height: Number(row.native_height),
      renderedMaxWidthPx: rendered,
      role,
      sha256: row.sha256,
      src: row.src,
      width,
    }
    out.set(row.route_id, [...(out.get(row.route_id) ?? []), placed])
  }
  return out
}

/** Every placement for a route, hero first, in the authority's render order. */
export const mediaFor = (routeId: string): PlacedMedia[] => {
  byRoute = byRoute ?? load()
  return byRoute.get(routeId) ?? []
}

export const heroFor = (routeId: string): PlacedMedia | null =>
  mediaFor(routeId).find((m) => m.role === 'HERO') ?? null

export const inlineFor = (routeId: string): PlacedMedia[] =>
  mediaFor(routeId).filter((m) => m.role === 'INLINE')

export const resetMediaCache = (): void => {
  byRoute = null
}
