/**
 * R2.3 (Control Tower 2026-10-05, pre-cutover): the URLs a page names in its head — social tags and structured data — name
 * this site, never the hosts the content was imported from. The imported documents carry the Salmon staging host
 * (salmon-rhinoceros-754457.hostingersite.com) and the legacy WordPress host (h2ocooling.com/wp-content/…) in og:image,
 * og:url, JSON-LD @id/url values and the like.
 *
 * - Identity and page URLs (@id, og:url, page links) take the canonical origin (PUBLIC_ORIGIN, as canonical links do).
 * - Media URLs take the serving origin (NEXT_PUBLIC_SERVER_URL; the canonical origin when unset) and the served media path,
 *   so they resolve on staging and in production alike. A media URL with nothing held is dropped, never left pointing at a
 *   host that goes away. C1–C6 crop/withhold rulings apply.
 * - Allowlisted third parties (schema.org vocabulary, the company's social profiles, Typeform while it remains) are kept;
 *   any other host is dropped.
 */
import { PUBLIC_ORIGIN } from '../content/config'
import { publicFileExists } from '../content/public-files'
import { heldMediaForUrl, salmonMediaPath, socialImageOverride } from './salmon'

export const LEGACY_HOSTS: ReadonlySet<string> = new Set(['salmon-rhinoceros-754457.hostingersite.com', 'h2ocooling.com', 'www.h2ocooling.com'])
export const HEAD_THIRD_PARTY_HOSTS: ReadonlySet<string> = new Set(['schema.org', 'www.facebook.com', 'facebook.com', 'www.linkedin.com', 'linkedin.com', 'form.typeform.com', 'typeform.com'])
const MEDIA_PATH = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|pdf)$/i

/** The origin this deployment serves from (media URLs); the canonical origin where none is configured. */
export const servedOrigin = (): string => {
  const configured = process.env.NEXT_PUBLIC_SERVER_URL
  if (configured)
    try {
      const u = new URL(configured)
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin
    } catch {
      /* fall through */
    }
  return PUBLIC_ORIGIN
}
/** The origins a rendered head may name (the guard's allowlist besides the third parties). */
export const headOrigins = (): string[] => [...new Set([PUBLIC_ORIGIN, servedOrigin()])]

const absolute = (value: string): URL | undefined => {
  if (!/^https?:\/\//i.test(value)) return undefined
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}
export type HeadImage = { url: string; width?: number; height?: number; type?: string; sha256?: string }
/** A page's rule for the images its head may name (e.g. a project page names only its own verified photo); null = none. */
export type HeadImagePolicy = (image: HeadImage) => HeadImage | null
const keep: HeadImagePolicy = (image) => image
const typeOf = (p: string) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml' })[p.split('.').pop()!.toLowerCase()]

/** A legacy media URL as this site serves it, or null when nothing is held (or the tile is withheld). */
export function publicMediaUrl(value: string, policy: HeadImagePolicy = keep): HeadImage | null {
  const image = servedImage(value)
  return image && policy(image)
}
function servedImage(value: string): HeadImage | null {
  const u = absolute(value)
  if (!u) return null
  const ruled = socialImageOverride(value)
  if (ruled?.action === 'withhold') return null
  if (ruled?.action === 'crop') return { url: servedOrigin() + ruled.path, width: ruled.width, height: ruled.height, type: typeOf(ruled.path), sha256: ruled.path.match(/[0-9a-f]{64}/)?.[0] }
  const held = heldMediaForUrl(value)
  const served = held && salmonMediaPath(held)
  if (served) return { url: servedOrigin() + served, width: held.width, height: held.height, type: typeOf(served), sha256: held.sha256 }
  if (LEGACY_HOSTS.has(u.hostname.toLowerCase()) && publicFileExists(u.pathname)) return { url: servedOrigin() + u.pathname, type: typeOf(u.pathname) }
  return null
}

/** A URL in a page's head as this site names it; null = drop it; undefined = not an absolute URL (keep the value). */
export function publicHeadUrl(value: string, policy: HeadImagePolicy = keep): string | null | undefined {
  const u = absolute(value)
  if (!u) return undefined
  const host = u.hostname.toLowerCase()
  if (HEAD_THIRD_PARTY_HOSTS.has(host)) return value
  if (!LEGACY_HOSTS.has(host)) return null
  if (MEDIA_PATH.test(u.pathname) || /^\/(?:wp-content|content)\/uploads\//.test(u.pathname)) return publicMediaUrl(value, policy)?.url ?? null
  return PUBLIC_ORIGIN + u.pathname + u.search + u.hash
}

const DROP = Symbol('drop')
/** Structured data with every URL as this site names it: an unresolvable image (or a reference to one) is dropped. */
export function publicSchema(value: unknown, policy: HeadImagePolicy = keep): unknown {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = publicHeadUrl(v, policy)
      return r === undefined ? v : r === null ? DROP : r
    }
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== DROP)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const isImage = o['@type'] === 'ImageObject'
      const ref = typeof o['@id'] === 'string' && Object.keys(o).length === 1
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(o)) {
        const w = walk(x)
        if (w === DROP) {
          // an image whose file is not held, or a bare reference to a dropped node, goes with it
          if (ref || (isImage && ['@id', 'url', 'contentUrl'].includes(k))) return DROP
          continue
        }
        out[k] = w
      }
      if (isImage && typeof o.url === 'string') {
        const img = publicMediaUrl(o.url, policy)
        if (img?.width && 'width' in o) out.width = typeof o.width === 'number' ? img.width : String(img.width)
        if (img?.height && 'height' in o) out.height = typeof o.height === 'number' ? img.height : String(img.height)
      }
      return out
    }
    return v
  }
  const r = walk(value)
  return r === DROP ? null : r
}

const IMAGE_META = /^(?:og:image|og:image:secure_url|og:image:url|twitter:image|msapplication-TileImage)$/
/** The page's meta tags with every URL as this site names it; og:image's size/type follow the served file, or go with it. */
export function publicMeta(meta: ReadonlyArray<{ name: string; value: string }>, policy: HeadImagePolicy = keep): Array<{ name: string; value: string }> {
  const og = meta.find((m) => m.name === 'og:image')
  const ogImage = og ? publicMediaUrl(og.value, policy) : undefined
  return meta.flatMap((m) => {
    if (IMAGE_META.test(m.name)) {
      if (!absolute(m.value)) return [m]
      const img = publicMediaUrl(m.value, policy)
      return img ? [{ ...m, value: img.url }] : []
    }
    if (/^og:image:/.test(m.name)) {
      if (og && !ogImage) return [] // the image is gone: so are its width, height, type and alt
      if (m.name === 'og:image:width' && ogImage?.width) return [{ ...m, value: String(ogImage.width) }]
      if (m.name === 'og:image:height' && ogImage?.height) return [{ ...m, value: String(ogImage.height) }]
      if (m.name === 'og:image:type' && ogImage?.type) return [{ ...m, value: ogImage.type }]
      return [m]
    }
    const r = publicHeadUrl(m.value, policy)
    if (r === undefined) return [m]
    return r === null ? [] : [{ ...m, value: r }]
  })
}
