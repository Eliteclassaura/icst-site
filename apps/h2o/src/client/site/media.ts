import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { clientsRoot } from './content'

/**
 * Client media, served from a baked, listed folder (no CMS upload, no public upload).
 *
 * `clients/<slug>/media/MEDIA_INDEX.json` is the allow-list: `{ sections: { uploads: { files: { "2025/03/a.jpg": { sha256, bytes } } }, brand: {...} } }`.
 *   - `uploads`  files live in `media/wp-content/uploads/` and are served at their ORIGINAL live paths `/wp-content/uploads/<key>`
 *     (image URLs and image rankings do not change);
 *   - `brand`    files live in `media/brand/` and are served at `/brand-media/<key>` (hero and brand images).
 * Only an exact key of the index is served. Anything else, a directory, a dot path, a symlink or an unlisted extension is a 404:
 * no directory listing, nothing outside the list.
 */

export type MediaSection = 'uploads' | 'brand'
export type MediaIndex = { sections: Record<MediaSection, { files: Record<string, { sha256: string; bytes: number }> }> }

const SECTION_DIR: Record<MediaSection, string> = { uploads: path.join('media', 'wp-content', 'uploads'), brand: path.join('media', 'brand') }

// Raster images only. SVG is deliberately absent (it can carry script), and so is everything else.
export const MEDIA_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

const cache = new Map<string, MediaIndex | null>()
const verified = new Set<string>() // files whose bytes matched their listed hash once in this process

export function loadMediaIndex(slug: string, root: string = clientsRoot()): MediaIndex | null {
  const key = `${root}\0${slug}`
  if (cache.has(key)) return cache.get(key) ?? null
  let idx: MediaIndex | null = null
  try {
    const raw = JSON.parse(readFileSync(path.join(root, slug, 'media', 'MEDIA_INDEX.json'), 'utf8')) as Partial<MediaIndex>
    if (raw && raw.sections && raw.sections.uploads && raw.sections.brand) idx = raw as MediaIndex
  } catch {
    idx = null
  }
  cache.set(key, idx)
  return idx
}
export function resetMediaCache(): void {
  cache.clear()
  verified.clear()
}

/** The index key for the request segments, or null if the segments could not name a listed file. Pure: no file-system access. */
export function mediaKey(segments: readonly string[]): string | null {
  if (segments.length === 0 || segments.length > 12) return null
  const parts: string[] = []
  for (const raw of segments) {
    let s: string
    try {
      s = decodeURIComponent(raw)
    } catch {
      return null
    }
    // No empty or dot segments, no separators, no control characters, no NUL, no backslash.
    if (!s || s.startsWith('.') || /[\\/\u0000-\u001f\u007f]/.test(s) || s.length > 200) return null
    parts.push(s)
  }
  return parts.join('/')
}

export type MediaHit = { file: string; type: string; sha256: string; bytes: number }

/** Resolve a request to a listed file on disk, or null. */
export function resolveMedia(section: MediaSection, segments: readonly string[], slug: string, root: string = clientsRoot()): MediaHit | null {
  const idx = loadMediaIndex(slug, root)
  if (!idx) return null
  const key = mediaKey(segments)
  if (!key) return null
  const files = idx.sections[section].files
  if (!Object.prototype.hasOwnProperty.call(files, key)) return null
  const type = MEDIA_TYPES[path.extname(key).toLowerCase()]
  if (!type) return null
  const base = path.join(root, slug, SECTION_DIR[section])
  const file = path.join(base, ...key.split('/'))
  if (!file.startsWith(base + path.sep)) return null
  try {
    const st = lstatSync(file) // lstat: a symlink is refused
    if (!st.isFile()) return null
  } catch {
    return null
  }
  const entry = files[key]!
  return { file, type, sha256: entry.sha256, bytes: entry.bytes }
}

const HEADERS = {
  'Cache-Control': 'public, max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const

export function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' } })
}

/** The GET handler body shared by both media routes. */
export function serveMedia(section: MediaSection, segments: readonly string[], slug: string, ifNoneMatch: string | null, root: string = clientsRoot()): Response {
  const hit = resolveMedia(section, segments, slug, root)
  if (!hit) return notFound()
  const etag = `"${hit.sha256.slice(0, 32)}"`
  if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === etag)) return new Response(null, { status: 304, headers: { ...HEADERS, ETag: etag } })
  const body = readFileSync(hit.file)
  // The bytes on disk must be the bytes that were listed (the sync step recorded the hash); a mismatch is a 404, never a served file.
  const vk = `${hit.file}\0${hit.sha256}`
  if (!verified.has(vk)) {
    if (body.length !== hit.bytes || createHash('sha256').update(body).digest('hex') !== hit.sha256) return notFound()
    verified.add(vk)
  }
  return new Response(new Uint8Array(body), { status: 200, headers: { ...HEADERS, 'Content-Type': hit.type, 'Content-Length': String(body.length), ETag: etag } })
}
