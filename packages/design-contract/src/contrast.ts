/** WCAG 2.x contrast arithmetic. Pure. */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** Minimum ratio for a declared use (WCAG 2.2 AA). */
export const REQUIRED: Record<string, number> = {
  'body-text': 4.5,
  'large-text': 3,
  'ui-component': 3,
  'caption-only': 4.5,
  decorative: 0,
}

export type ContrastResult = {
  foreground: string
  background: string
  use: string
  fg: string
  bg: string
  ratio: number
  required: number
  pass: boolean
}
