import type { SiteChrome } from '../../src/site/site-chrome-content'

/**
 * DEPLOY-PIPE-1: the PUBLISHED `site-chrome` global overrides the code defaults (header navigation, footer columns, footer copy). A release that
 * changes DEFAULT_SITE_CHROME does nothing visible until the global is brought in line (UPDATE-1: the footer "Useful Links" and the Parts → Fans menu).
 * This compares the two in the renderer's own shape and lists every differing field, so it is known BEFORE the read-back fails.
 */
export type ChromeDiff = { path: string; default: string; published: string }

const flat = (v: unknown, p: string, out: Map<string, string>): void => {
  if (Array.isArray(v)) {
    out.set(`${p}.length`, String(v.length))
    v.forEach((x, i) => flat(x, `${p}[${i}]`, out))
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k !== 'id') flat(x, p ? `${p}.${k}` : k, out)
  } else out.set(p, v === undefined || v === null ? '' : String(v))
}

/** Differing fields, in path order. A list item is named by its label where there is one, so a moved item reads as a change at its position. */
export function diffChrome(defaults: SiteChrome, published: SiteChrome): ChromeDiff[] {
  const a = new Map<string, string>()
  const b = new Map<string, string>()
  flat(defaults, '', a)
  flat(published, '', b)
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort()
  return paths.filter((p) => (a.get(p) ?? '<absent>') !== (b.get(p) ?? '<absent>')).map((p) => ({ path: p, default: a.get(p) ?? '<absent>', published: b.get(p) ?? '<absent>' }))
}

/** Paths that differ AND start with one of the given prefixes (e.g. `footer.columns[0]`, `navigation[2]`). */
export const diffUnder = (diffs: ChromeDiff[], prefixes: string[]): ChromeDiff[] => diffs.filter((d) => prefixes.some((p) => d.path === p || d.path.startsWith(p)))
