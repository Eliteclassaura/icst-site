/**
 * SEC-MAIN-1.1 (security audit R1; CT GO): upload stored-file fields only from an uploaded file, and media files served as
 * sandboxed, inert documents. Unit level; the DB suite (`src/content/__dbtests__/media-guard.dbtest.ts`) runs both through
 * the real REST handlers.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { Media } from '@factory/agency-core/cms/foundation'
import { ProductDocumentFiles, ProductMedia } from '../../collections'
import { guardUploadFileFields, isMediaFileSlug, MEDIA_FILE_HEADERS, withMediaFileHeaders, withUploadGuard } from '../upload-guard'

type Doc = Record<string, unknown>
const APP = path.resolve(__dirname, '..', '..', '..')
const STORED = { id: 7, filename: 'tower.jpg', url: '/api/media/file/tower.jpg', mimeType: 'image/jpeg', filesize: 1234, alt: 'old' }
const run = async (operation: string, data: Doc | undefined, opts: { file?: unknown; id?: string | number } = {}) => {
  const findByID = vi.fn(async () => STORED)
  const req = { file: opts.file, payload: { findByID } } as unknown as PayloadRequest
  const out = (await (guardUploadFileFields as (a: unknown) => Promise<unknown>)({ args: { data, id: opts.id, req }, collection: { slug: 'media' }, operation, req })) as { data?: Doc }
  return { data: out.data, findByID }
}

describe('upload stored-file fields come only from an uploaded file', () => {
  it("a metadata PATCH with filename '../probe.txt' is ignored: the stored file identity stays", async () => {
    const { data } = await run('update', { alt: 'new', filename: '../probe.txt', url: 'https://evil.example/x', mimeType: 'text/html', filesize: 1, sizes: { w480: { filename: '../x' } } }, { id: 7 })
    expect(data).toEqual({ alt: 'new', filename: 'tower.jpg', url: '/api/media/file/tower.jpg', mimeType: 'image/jpeg', filesize: 1234 })
  })
  it('a bulk metadata update drops the fields (Payload keeps each stored value)', async () => {
    const { data, findByID } = await run('update', { alt: 'x', filename: '../probe.txt', thumbnailURL: '/x', prefix: '../' })
    expect(data).toEqual({ alt: 'x' })
    expect(findByID).not.toHaveBeenCalled()
  })
  it('a create without a file cannot name a stored file', async () => {
    expect((await run('create', { alt: 'x', rights: 'owned', filename: '../probe.txt', url: 'https://evil.example/x' })).data).toEqual({ alt: 'x', rights: 'owned' })
  })
  it('a normal upload (a file in the request) is unaffected', async () => {
    const data = { alt: 'x', rights: 'owned', filename: 'new.jpg' }
    const out = await run('create', data, { file: { name: 'new.jpg', data: Buffer.from('x'), mimetype: 'image/jpeg', size: 1 } })
    expect(out.data).toBe(data)
    expect((await run('update', data, { id: 7, file: { name: 'new.jpg' } })).data).toBe(data)
  })
  it('a metadata edit without stored-file fields, and other operations, pass untouched', async () => {
    const data = { alt: 'only alt', focalX: 40 }
    const out = await run('update', data, { id: 7 })
    expect(out.data).toBe(data)
    expect(out.findByID).not.toHaveBeenCalled()
    expect((await run('read', { filename: '../x' })).data).toEqual({ filename: '../x' })
  })
  it('every upload collection registers the guard first (media, product media, product document files); others are untouched', () => {
    for (const c of [Media, ProductMedia('/tmp/m'), ProductDocumentFiles('/tmp/m')]) expect(withUploadGuard(c).hooks?.beforeOperation?.[0], c.slug).toBe(guardUploadFileFields)
    const plain = { slug: 'x', fields: [] }
    expect(withUploadGuard(plain)).toBe(plain)
    expect(readFileSync(path.join(APP, 'src/payload.config.ts'), 'utf8')).toMatch(/\]\.map\(withUploadGuard\)/)
  })
})

describe('/api/media/file/* is a sandboxed, inert document', () => {
  it('matches the media file route only', () => {
    expect(isMediaFileSlug(['media', 'file', 'tower.svg'])).toBe(true)
    expect(isMediaFileSlug(['media', 'file'])).toBe(false)
    expect(isMediaFileSlug(['media', '7'])).toBe(false)
    expect(isMediaFileSlug(['product-media', 'file', 'x.jpg'])).toBe(false)
  })
  it("adds CSP sandbox; default-src 'none' and nosniff, keeping status, type and body", async () => {
    const res = withMediaFileHeaders(new Response('<svg/>', { status: 200, headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' } }))
    expect(res.headers.get('Content-Security-Policy')).toBe("sandbox; default-src 'none'")
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<svg/>')
    expect(withMediaFileHeaders(new Response(null, { status: 304 })).status).toBe(304)
    expect(MEDIA_FILE_HEADERS).toEqual({ 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' })
  })
  it('the REST route applies it to every method', () => {
    const route = readFileSync(path.join(APP, 'src/app/(payload)/api/[...slug]/route.ts'), 'utf8')
    expect(route).toContain('return isMediaFileSlug(slug) ? withMediaFileHeaders(res) : res')
  })
  it("the public site does not embed media as documents (iframe/object/embed), so the sandbox only affects a file opened directly; <img> ignores a response CSP", () => {
    for (const f of ['src/site/SalmonPresentation.tsx', 'src/site/SalmonCanonical.tsx', 'src/content/compose.ts'])
      expect(readFileSync(path.join(APP, f), 'utf8'), f).not.toMatch(/<(?:iframe|object|embed)[^>]*\/api\/media\/file/)
  })
})
