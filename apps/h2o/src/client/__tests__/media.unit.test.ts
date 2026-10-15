import { mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadMediaIndex, mediaKey, resetMediaCache, resolveMedia, serveMedia } from '../site/media'

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9])

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'media-test-'))
  const up = path.join(root, 'acme', 'media', 'wp-content', 'uploads', '2025', '03')
  const br = path.join(root, 'acme', 'media', 'brand', 'hero')
  mkdirSync(up, { recursive: true })
  mkdirSync(br, { recursive: true })
  writeFileSync(path.join(up, 'a.jpg'), JPG)
  writeFileSync(path.join(up, 'unlisted.jpg'), JPG)
  writeFileSync(path.join(up, 'listed.svg'), '<svg onload="alert(1)"/>')
  writeFileSync(path.join(up, 'tampered.jpg'), Buffer.concat([JPG, Buffer.from([7])]))
  writeFileSync(path.join(root, 'acme', 'secret.txt'), 'nope')
  symlinkSync(path.join(root, 'acme', 'secret.txt'), path.join(up, 'link.jpg'))
  writeFileSync(path.join(br, 'h.png'), PNG)
  const e = (b: Buffer) => ({ sha256: sha(b), bytes: b.length })
  const index = {
    sections: {
      uploads: { files: { '2025/03/a.jpg': e(JPG), '2025/03/listed.svg': { sha256: 'x', bytes: 1 }, '2025/03/tampered.jpg': e(JPG), '2025/03/link.jpg': { sha256: 'x', bytes: 4 }, '2025/03/missing.jpg': e(JPG) } },
      brand: { files: { 'hero/h.png': e(PNG) } },
    },
  }
  writeFileSync(path.join(root, 'acme', 'media', 'MEDIA_INDEX.json'), JSON.stringify(index))
  return root
}

describe('client media allow-list', () => {
  beforeEach(() => resetMediaCache())

  it('rejects every path that could escape or name a dot file (pure key check)', () => {
    for (const bad of [[], [''], ['..', 'x.jpg'], ['2025', '..', 'a.jpg'], ['%2e%2e', 'a.jpg'], ['2025%2f03', 'a.jpg'], ['a\\b.jpg'], ['a%00.jpg'], ['.hidden.jpg'], ['%'], ['x'.repeat(201)]]) {
      expect(mediaKey(bad), JSON.stringify(bad)).toBeNull()
    }
    expect(mediaKey(['2025', '03', 'a.jpg'])).toBe('2025/03/a.jpg')
    expect(mediaKey(['2025', '03', 'a%20b.jpg'])).toBe('2025/03/a b.jpg')
  })

  it('serves a listed file at its original path with type, long cache, nosniff and an ETag', async () => {
    const root = fixture()
    const res = serveMedia('uploads', ['2025', '03', 'a.jpg'], 'acme', null, root)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Length')).toBe(String(JPG.length))
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    expect(Buffer.from(await res.arrayBuffer()).equals(JPG)).toBe(true)
    const etag = res.headers.get('ETag')!
    expect(serveMedia('uploads', ['2025', '03', 'a.jpg'], 'acme', etag, root).status).toBe(304)
    expect(serveMedia('brand', ['hero', 'h.png'], 'acme', null, root).headers.get('Content-Type')).toBe('image/png')
  })

  it('serves nothing outside the list: unlisted files, directories, sections mixed up, odd extensions, symlinks, tampered bytes, missing files, other clients', () => {
    const root = fixture()
    const s = (sec: 'uploads' | 'brand', segs: string[], slug = 'acme') => serveMedia(sec, segs, slug, null, root).status
    expect(s('uploads', ['2025', '03', 'unlisted.jpg'])).toBe(404) // on disk, not in the index
    expect(s('uploads', ['2025', '03'])).toBe(404) // a directory: no listing
    expect(s('uploads', ['2025'])).toBe(404)
    expect(s('uploads', ['hero', 'h.png'])).toBe(404) // brand key under uploads
    expect(s('brand', ['2025', '03', 'a.jpg'])).toBe(404) // uploads key under brand
    expect(s('uploads', ['2025', '03', 'listed.svg'])).toBe(404) // listed but not a raster type
    expect(s('uploads', ['2025', '03', 'link.jpg'])).toBe(404) // symlink
    expect(s('uploads', ['2025', '03', 'tampered.jpg'])).toBe(404) // bytes differ from the listed hash
    expect(s('uploads', ['2025', '03', 'missing.jpg'])).toBe(404) // listed, absent
    expect(s('uploads', ['..', '..', 'secret.txt'])).toBe(404)
    expect(s('uploads', ['2025', '03', 'a.jpg'], 'other')).toBe(404) // another client has no index
    expect(s('uploads', ['2025', '03', 'toString'])).toBe(404) // prototype names are not keys
    expect(resolveMedia('uploads', ['2025', '03', 'A.JPG'], 'acme', root)).toBeNull() // exact, case-sensitive
  })

  it('a client with no index serves nothing', () => {
    resetMediaCache()
    expect(loadMediaIndex('nobody', os.tmpdir())).toBeNull()
  })
})

// When the real media folder is staged (it is not committed), every file on disk is in the index and the index is consistent.
describe('staged ICST media folder', () => {
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..', 'clients')
  const staged = (() => { try { return statSync(path.join(root, 'icst', 'media', 'wp-content', 'uploads')).isDirectory() } catch { return false } })()
  it.skipIf(!staged)('has no file outside MEDIA_INDEX.json', () => {
    resetMediaCache()
    const idx = loadMediaIndex('icst', root)!
    expect(idx).not.toBeNull()
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
    for (const [sec, dir] of [['uploads', path.join(root, 'icst', 'media', 'wp-content', 'uploads')], ['brand', path.join(root, 'icst', 'media', 'brand')]] as const) {
      const listed = new Set(Object.keys(idx.sections[sec].files))
      const onDisk = walk(dir).map((f) => path.relative(dir, f).split(path.sep).join('/'))
      expect(onDisk.filter((k) => !listed.has(k))).toEqual([])
      expect(onDisk.length).toBe(listed.size)
    }
  })
})
