/**
 * R2.4 (Control Tower 2026-10-05; SEO Checker item l, CLS): the intrinsic size of a held public image, read from the file's
 * own header (JPEG, PNG, GIF, WebP), for an image whose media row records none — so every rendered image reserves its box.
 */
import { closeSync, openSync, readSync } from 'node:fs'
import path from 'node:path'

const cache = new Map<string, { width: number; height: number } | null>()

/** Width and height of `bytes` (the start of an image file), or null when the format is not recognised. */
export function sizeFromHeader(b: Buffer): { width: number; height: number } | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 } }
    if (chunk === 'VP8X') return { width: (b.readUIntLE(24, 3) & 0xffffff) + 1, height: (b.readUIntLE(27, 3) & 0xffffff) + 1 }
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]!
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
      i += 2 + b.readUInt16BE(i + 2)
    }
  }
  return null
}

/** The size of the file served at `publicPath` (e.g. /media/salmon/x.jpeg), or undefined. */
export function heldImageSize(publicPath: string, root = path.join(process.cwd(), 'public')): { width: number; height: number } | undefined {
  if (!cache.has(publicPath)) {
    let size: { width: number; height: number } | null = null
    try {
      const file = path.join(root, decodeURIComponent(publicPath))
      if (file.startsWith(root + path.sep)) {
        const fd = openSync(file, 'r')
        try {
          const b = Buffer.alloc(256 * 1024)
          size = sizeFromHeader(b.subarray(0, readSync(fd, b, 0, b.length, 0)))
        } finally {
          closeSync(fd)
        }
      }
    } catch {
      size = null
    }
    cache.set(publicPath, size)
  }
  return cache.get(publicPath) ?? undefined
}
