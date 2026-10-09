import redirects from '../../content/release/legacy-image-redirects.json'

/**
 * LEGACY-IMG-REDIRECTS (IMG-SEO-1 phase A, CT 2026-10-08): the old WordPress image and file URLs (`/wp-content/uploads/...`) answer
 * 301 to the file this site serves today. The map is DATA (content/release/legacy-image-redirects.json, built from the media
 * manifests by ops/img-seo/build-legacy-image-redirects.ts); a URL that is in no manifest stays a 404.
 *
 * WordPress names one upload by several sizes, so the key drops the size: `-1024x768` and `-scaled` before the extension, and the
 * `.webp` that the WebP plugin appends to a jpg/png/gif name; then it is lower-cased and percent-decoded.
 */
export const LEGACY_UPLOADS_PREFIX = '/wp-content/uploads/'

export function legacyImageKey(pathname: string): string | undefined {
  let decoded = pathname.split(/[?#]/)[0] ?? ''
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    /* keep the written spelling */
  }
  const at = decoded.toLowerCase().indexOf(LEGACY_UPLOADS_PREFIX)
  if (at < 0) return undefined
  const rest = decoded
    .slice(at + LEGACY_UPLOADS_PREFIX.length)
    .toLowerCase()
    .replace(/(\.(?:jpe?g|png|gif))\.webp$/, '$1')
    .replace(/-(?:\d+x\d+)(?=\.[a-z0-9]+$)/, '')
    .replace(/-scaled(?=\.[a-z0-9]+$)/, '')
  return rest || undefined
}

const MAP = (redirects as { entries: Record<string, string> }).entries

/** The served path a legacy upload URL redirects to, or undefined (unknown: 404 as before). */
export function legacyImageTarget(pathname: string): string | undefined {
  if (!pathname.toLowerCase().includes(LEGACY_UPLOADS_PREFIX)) return undefined
  const key = legacyImageKey(pathname)
  return key ? MAP[key] : undefined
}
