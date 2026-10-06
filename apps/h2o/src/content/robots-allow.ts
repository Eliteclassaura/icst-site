/**
 * R3.6 (Control Tower 2026-10-06, owner decision): named audit crawlers may crawl a PRIVATE (staging) deployment, so Semrush
 * Site Audit can run while everyone else, Google included, stays disallowed. Read at RUNTIME, no rebuild:
 *
 *   H2O_ROBOTS_ALLOW_AGENTS='SiteAuditBot,SemrushBot-SA'
 *
 * Each comma-separated token must match `^[A-Za-z0-9._-]{1,40}$`; an invalid token is ignored and logged with its position
 * only, never its value. Unset or empty: robots.txt is exactly the private `User-agent: *` / `Disallow: /`. The production
 * policy ignores the variable. Indexing is unchanged: every staging response keeps `X-Robots-Tag: noindex, nofollow`.
 */
const TOKEN = /^[A-Za-z0-9._-]{1,40}$/
const PRIVATE_ALL = 'User-agent: *\nDisallow: /\n'

/** The valid tokens of a raw H2O_ROBOTS_ALLOW_AGENTS value, in order, without duplicates; `warn` receives position only. */
export function parseRobotsAllowAgents(raw: string | undefined, warn: (message: string) => void = (m) => console.warn(m)): string[] {
  const out: string[] = []
  if (!raw || !raw.trim()) return out
  raw.split(',').forEach((part, i) => {
    const token = part.trim()
    if (!TOKEN.test(token)) { warn(`[h2o] H2O_ROBOTS_ALLOW_AGENTS token ${i + 1} ignored: not a user-agent token`); return }
    if (!out.includes(token)) out.push(token)
  })
  return out
}

let cachedRaw: string | undefined
let cachedBody = PRIVATE_ALL

/** The private-policy robots.txt: one allow group per named agent (private surfaces disallowed), then everyone disallowed. */
export function privateRobotsBody(env: Record<string, string | undefined> = process.env): string {
  const raw = env.H2O_ROBOTS_ALLOW_AGENTS
  if (raw === cachedRaw) return cachedBody
  const groups = parseRobotsAllowAgents(raw).map((token) => `User-agent: ${token}\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /crm/\n\n`)
  cachedRaw = raw
  cachedBody = groups.join('') + PRIVATE_ALL
  return cachedBody
}
