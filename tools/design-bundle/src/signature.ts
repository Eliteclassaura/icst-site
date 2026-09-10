/**
 * Design signature — the mechanical answer to "does every client's site look the same?"
 * (C5.5 workstream B).
 *
 * A reusable pack system drifts towards one look: the same neutral palette, the same two Google
 * faces, the same 8-point spacing, the same 12px radius. Nobody decides that; it accumulates. So
 * the Factory measures it. Each contract reduces to a small vector of the decisions a viewer
 * actually perceives — hue and chroma of the accent, the light/dark polarity, the type pairing and
 * scale ratio, the corner radius, the spacing rhythm, the container measure — and two clients whose
 * vectors sit closer than a threshold are reported as too similar to be distinct work.
 *
 * The check is advisory between an existing pair and blocking for a *new* client, because the
 * remedy differs: an existing pair is a conversation, a new client is a choice not yet made.
 */

export type ContractLike = {
  meta?: { client?: string }
  brand?: { colorScheme?: string }
  colors?: Record<string, { value?: string }>
  typography?: {
    display?: { family?: string }
    text?: { family?: string }
    scale?: Record<string, { value?: string }>
  }
  layout?: {
    spacing?: Record<string, { value?: string }>
    radius?: Record<string, { value?: string }>
    container?: Record<string, { value?: string }>
    measure?: { value?: string }
  }
}

export type DesignSignature = {
  client: string
  /** Perceptual axes, each normalised to 0…1 so the distance is not dominated by one unit. */
  axes: {
    accentHue: number
    accentChroma: number
    canvasLightness: number
    contrastSpread: number
    radius: number
    spacingRhythm: number
    typeScaleRatio: number
    displayFamily: number
    textFamily: number
    familyPairing: number
  }
  /** Human-readable summary a reviewer can read without the numbers. */
  summary: string
}

function hex(value: string | undefined): [number, number, number] | null {
  if (!value) return null
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value.trim())
  if (!m) return null
  let h = m[1] as string
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function hsl(rgb: [number, number, number]): { h: number; s: number; l: number } {
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  return { h, s, l }
}

/** Stable 0…1 hash of a string — used so "which typeface" is a coordinate, not a name. */
function familyAxis(name: string | undefined): number {
  if (!name) return 0
  let h = 2166136261
  for (const ch of name.toLowerCase().trim()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

function px(value: string | undefined): number | null {
  if (!value) return null
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(value.trim())
  if (!m) return null
  const n = Number(m[1])
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n
}

/** Largest clamp/px value in a type scale entry — enough to compare rhythm between contracts. */
function scaleMax(value: string | undefined): number | null {
  if (!value) return null
  const nums = [...value.matchAll(/([\d.]+)rem/g)].map((m) => Number(m[1]) * 16)
  if (nums.length) return Math.max(...nums)
  return px(value)
}

export function computeSignature(contract: ContractLike, clientFallback = 'unknown'): DesignSignature {
  const client = contract.meta?.client ?? clientFallback
  const accent = hex(contract.colors?.accent?.value)
  const canvas = hex(contract.colors?.canvas?.value)
  const text = hex(contract.colors?.textPrimary?.value)
  const a = accent ? hsl(accent) : { h: 0, s: 0, l: 0.5 }
  const c = canvas ? hsl(canvas) : { h: 0, s: 0, l: 0.5 }
  const t = text ? hsl(text) : { h: 0, s: 0, l: 0.5 }

  const radii = Object.values(contract.layout?.radius ?? {})
    .map((r) => px(r.value))
    .filter((n): n is number => n !== null)
  const spacing = Object.values(contract.layout?.spacing ?? {})
    .map((s) => px(s.value))
    .filter((n): n is number => n !== null)
    .sort((x, y) => x - y)
  const steps = spacing.length > 1 ? spacing.slice(1).map((v, i) => v / (spacing[i] as number)) : [1]
  const rhythm = steps.reduce((s, v) => s + v, 0) / steps.length

  const scale = contract.typography?.scale ?? {}
  const d1 = scaleMax(scale.d1?.value) ?? 32
  const body = scaleMax(scale.body?.value ?? scale.lead?.value) ?? 16
  const ratio = body > 0 ? d1 / body : 2

  const display = contract.typography?.display?.family
  const textFam = contract.typography?.text?.family

  const axes: DesignSignature['axes'] = {
    accentHue: a.h / 360,
    accentChroma: a.s,
    canvasLightness: c.l,
    contrastSpread: Math.min(1, Math.abs(t.l - c.l)),
    radius: Math.min(1, (radii.length ? Math.max(...radii) : 0) / 32),
    spacingRhythm: Math.min(1, (rhythm - 1) / 1.5),
    typeScaleRatio: Math.min(1, (ratio - 1) / 5),
    displayFamily: familyAxis(display),
    textFamily: familyAxis(textFam),
    familyPairing: display && textFam && display !== textFam ? 1 : 0,
  }
  const summary = [
    `accent ${accent ? `hsl(${a.h.toFixed(0)} ${(a.s * 100).toFixed(0)}%)` : 'unset'}`,
    `${c.l < 0.4 ? 'dark' : c.l > 0.7 ? 'light' : 'mid'} ground`,
    `${display ?? '?'} / ${textFam ?? '?'}`,
    `radius ${radii.length ? Math.max(...radii) : 0}px`,
    `scale ×${ratio.toFixed(2)}`,
  ].join(' · ')
  return { client, axes, summary }
}

/** Weighted Euclidean distance in 0…1 space; 0 = indistinguishable, 1 = nothing in common. */
const WEIGHTS: Record<keyof DesignSignature['axes'], number> = {
  accentHue: 1.4,
  accentChroma: 0.8,
  canvasLightness: 1.4,
  contrastSpread: 0.4,
  radius: 1.0,
  spacingRhythm: 0.6,
  typeScaleRatio: 0.8,
  displayFamily: 1.6,
  textFamily: 1.6,
  familyPairing: 0.4,
}

export function signatureDistance(a: DesignSignature, b: DesignSignature): number {
  let sum = 0
  let total = 0
  for (const key of Object.keys(WEIGHTS) as Array<keyof DesignSignature['axes']>) {
    const w = WEIGHTS[key]
    // Hue is circular: 350° and 10° are close.
    const d =
      key === 'accentHue'
        ? Math.min(Math.abs(a.axes[key] - b.axes[key]), 1 - Math.abs(a.axes[key] - b.axes[key])) * 2
        : Math.abs(a.axes[key] - b.axes[key])
    sum += w * d * d
    total += w
  }
  return Math.sqrt(sum / total)
}

/** Below this, two clients' design systems are not telling a viewer they are different studios' work. */
export const SAMENESS_THRESHOLD = 0.18

export type SamenessFinding = {
  a: string
  b: string
  distance: number
  blocking: boolean
  detail: string
}

/**
 * Compare every pair. A pair is blocking when one of the two is `newClient` — a new site must be
 * distinct by construction; two existing sites that have converged are advisory, since changing a
 * live client's palette is a decision, not a build fix.
 */
export function compareSignatures(signatures: DesignSignature[], newClient?: string): SamenessFinding[] {
  const out: SamenessFinding[] = []
  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const a = signatures[i] as DesignSignature
      const b = signatures[j] as DesignSignature
      const distance = signatureDistance(a, b)
      if (distance >= SAMENESS_THRESHOLD) continue
      out.push({
        a: a.client,
        b: b.client,
        distance,
        blocking: newClient !== undefined && (a.client === newClient || b.client === newClient),
        detail: `${a.client} (${a.summary}) and ${b.client} (${b.summary}) differ by ${distance.toFixed(3)}, below ${SAMENESS_THRESHOLD}`,
      })
    }
  }
  return out.sort((x, y) => x.distance - y.distance)
}
