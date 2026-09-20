/**
 * H2O Phase 2D — what the media authority is allowed to render.
 *
 * These tests are about the guarantees the module enforces, not about which image looks best on
 * which page. That decision is recorded in the authority file and in the visual classification
 * ledger; what is checkable here is that the file cannot render something it did not record.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as media from '../media'

const REPO = process.cwd()
const AUTHORITY = path.join(REPO, 'content', '2d-launch-cohort', 'MEDIA_PLACEMENT_AUTHORITY.tsv')

const rows = (): Array<Record<string, string>> => {
  const lines = readFileSync(AUTHORITY, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
  const header = (lines[0] ?? '').split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row: Record<string, string> = {}
    header.forEach((name, i) => {
      row[name] = cells[i] ?? ''
    })
    return row
  })
}

/** Builds a throwaway tree holding one authority row and one image, then points the module at it. */
const withAuthority = (row: Record<string, string>, bytes: Buffer): { cleanup: () => void; root: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'h2o-media-'))
  mkdirSync(path.join(root, 'content', '2d-launch-cohort'), { recursive: true })
  mkdirSync(path.join(root, 'public', 'media', 'cohort'), { recursive: true })
  const header = Object.keys(row)
  writeFileSync(
    path.join(root, 'content', '2d-launch-cohort', 'MEDIA_PLACEMENT_AUTHORITY.tsv'),
    `${header.join('\t')}\n${header.map((k) => row[k]).join('\t')}\n`,
    'utf8',
  )
  writeFileSync(path.join(root, 'public', row.src.replace(/^\/+/, '')), bytes)
  const previous = process.cwd()
  process.chdir(root)
  media.resetMediaCache()
  return {
    cleanup: () => {
      process.chdir(previous)
      media.resetMediaCache()
      rmSync(root, { force: true, recursive: true })
    },
    root,
  }
}

let cleanup: (() => void) | null = null
afterEach(() => {
  cleanup?.()
  cleanup = null
})

describe('the authority is the decision, and the file on disk must match it', () => {
  it('every recorded image exists and hashes to the recorded digest', () => {
    const all = rows()
    expect(all.length).toBeGreaterThan(0)
    for (const row of all) {
      const file = path.join(REPO, 'public', row.src.replace(/^\/+/, ''))
      expect(existsSync(file)).toBe(true)
      expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(row.sha256)
    }
  })

  it('refuses to render a file whose bytes are not the recovered original', () => {
    const row = rows()[0]
    const { cleanup: done } = withAuthority(row, Buffer.from('not the recovered image'))
    cleanup = done
    expect(() => media.mediaFor(row.route_id)).toThrow(/not the recovered original/)
  })
})

describe('a placement can never upscale an image', () => {
  it('no recorded row renders wider than its own native width', () => {
    for (const row of rows())
      expect(Number(row.rendered_max_width_px)).toBeLessThanOrEqual(Number(row.native_width))
  })

  it('refuses an authority row that would render above the native width', () => {
    const row = rows()[0]
    const bytes = readFileSync(path.join(REPO, 'public', row.src.replace(/^\/+/, '')))
    const { cleanup: done } = withAuthority(
      { ...row, rendered_max_width_px: String(Number(row.native_width) + 1) },
      bytes,
    )
    cleanup = done
    expect(() => media.mediaFor(row.route_id)).toThrow(/upscaling is not permitted/)
  })
})

describe('what each route receives', () => {
  it('gives a route at most one hero', () => {
    const byRoute = new Map<string, number>()
    for (const row of rows())
      if (row.role === 'HERO') byRoute.set(row.route_id, (byRoute.get(row.route_id) ?? 0) + 1)
    for (const [, n] of byRoute) expect(n).toBe(1)
  })

  it('never places the same binary twice on one route', () => {
    const seen = new Map<string, Set<string>>()
    for (const row of rows()) {
      const set = seen.get(row.route_id) ?? new Set<string>()
      expect(set.has(row.sha256)).toBe(false)
      set.add(row.sha256)
      seen.set(row.route_id, set)
    }
  })

  it('carries written alt text for every placement, in the bounded OD-15 state', () => {
    for (const row of rows()) {
      expect(row.alt_text.length).toBeGreaterThan(0)
      expect(row.alt_text_state).toBe('OD15_WRITTEN_BOUNDED_LOCAL_MEDIA_METADATA')
    }
  })

  it('writes alt text that describes the image rather than stuffing keywords', () => {
    for (const row of rows()) {
      const words = row.alt_text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3)
      const counts = new Map<string, number>()
      for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1)
      // No single term may dominate the description.
      for (const [, n] of counts) expect(n).toBeLessThanOrEqual(3)
      // No certification, membership or performance claim is asserted by an alt value.
      expect(row.alt_text).not.toMatch(/\b(ISO|certified|certification|accredited|member of|award)\b/i)
    }
  })

  it('refuses a src that escapes the cohort media directory', () => {
    for (const src of [
      '/etc/passwd',
      '/media/cohort/../../../etc/passwd',
      '/media/cohort/sub/dir.jpg',
      '/media/cohort/',
      '/brand/ics-logo-original.webp',
    ])
      expect(media.fileForSrc(src)).toBeNull()
  })

  it('every recorded src stays inside the cohort media directory', () => {
    for (const row of rows()) expect(media.fileForSrc(row.src)).not.toBeNull()
  })

  it('returns nothing for a route with no recorded placement', () => {
    expect(media.mediaFor('RT-0000-NOT-A-ROUTE')).toEqual([])
    expect(media.heroFor('RT-0000-NOT-A-ROUTE')).toBeNull()
  })
})
