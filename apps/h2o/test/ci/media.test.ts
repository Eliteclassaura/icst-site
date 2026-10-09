import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { looksLikePointer, parseIdentity, planMedia, readEntries, POINTER } from '../../ops/ci/media.mjs'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const ptr = (content: string) => `version https://git-${'lfs'}.github.com/spec/v1\noid sha256:${sha(content)}\nsize ${content.length}\n`
const tmp = mkdtempSync(path.join(os.tmpdir(), 'media-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('DEPLOY-PIPE-1 media reuse', () => {
  it('parses the identity file and the LFS pointer shape', () => {
    const m = parseIdentity(`${sha('a')}  apps/h2o/public/media/a.jpg\n${sha('b')} *apps/h2o/public/fonts/b.woff2\nnot a line\n`)
    expect(m.get('apps/h2o/public/media/a.jpg')).toBe(sha('a'))
    expect(m.get('apps/h2o/public/fonts/b.woff2')).toBe(sha('b'))
    expect(m.size).toBe(2)
    expect(POINTER.test(ptr('hello'))).toBe(true)
    expect(looksLikePointer(Buffer.from(ptr('hello')))).toBe(true)
    expect(looksLikePointer(Buffer.from('plain bytes'))).toBe(false)
  })
  it('reads pointer oids and regular-file hashes from a checkout tree', async () => {
    const root = path.join(tmp, 'repo', 'apps/h2o/public')
    mkdirSync(path.join(root, 'media'), { recursive: true })
    writeFileSync(path.join(root, 'media/pic.jpg'), ptr('PICBYTES'))
    writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *\n')
    const e = (await readEntries(root, path.join(tmp, 'repo'))) as Array<{ path: string; expected: string; lfs: boolean }>
    const by = Object.fromEntries(e.map((x) => [x.path, x]))
    expect(by['apps/h2o/public/media/pic.jpg']).toMatchObject({ expected: sha('PICBYTES'), lfs: true })
    expect(by['apps/h2o/public/robots.txt']).toMatchObject({ expected: sha('User-agent: *\n'), lfs: false })
  })
  it('plans: unchanged → reuse from the previous image (no LFS), new or changed LFS file → fetch, a regular file is already real', () => {
    const entries = [
      { path: 'p/a.jpg', expected: sha('a'), lfs: true },
      { path: 'p/b.jpg', expected: sha('b2'), lfs: true }, // changed
      { path: 'p/c.jpg', expected: sha('c'), lfs: true }, // new
      { path: 'p/r.txt', expected: sha('r'), lfs: false },
    ]
    const prev = new Map([['p/a.jpg', sha('a')], ['p/b.jpg', sha('b1')]])
    expect(planMedia(entries, prev)).toEqual({ reuse: ['p/a.jpg'], fetch: ['p/b.jpg', 'p/c.jpg'], regular: ['p/r.txt'] })
    expect(planMedia(entries, new Map()).fetch).toEqual(['p/a.jpg', 'p/b.jpg', 'p/c.jpg']) // first run: everything
  })
  it('a CSS/copy-only release downloads nothing: every LFS file is reused', () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({ path: `p/${i}.jpg`, expected: sha(String(i)), lfs: true }))
    const prev = new Map(entries.map((x) => [x.path, x.expected]))
    const plan = planMedia(entries, prev)
    expect(plan.fetch).toHaveLength(0)
    expect(plan.reuse).toHaveLength(50)
  })
})

describe('DEPLOY-PIPE-1 media apply (end to end in a temp git repo, no LFS needed when everything is reused)', () => {
  const { execFileSync, spawnSync } = require('node:child_process') as typeof import('node:child_process')
  const script = path.resolve(process.cwd(), 'ops/ci/media.mjs')
  const setup = (name: string, prevBytes: string) => {
    const repo = path.join(tmp, name)
    mkdirSync(path.join(repo, 'apps/h2o/public/media'), { recursive: true })
    mkdirSync(path.join(repo, '.prev/public/media'), { recursive: true })
    execFileSync('git', ['init', '-q'], { cwd: repo })
    writeFileSync(path.join(repo, 'apps/h2o/public/media/a.jpg'), ptr('REAL-A'))
    writeFileSync(path.join(repo, 'apps/h2o/public/robots.txt'), 'User-agent: *\n')
    writeFileSync(path.join(repo, '.prev/public/media/a.jpg'), prevBytes)
    writeFileSync(path.join(repo, '.prev/id'), `${sha('REAL-A')}  apps/h2o/public/media/a.jpg\n`)
    return repo
  }
  const run = (repo: string) => spawnSync('node', [script, 'apply', '--prev-dir', '.prev/public', '--prev-identity', '.prev/id'], { cwd: repo, encoding: 'utf8' })
  it('replaces the pointer with the previous image\'s file, verified by sha256 (nothing downloaded)', () => {
    const repo = setup('ok', 'REAL-A')
    const r = run(repo)
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout.trim().split('\n').pop()!)).toMatchObject({ total: 2, reused: 1, fetched: 0, regular: 1, failures: 0 })
    expect(require('node:fs').readFileSync(path.join(repo, 'apps/h2o/public/media/a.jpg'), 'utf8')).toBe('REAL-A')
  })
  it('a previous image whose file does not match its own identity is caught: verification FAILS (never a silent wrong file)', () => {
    const repo = setup('bad', 'CORRUPTED')
    const r = run(repo)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('media verify FAILED: apps/h2o/public/media/a.jpg')
  })
})
