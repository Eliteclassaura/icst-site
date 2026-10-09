import slugs from '../../content/release/image-slugs.json'

/**
 * IMG-SEO-1 phase B (CT 2026-10-08): descriptive public image URLs. Every public raster image has a physical file under public/media
 * (named by its hash) and a descriptive URL `/media/<slug>-<hash8>.<ext>`, built from data (content/release/image-slugs.json by
 * ops/img-seo/build-image-slugs.ts). Pages name the descriptive URL; the proxy rewrites it to the physical file and 301s the old
 * hash URL to it. Nothing is renamed on disk. Excluded from the map (they keep their URLs): the owner-protected testimonials media
 * (figma-testimonials, client-review), private staging captures, SVG, PDF, and the Payload media collection.
 */
const FORWARD = (slugs as { entries: Record<string, string> }).entries
const REVERSE = new Map<string, string>()
for (const [physical, url] of Object.entries(FORWARD)) if (!REVERSE.has(url)) REVERSE.set(url, physical)

const decode = (p: string): string => {
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}

/** The descriptive URL path of a physical public media path (`/media/salmon/<sha>.jpg`); undefined when it has none. */
export function descriptiveImagePath(physical: string): string | undefined {
  return FORWARD[decode(physical.split(/[?#]/)[0] ?? '')]
}
/** The path a page should name for an image: its descriptive URL, else the path unchanged (a query or fragment is kept). */
export function imageUrlPath(path: string): string {
  const at = path.search(/[?#]/)
  const base = at < 0 ? path : path.slice(0, at)
  const descriptive = FORWARD[decode(base)]
  return descriptive ? descriptive + (at < 0 ? '' : path.slice(at)) : path
}
/** The physical file behind a descriptive URL path; undefined when the path is not a descriptive image URL. */
export function physicalImagePath(pathname: string): string | undefined {
  return REVERSE.get(decode(pathname))
}

/**
 * A ledger loaded from content/design/*.json with every `src` (and the og default's `file`) named by its descriptive URL. Provenance
 * fields (`original.path`, `source.path`, `sha256`) are left alone: they name the physical file.
 */
export function withImageUrls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withImageUrls) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = (key === 'src' || key === 'file') && typeof v === 'string' && v.startsWith('/media/') ? imageUrlPath(v) : withImageUrls(v)
    }
    return out as T
  }
  return value
}
