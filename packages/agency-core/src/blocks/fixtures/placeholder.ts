import type { ImageRef } from '../types'

/**
 * Fixture imagery is generated, never a client's photograph: image rights are a publish gate (R34)
 * and the gallery must not depend on files whose licence is unknown. The SVG is a quiet duotone
 * that reads as "photo goes here" at any size and costs ~600 bytes.
 */
export function placeholderImage(opts: {
  width: number
  height: number
  alt: string
  label?: string
  decorative?: boolean
}): ImageRef {
  const { width, height, alt, label = `${opts.width}×${opts.height}`, decorative } = opts
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1611"/><stop offset="1" stop-color="#3a3024"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><circle cx="${width * 0.68}" cy="${height * 0.32}" r="${Math.min(width, height) * 0.18}" fill="#8a6a30" fill-opacity="0.35"/><text x="${width / 2}" y="${height / 2}" fill="#d9c7a1" fill-opacity="0.8" font-family="system-ui" font-size="${Math.max(12, Math.round(Math.min(width, height) / 18))}" text-anchor="middle" dominant-baseline="middle">${label} · fixture image</text></svg>`
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    alt: decorative ? '' : alt,
    width,
    height,
    decorative,
  }
}
