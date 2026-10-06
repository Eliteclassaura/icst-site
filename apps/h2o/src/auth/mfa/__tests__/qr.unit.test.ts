import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encodeQr, MAX_VERSION, qrSvg, rsRemainder } from '../qr'

/**
 * Patch C: the enrolment QR code. The pinned digests were produced by this encoder and confirmed module-for-module
 * against an independent encoder (the `qrcode` npm package, forced to byte mode and level M) for 1,000 matrices:
 * every version 1–15 × every mask × 13 inputs, and its automatic mask choice for each input (evidence: qr-check.log).
 */
const digest = (m: boolean[][]) => createHash('sha256').update(m.map((r) => r.map((b) => (b ? '1' : '0')).join('')).join('\n')).digest('hex')
const URI = 'otpauth://totp/H2O%20CRM:dana%40example.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=H2O%20CRM&algorithm=SHA1&digits=6&period=30'

describe('QR encoder (byte mode, level M)', () => {
  it('matches the independently verified matrices', () => {
    const a = encodeQr(URI)
    expect([a.version, a.mask, digest(a.modules)]).toEqual([8, 2, '0cebe7c239f64043f51b39dce3371f65d78ee0b9a384a2d94b85a92337e56860'])
    const b = encodeQr('hello')
    expect([b.version, b.mask, digest(b.modules)]).toEqual([1, 0, '52a7aa67e7296ede539d6be86579c7180e3b6d417445712ae8bd314c1818458a'])
    const c = encodeQr('x'.repeat(400))
    expect([c.version, c.mask, digest(c.modules)]).toEqual([15, 0, '3ed4282a72f331b172e38681e01327892b9348ae87d214ff7c487caeccdf7d8b'])
  })

  it('Reed–Solomon: the ISO 18004 annex example (version 1-M, "01234567")', () => {
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]
    expect(rsRemainder(data, 10)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55])
  })

  it('picks the smallest version that fits and refuses what does not fit', () => {
    expect(encodeQr('a'.repeat(14)).version).toBe(1)
    expect(encodeQr('a'.repeat(15)).version).toBe(2)
    expect(() => encodeQr('a'.repeat(413))).toThrow('QR_TOO_LONG')
    expect(MAX_VERSION).toBe(15)
  })

  it('draws finder patterns in three corners and the always-dark module', () => {
    const { modules, version } = encodeQr(URI)
    const n = modules.length
    expect(n).toBe(version * 4 + 17)
    for (const [x, y] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ] as const) {
      expect(modules[y]![x]).toBe(true)
      expect(modules[y + 1]![x + 1]).toBe(false)
      expect(modules[y + 3]![x + 3]).toBe(true)
    }
    expect(modules[n - 8]![8]).toBe(true)
  })

  it('SVG: self-contained, quiet zone, escaped label, no script or external reference', () => {
    const svg = qrSvg(URI, 'Setup QR for "Dana" <test>')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 57"')).toBe(true)
    expect(svg).toContain('aria-label="Setup QR for &quot;Dana&quot; &lt;test&gt;"')
    expect(svg).not.toMatch(/<script|href=|url\(|style=/i)
  })
})
