import { exclusionsFor } from './public-exclusions'

/**
 * Runtime side of Main Factory's SALMON_FAMILY_PAGE_V1 1.1.0 content contract (R1B, Control Tower C6).
 *
 * Main's presentation renders only the contract model; Main's transitional adapter produces it from the frozen
 * Salmon JSON, and the runtime is expected to produce the same model from Payload. This module provides the
 * runtime adapter's contract-bearing parts, derived from the validated **composed Payload document** (after
 * exclusions, author projection and editor slots):
 *
 *   - `exclusions`: exactly the contract's field (elementId, sourceKey, reason, ruling), from the registry;
 *   - `contentIndex`: per source key, the editor-owned content the model carries at that key (heading/text
 *     words, button label + `intent:'quote'`, image presence), so a producer's model can be validated against
 *     the Payload projection key by key (tests/contract-variant.test.ts) without installing Main's package.
 *
 * Presentation fields (style, layout, variant, treatment) are Main's and are not produced here.
 */
type Node = string | { tag: string; attrs?: Record<string, string>; children?: Node[] }
type Doc = Record<string, unknown>
export const SALMON_FAMILY_CONTRACT = 'SALMON_FAMILY_PAGE_V1' as const
export const SALMON_FAMILY_CONTRACT_VERSION = '1.1.0' as const

export type ContractExclusion = { elementId: string; sourceKey: string; reason: string; ruling: string }
export type ContractEntry = { key: string; tag: string; elementId: string | null; text: string; intent?: 'quote'; href?: string; image?: boolean; excluded?: boolean }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (n: Node): string => (typeof n === 'string' ? n : (n.children ?? []).map(textOf).join(' '))

export function contractExclusions(routeId: string): ContractExclusion[] {
  return exclusionsFor(routeId).map((e) => ({ elementId: e.dataId, sourceKey: e.sourceKey, reason: e.reason, ruling: e.ruling }))
}

export function contractIndex(doc: Doc): Map<string, ContractEntry> {
  const out = new Map<string, ContractEntry>()
  const walk = (n: Node, key: string) => {
    if (typeof n === 'string') return
    const excluded = Boolean(n.attrs?.['data-public-exclusion'])
    out.set(key, {
      key, tag: n.tag, elementId: n.attrs?.['data-id'] ?? n.attrs?.['data-public-exclusion'] ?? null, text: excluded ? '' : norm(textOf(n)),
      ...(n.tag === 'a' && n.attrs?.['data-rfq-intent'] === 'quote' ? { intent: 'quote' as const } : {}),
      ...(n.tag === 'a' && n.attrs?.href ? { href: n.attrs.href } : {}),
      ...(n.tag === 'img' ? { image: true } : {}),
      ...(excluded ? { excluded: true } : {}),
    })
    if (!excluded) (n.children ?? []).forEach((c, i) => walk(c, `${key}.${i}`))
  }
  ;((doc.children as Node[] | undefined) ?? []).forEach((c, i) => walk(c, `body.${i}`))
  return out
}
