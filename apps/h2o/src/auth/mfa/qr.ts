/**
 * Patch C: a QR code for the authenticator setup link, drawn on the server as inline SVG. No library, no network,
 * no image request: the `otpauth://` link (which carries the TOTP secret) never leaves the page that already shows
 * it as a setup key.
 *
 * ISO/IEC 18004 subset: byte mode, error correction level M, versions 1–15 (up to 412 bytes), the mask with the
 * lowest penalty score. A test checks every module against an independent encoder.
 */

// Per version (1–15), level M: [EC codewords per block, blocks in group 1, data codewords per block in group 1,
// blocks in group 2 (each one data codeword longer)].
const M_BLOCKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [10, 1, 16, 0],
  [16, 1, 28, 0],
  [26, 1, 44, 0],
  [18, 2, 32, 0],
  [24, 2, 43, 0],
  [16, 4, 27, 0],
  [18, 4, 31, 0],
  [22, 2, 38, 2],
  [22, 3, 36, 2],
  [26, 4, 43, 1],
  [30, 1, 50, 4],
  [22, 6, 36, 2],
  [22, 8, 37, 1],
  [24, 4, 40, 5],
  [24, 5, 41, 5],
]
export const MAX_VERSION = M_BLOCKS.length

const dataCapacity = (v: number): number => {
  const [, n1, d1, n2] = M_BLOCKS[v - 1]!
  return n1 * d1 + n2 * (d1 + 1)
}

// ── Reed–Solomon over GF(256), polynomial 0x11D ──────────────────────────────────────────────────────────────────
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!
}
const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!)

function rsGenerator(degree: number): number[] {
  let g = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(g.length + 1).fill(0)
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j]!
      next[j + 1] ^= mul(g[j]!, EXP[i]!)
    }
    g = next
  }
  return g
}

export function rsRemainder(data: readonly number[], degree: number): number[] {
  const gen = rsGenerator(degree)
  const rem = new Array<number>(degree).fill(0)
  for (const b of data) {
    const factor = b ^ rem.shift()!
    rem.push(0)
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[i + 1]!, factor)
  }
  return rem
}

// ── data codewords ───────────────────────────────────────────────────────────────────────────────────────────────
function codewords(bytes: Uint8Array, v: number): number[] {
  const bits: number[] = []
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  put(0b0100, 4)
  put(bytes.length, v <= 9 ? 8 : 16)
  for (const b of bytes) put(b, 8)
  const capBits = dataCapacity(v) * 8
  put(0, Math.min(4, capBits - bits.length))
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  for (let pad = 0xec; data.length < dataCapacity(v); pad ^= 0xec ^ 0x11) data.push(pad)

  // Split into blocks, add error correction, interleave.
  const [ec, n1, d1, n2] = M_BLOCKS[v - 1]!
  const blocks: number[][] = []
  let at = 0
  for (let i = 0; i < n1 + n2; i++) {
    const len = i < n1 ? d1 : d1 + 1
    blocks.push(data.slice(at, at + len))
    at += len
  }
  const ecBlocks = blocks.map((b) => rsRemainder(b, ec))
  const out: number[] = []
  for (let i = 0; i <= d1; i++) for (const b of blocks) if (i < b.length) out.push(b[i]!)
  for (let i = 0; i < ec; i++) for (const e of ecBlocks) out.push(e[i]!)
  return out
}

// ── the module matrix ────────────────────────────────────────────────────────────────────────────────────────────
type Grid = { size: number; dark: boolean[][]; fixed: boolean[][] }

function alignmentPositions(v: number): number[] {
  if (v === 1) return []
  const n = Math.floor(v / 7) + 2
  const step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2
  const out = [6]
  for (let pos = v * 4 + 10; out.length < n; pos -= step) out.splice(1, 0, pos)
  return out
}

function bch(value: number, poly: number, polyBits: number): number {
  let r = value << (polyBits - 1)
  for (let i = 31 - Math.clz32(r); i >= polyBits - 1; i = 31 - Math.clz32(r)) r ^= poly << (i - (polyBits - 1))
  return (value << (polyBits - 1)) | r
}

function functionPatterns(v: number): Grid {
  const size = v * 4 + 17
  const dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, d: boolean) => {
    dark[y]![x] = d
    fixed[y]![x] = true
  }
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        set(x, y, d !== 2 && d !== 4)
      }
  }
  finder(3, 3)
  finder(size - 4, 3)
  finder(3, size - 4)
  const al = alignmentPositions(v)
  for (const ay of al)
    for (const ax of al) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  // Reserve the format areas (written per mask) and the always-dark module.
  for (let i = 0; i < 9; i++) {
    fixed[8]![i] = true
    fixed[i]![8] = true
  }
  for (let i = 0; i < 8; i++) {
    fixed[8]![size - 1 - i] = true
    fixed[size - 1 - i]![8] = true
  }
  set(8, size - 8, true)
  if (v >= 7) {
    const bits = bch(v, 0x1f25, 13)
    for (let i = 0; i < 18; i++) {
      const d = ((bits >>> i) & 1) === 1
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, d)
      set(b, a, d)
    }
  }
  return { size, dark, fixed }
}

function placeData(g: Grid, data: readonly number[]): void {
  let i = 0
  const total = data.length * 8
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < g.size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? g.size - 1 - vert : vert
        if (g.fixed[y]![x]) continue
        if (i < total) g.dark[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1
        i++
      }
  }
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function withMask(g: Grid, mask: number): boolean[][] {
  const out = g.dark.map((row) => row.slice())
  const fn = MASKS[mask]!
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.fixed[y]![x] && fn(x, y)) out[y]![x] = !out[y]![x]
  // Format information: level M (00) and the mask, BCH(15,5), XOR 0x5412.
  const bits = bch(mask, 0x537, 11) ^ 0x5412
  const bit = (i: number) => ((bits >>> i) & 1) === 1
  const s = g.size
  for (let i = 0; i <= 5; i++) out[i]![8] = bit(i)
  out[7]![8] = bit(6)
  out[8]![8] = bit(7)
  out[8]![7] = bit(8)
  for (let i = 9; i < 15; i++) out[8]![14 - i] = bit(i)
  for (let i = 0; i < 8; i++) out[8]![s - 1 - i] = bit(i)
  for (let i = 8; i < 15; i++) out[s - 15 + i]![8] = bit(i)
  out[s - 8]![8] = true
  return out
}

/** ISO/IEC 18004 §8.8.2 penalty: runs, 2×2 blocks, finder-like patterns, dark/light balance. */
export function penalty(m: boolean[][]): number {
  const size = m.length
  let score = 0
  const lines: boolean[][] = []
  for (let y = 0; y < size; y++) lines.push(m[y]!)
  for (let x = 0; x < size; x++) lines.push(m.map((row) => row[x]!))
  const p1 = [true, false, true, true, true, false, true]
  for (const line of lines) {
    let run = 1
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++
      else {
        if (run >= 5) score += run - 2
        run = 1
      }
    }
    for (let i = 0; i + 7 <= size; i++) {
      if (!p1.every((b, k) => line[i + k] === b)) continue
      const before = i >= 4 && [1, 2, 3, 4].every((k) => !line[i - k])
      const after = i + 11 <= size && [7, 8, 9, 10].every((k) => !line[i + k])
      if (before) score += 40
      if (after) score += 40
    }
  }
  for (let y = 0; y + 1 < size; y++)
    for (let x = 0; x + 1 < size; x++) {
      const c = m[y]![x]
      if (m[y]![x + 1] === c && m[y + 1]![x] === c && m[y + 1]![x + 1] === c) score += 3
    }
  const darkCount = m.reduce((a, row) => a + row.filter(Boolean).length, 0)
  const k = Math.floor(Math.abs(darkCount * 20 - size * size * 10) / (size * size))
  score += k * 10
  return score
}

export type QrMatrix = { version: number; mask: number; modules: boolean[][] }

/** Encode text (UTF-8, byte mode, level M). Throws if it does not fit version 15. */
export function encodeQr(text: string, opts: { version?: number; mask?: number } = {}): QrMatrix {
  const bytes = new TextEncoder().encode(text)
  let version = opts.version ?? 0
  if (!version) {
    for (let v = 1; v <= MAX_VERSION; v++)
      if (4 + (v <= 9 ? 8 : 16) + bytes.length * 8 <= dataCapacity(v) * 8) {
        version = v
        break
      }
    if (!version) throw new Error('QR_TOO_LONG')
  } else if (4 + (version <= 9 ? 8 : 16) + bytes.length * 8 > dataCapacity(version) * 8) throw new Error('QR_TOO_LONG')
  const g = functionPatterns(version)
  placeData(g, codewords(bytes, version))
  if (opts.mask !== undefined) return { version, mask: opts.mask, modules: withMask(g, opts.mask) }
  let best: QrMatrix | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const modules = withMask(g, mask)
    const s = penalty(modules)
    if (s < bestScore) {
      bestScore = s
      best = { version, mask, modules }
    }
  }
  return best!
}

/** The matrix as an SVG string: dark modules on white, a 4-module quiet zone, crisp edges, no external resources. */
export function qrSvg(text: string, label: string, opts: { moduleSize?: number } = {}): string {
  const { modules } = encodeQr(text)
  const quiet = 4
  const n = modules.length + quiet * 2
  const px = n * (opts.moduleSize ?? 5)
  let d = ''
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`
    }),
  )
  const safe = label.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" role="img" aria-label="${safe}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
