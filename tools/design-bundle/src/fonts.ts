/**
 * Font rights, embedding and fallback policy for design artefacts (C5.5 workstream E, R49).
 *
 * A bundle is a file we hand to a client and push into a hosted design project, so embedding a
 * font in it is redistribution. Only a licence that permits redistribution gets embedded; anything
 * else falls back to the stack and says so on the Type board, in the manifest and in the handoff —
 * silently substituting a font is worse than an obvious notice, because the client would approve a
 * design they will never see.
 *
 * The same gate also refuses a font file that is not actually a font (signature check) or is large
 * enough to blow the per-card size cap.
 */
import { inspectAsset, FONT_POLICY } from './safety/assets.ts'

/** Licence identifiers that permit redistribution inside an artefact we hand over. */
const REDISTRIBUTABLE = [
  /^ofl(-|$)/i,
  /^sil open font/i,
  /^open font license/i,
  /^apache(-| )/i,
  /^mit$/i,
  /^owned-redistributable$/i,
  /^ubuntu font licence/i,
]

export type ContractFontFile = { path: string; origin?: string }
export type ContractFont = {
  family: string
  fallbacks: string[]
  license?: { name?: string; url?: string; file?: string }
  files?: ContractFontFile[]
  display?: string
}

export type FontVerdict = {
  family: string
  /** Role in the contract: `display` or `text`. */
  role: string
  licenseName: string
  embeddable: boolean
  /** Why it is not embeddable, when it is not. */
  reason?: string
  fallbacks: string[]
  files: string[]
  findings: Array<{ rule: string; detail: string }>
}

export function isRedistributable(licenseName: string | undefined): boolean {
  if (!licenseName) return false
  return REDISTRIBUTABLE.some((re) => re.test(licenseName.trim()))
}

/** A fallback stack must exist and must end in a generic family, or a missing font has nowhere to land. */
const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
])

export function checkFallbackStack(fallbacks: string[]): string[] {
  const out: string[] = []
  if (fallbacks.length === 0) out.push('no fallback stack declared')
  else {
    const last = fallbacks[fallbacks.length - 1]!.replace(/["']/g, '').trim().toLowerCase()
    if (!GENERIC.has(last)) out.push(`fallback stack does not end in a generic family (ends in "${last}")`)
  }
  return out
}

/**
 * Decide, per family, whether its files may be embedded, and collect every rights finding a
 * reviewer needs. `readFile` returns the bytes for a contract font path (or null when absent).
 */
export function evaluateFont(
  role: string,
  font: ContractFont,
  readFile: (path: string) => Buffer | null,
): FontVerdict {
  const licenseName = font.license?.name ?? 'unknown'
  const findings: Array<{ rule: string; detail: string }> = []
  let embeddable = isRedistributable(licenseName)
  let reason = embeddable ? undefined : `licence "${licenseName}" does not permit redistribution`

  for (const w of checkFallbackStack(font.fallbacks))
    findings.push({ rule: 'font-fallback', detail: `${font.family}: ${w}` })
  if (font.display && font.display !== 'swap')
    findings.push({
      rule: 'font-display',
      detail: `${font.family}: font-display is "${font.display}"; "swap" keeps text readable while the face loads`,
    })
  if (!font.license?.file && embeddable)
    findings.push({
      rule: 'font-licence-file',
      detail: `${font.family}: redistributable but no licence file is declared; the licence text must travel with the font`,
    })

  const files: string[] = []
  for (const f of font.files ?? []) {
    const bytes = readFile(f.path)
    if (!bytes) {
      findings.push({ rule: 'font-missing', detail: `${font.family}: ${f.path} is not on disk` })
      embeddable = false
      reason ??= 'font file missing'
      continue
    }
    const verdict = inspectAsset(f.path, bytes, FONT_POLICY)
    for (const v of verdict.findings)
      findings.push({ rule: v.rule, detail: `${font.family} ${f.path}: ${v.detail}` })
    if (!verdict.ok) {
      embeddable = false
      reason ??= 'font file failed asset admission'
      continue
    }
    files.push(f.path)
  }
  if (embeddable && files.length === 0) {
    embeddable = false
    reason ??= 'no usable font file'
  }
  return {
    family: font.family,
    role,
    licenseName,
    embeddable,
    reason,
    fallbacks: font.fallbacks,
    files,
    findings,
  }
}

/**
 * Rewrite `fonts.css` for the chosen mode. `inline` base64s each admitted file (the artboard
 * sandbox cannot resolve relative URLs — ADR-026 spike result 2); `shared` points at the bundle's
 * own `assets/fonts/`. Families that failed the rights gate have their `@font-face` blocks
 * **removed**, so the card renders the fallback stack rather than silently missing text.
 */
export function rewriteFontCss(
  css: string,
  mode: 'inline' | 'shared',
  admitted: Map<string, Buffer>,
): { css: string; dropped: string[] } {
  const dropped: string[] = []
  const blocks = css.split(/(?=@font-face)/)
  const out = blocks.map((block) => {
    if (!block.startsWith('@font-face')) return block
    const url = /url\((['"]?)([^)'"]+)\1\)/.exec(block)
    if (!url) return block
    const path = url[2] as string
    const bytes = admitted.get(path)
    if (!bytes) {
      const fam = /font-family:\s*(['"]?)([^;'"]+)\1/.exec(block)?.[2]?.trim() ?? path
      dropped.push(fam)
      return ''
    }
    const replacement =
      mode === 'inline'
        ? `url(data:font/woff2;base64,${bytes.toString('base64')})`
        : `url(../assets/fonts/${path.split('/').pop()})`
    return block.replace(url[0], replacement)
  })
  return { css: out.join(''), dropped: [...new Set(dropped)].sort() }
}
