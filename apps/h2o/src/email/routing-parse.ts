import { recipientKey } from './config'

/**
 * ALERTS-1: parsing and validating the addresses typed into Settings → Email routing. Pure (no I/O), shared by the
 * settings service and its tests. Strict on purpose: these addresses receive internal alerts, so only plain
 * `name@domain` addresses are accepted — no display names, no URLs, no list syntax tricks.
 */
export const ALERT_MAX = 10

export type ListResult = { ok: true; list: string[] } | { ok: false; code: string; message: string }

const looksLikeUrl = (s: string) => /(?:^|[^a-z])(?:https?|ftp|javascript|data):|\/\/|www\./i.test(s) || /[/?#]/.test(s)

/** One address per line, or separated by commas or semicolons. Lowercased, deduplicated, at most 10. */
export function parseAddressList(raw: unknown, label: string): ListResult {
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('\n') : ''
  if (text.length > 4000) return { ok: false, code: 'ROUTING_LIST_TOO_LONG', message: `${label}: that is too much text.` }
  const items = text.split(/[\n\r,;]+/).map((s) => s.trim()).filter(Boolean)
  const seen = new Set<string>()
  const list: string[] = []
  for (const item of items) {
    if (looksLikeUrl(item)) return { ok: false, code: 'ROUTING_ADDRESS_INVALID', message: `${label}: “${shown(item)}” is not an email address. Links aren’t allowed.` }
    const key = recipientKey(item)
    if (!key) return { ok: false, code: 'ROUTING_ADDRESS_INVALID', message: `${label}: “${shown(item)}” is not a valid email address. Use plain addresses such as name@example.com, one per line.` }
    if (!seen.has(key)) {
      seen.add(key)
      list.push(key)
    }
  }
  if (list.length > ALERT_MAX) return { ok: false, code: 'ROUTING_LIST_TOO_MANY', message: `${label}: at most ${ALERT_MAX} addresses.` }
  return { ok: true, list }
}

/** One address, or empty (→ use the default). */
export function parseOneAddress(raw: unknown, label: string): { ok: true; value: string | null } | { ok: false; code: string; message: string } {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return { ok: true, value: null }
  const r = parseAddressList(v, label)
  if (!r.ok) return r
  if (r.list.length !== 1 || /[\n\r,;]/.test(v)) return { ok: false, code: 'ROUTING_ADDRESS_INVALID', message: `${label}: enter one address.` }
  return { ok: true, value: r.list[0]! }
}

const shown = (s: string) => s.replace(/[<>"]/g, '').slice(0, 60)

/** Recipients with the same address (case-insensitive) collapsed, order kept. */
export const dedupeAddresses = (lists: string[][]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const l of lists)
    for (const a of l) {
      const k = recipientKey(a)
      if (k && !seen.has(k)) {
        seen.add(k)
        out.push(k)
      }
    }
  return out
}
