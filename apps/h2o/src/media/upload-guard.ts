import type { CollectionBeforeOperationHook, CollectionConfig } from 'payload'

/**
 * SEC-MAIN-1.1 (security audit R1, media.filename-field-writable-path-traversal; CT GO): an upload's stored-file fields
 * come from the uploaded file, never from the request body.
 *
 * Payload reads `filename` / `url` from the incoming data before any `beforeChange` hook runs (to re-crop a stored file),
 * so this is a `beforeOperation` hook: on a create or update **without a file in the request**, the stored-file fields are
 * dropped from the incoming data. On a single-document update they are put back to the stored values, so a focal-point or
 * crop edit still re-crops the record's own file. Every other field (alt, rights, caption, focal point …) is untouched,
 * and an upload with a file is untouched.
 */
export const UPLOAD_FILE_FIELDS = ['filename', 'url', 'thumbnailURL', 'mimeType', 'filesize', 'width', 'height', 'sizes', 'prefix'] as const
const PINNED = ['filename', 'url', 'mimeType', 'filesize'] as const

export const guardUploadFileFields: CollectionBeforeOperationHook = async ({ args, collection, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return args
  const a = args as { data?: Record<string, unknown>; id?: string | number }
  if (req.file || !a.data || typeof a.data !== 'object') return args
  if (!UPLOAD_FILE_FIELDS.some((k) => Object.prototype.hasOwnProperty.call(a.data, k))) return args
  const data = { ...a.data }
  for (const k of UPLOAD_FILE_FIELDS) delete data[k]
  if (operation === 'update' && a.id != null) {
    const stored = (await req.payload.findByID({ collection: collection.slug as never, id: a.id, depth: 0, overrideAccess: true, req, disableErrors: true })) as Record<string, unknown> | null
    for (const k of PINNED) if (stored?.[k] != null) data[k] = stored[k]
  }
  return { ...args, data } as typeof args
}

/** Every upload collection gets the guard first, before its own hooks. */
export const withUploadGuard = (c: CollectionConfig): CollectionConfig =>
  c.upload ? { ...c, hooks: { ...c.hooks, beforeOperation: [guardUploadFileFields, ...(c.hooks?.beforeOperation ?? [])] } } : c

/**
 * SEC-MAIN-1.1 (security audit R1, media.public-listing-and-svg; CT GO): a media file opened directly is a sandboxed,
 * inert document (an SVG cannot run script on this origin). `<img>` embedding ignores the response CSP, so the public
 * site's images are unaffected.
 */
export const MEDIA_FILE_HEADERS = { 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' } as const
export const isMediaFileSlug = (slug: readonly string[] | undefined): boolean => slug?.[0] === 'media' && slug[1] === 'file' && slug.length >= 3

export function withMediaFileHeaders(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(MEDIA_FILE_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
