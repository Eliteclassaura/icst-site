import path from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { payload, rest, user, type TestUser } from '../../crm/__dbtests__/harness'
import { GET } from '../../app/(payload)/api/[...slug]/route'

/**
 * SEC-MAIN-1.1 against the isolated synthetic database, through the app's real REST handlers: a metadata PATCH cannot move
 * a media record's stored file, and /api/media/file/* is served sandboxed. Synthetic image only.
 */
type Doc = Record<string, unknown>
let editor: TestUser
let media: Doc

beforeAll(async () => {
  editor = await user('editor')
  const file = path.join(tmpdir(), `sec-main-1-1-${Date.now()}.png`)
  await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toFile(file)
  media = (await (await payload()).create({ collection: 'media', data: { alt: 'Synthetic upload guard image', rights: 'owned' } as never, filePath: file, user: editor.user as never, overrideAccess: false })) as unknown as Doc
})

describe('upload guard (media)', () => {
  it("a metadata PATCH with filename '../probe.txt' is ignored; the alt change applies", async () => {
    const res = await rest.patch(`media/${media.id}`, editor.token, { alt: 'Synthetic upload guard image (edited)', filename: '../probe.txt', url: 'https://evil.example/x', mimeType: 'text/html' })
    expect(res.status).toBe(200)
    const after = (await (await payload()).findByID({ collection: 'media', id: String(media.id), depth: 0, overrideAccess: true })) as unknown as Doc
    expect(after).toMatchObject({ alt: 'Synthetic upload guard image (edited)', filename: media.filename, url: media.url, mimeType: media.mimeType })
  })
  it('the file is served with CSP sandbox and nosniff', async () => {
    const name = String(media.filename)
    const res = await GET(new Request(`http://127.0.0.1:3200/api/media/file/${name}`), { params: Promise.resolve({ slug: ['media', 'file', name] }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^image\//)
    expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
