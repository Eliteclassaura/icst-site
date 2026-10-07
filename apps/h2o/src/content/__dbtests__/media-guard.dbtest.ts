import { existsSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { payload, rest, user, type TestUser } from '../../crm/__dbtests__/harness'
import { GET } from '../../app/(payload)/api/[...slug]/route'

/**
 * SEC-MAIN-1.1 against the isolated synthetic database, through the app's real REST handlers: a metadata PATCH cannot move
 * a media record's stored file, and /api/media/file/* is served sandboxed. Synthetic image only.
 *
 * SEC-MAIN-1.2 (CT ruling 2026-10-07): Payload 3.90 sanitises upload data before any hook and answers a traversal filename
 * with 400 "Invalid filename." — accepted, safer; the app's guard stays as a second layer. So a traversal PATCH may be
 * rejected (4xx) or ignored (2xx); either way the stored file identity is unchanged and nothing is written outside uploads.
 */
type Doc = Record<string, unknown>
const FILE_FIELDS = ['filename', 'url', 'mimeType', 'filesize'] as const
let editor: TestUser
let media: Doc
let staticDir = ''

const stored = async () => (await (await payload()).findByID({ collection: 'media', id: String(media.id), depth: 0, overrideAccess: true })) as unknown as Doc
const identity = (d: Doc) => Object.fromEntries(FILE_FIELDS.map((k) => [k, d[k]]))

beforeAll(async () => {
  editor = await user('editor')
  const file = path.join(tmpdir(), `sec-main-1-1-${Date.now()}.png`)
  await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toFile(file)
  media = (await (await payload()).create({ collection: 'media', data: { alt: 'Synthetic upload guard image', rights: 'owned' } as never, filePath: file, user: editor.user as never, overrideAccess: false })) as unknown as Doc
  staticDir = String(((await payload()).collections.media.config.upload as { staticDir?: string }).staticDir ?? '')
})

describe('upload guard (media)', () => {
  it("a traversal PATCH (filename '../probe.txt', no file) is rejected or ignored; the stored file is unchanged", async () => {
    const outside = path.resolve(staticDir, '..', 'probe.txt')
    const existedBefore = existsSync(outside)
    const res = await rest.patch(`media/${media.id}`, editor.token, { alt: 'Synthetic traversal attempt', filename: '../probe.txt', url: 'https://evil.example/x', mimeType: 'text/html', filesize: 1 })
    expect((res.status >= 200 && res.status < 300) || (res.status >= 400 && res.status < 500), `status ${res.status}`).toBe(true)
    expect(identity(await stored())).toEqual(identity(media))
    expect(existsSync(outside)).toBe(existedBefore)
  })
  it('a safe metadata-only update (no file) succeeds: alt changes, the stored file identity does not', async () => {
    const res = await rest.patch(`media/${media.id}`, editor.token, { alt: 'Synthetic upload guard image (edited)' })
    expect(res.status).toBe(200)
    const after = await stored()
    expect(after.alt).toBe('Synthetic upload guard image (edited)')
    expect(identity(after)).toEqual(identity(media))
  })
  it('a metadata update that also names another safe filename (no file) succeeds and keeps the stored file', async () => {
    const res = await rest.patch(`media/${media.id}`, editor.token, { alt: 'Synthetic upload guard image (renamed?)', filename: 'other-name.png', url: 'https://evil.example/other-name.png' })
    expect(res.status).toBe(200)
    const after = await stored()
    expect(after.alt).toBe('Synthetic upload guard image (renamed?)')
    expect(identity(after)).toEqual(identity(media))
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
