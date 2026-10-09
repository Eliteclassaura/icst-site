import strings from './data/ers-ui-strings.json'

/**
 * Email Revenue UI text, sealed by OGCS 2026-10-08 (ERS_UI_STRINGS.tsv sha256 736560a0…). Screens read their words from
 * here by key; nothing is retyped in components. `{name}` placeholders are filled by `t`; `a|b` marks singular|plural.
 */
const S = strings as Record<string, string>
export type UiKey = keyof typeof strings

export function t(key: UiKey, vars: Record<string, string | number> = {}): string {
  const raw = S[key as string]
  if (raw === undefined) throw new Error(`Unknown UI string: ${String(key)}`)
  return raw.replace(/\{(\w+)\}/g, (m, n: string) => (n in vars ? String(vars[n]) : m))
}

/** "a|b" pairs: one when n === 1, otherwise the other. */
export function plural(key: UiKey, n: number, vars: Record<string, string | number> = {}): string {
  const [one, many] = (S[key as string] ?? '').split('|')
  return t_(n === 1 ? (one ?? '') : (many ?? one ?? ''), { n, ...vars })
}
const t_ = (raw: string, vars: Record<string, string | number>): string =>
  raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
