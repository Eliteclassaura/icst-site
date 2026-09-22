import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { R4_MEDIA } from '../R4Media'

describe('R4 approved original media', () => {
  for (const [kind, media] of Object.entries(R4_MEDIA)) {
    it(`${kind} keeps the approved binary and a bounded native crop`, () => {
      const binary = readFileSync(path.join(process.cwd(), 'public', media.src))
      expect(createHash('sha256').update(binary).digest('hex')).toBe(media.sha256)
      expect(media.crop.x0).toBeGreaterThanOrEqual(0)
      expect(media.crop.y0).toBeGreaterThanOrEqual(0)
      expect(media.crop.x1).toBeLessThanOrEqual(1)
      expect(media.crop.y1).toBeLessThanOrEqual(1)
      expect(media.crop.x1).toBeGreaterThan(media.crop.x0)
      expect(media.crop.y1).toBeGreaterThan(media.crop.y0)
      expect(media.nativeWidth).toBeGreaterThan(0)
      expect(media.nativeHeight).toBeGreaterThan(0)
      expect(media.alt).not.toMatch(/customer|project|certified|BacMan/i)
    })
  }
})
