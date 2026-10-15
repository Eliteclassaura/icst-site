import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { clientsRoot, listPages, type ListedPage } from './content'

/**
 * The client's redirect ledger: `clients/<slug>/redirects/ledger.tsv`, columns `from`, `to`, `status` (301 or 410), `note`.
 * Applied by the proxy before any routing, ONE hop only. The rules the ledger must satisfy (checked by `ledgerIssues`, by the CI check and
 * again when the proxy loads it; a row that breaks one is dropped at run time and reported, never half-applied):
 *   - 301 goes to a page that exists, is not the home page and is not noindex; it never goes to another ledger source (no chain, no loop);
 *   - 410 has no destination; a `from` appears once; platform paths (/api, /admin, /crm, /_next) are never redirected;
 *   - a `from` that is itself a live page is a conflict (the ledger must not shadow a page).
 */
export type LedgerRow = { from: string; to: string; status: 301 | 410; note: string; line: number }
export type LedgerIssue = { line: number; from: string; code: string; message: string }

const PLATFORM = /^\/(api|admin|_next|crm|client-media)(\/|$)/

/** `/a/b` and `/a/b/` are the same path; a query or fragment is ignored; the home page is `/`. */
export function normalisePath(p: string): string {
  const base = p.trim().split(/[?#]/)[0]
  const withSlash = base.startsWith('/') ? base : `/${base}`
  // A file path (`/home.html`, `/sitemap_index.xml`) keeps its name: a slash would make it another URL.
  if (/\.[A-Za-z0-9]{1,8}$/.test(withSlash)) return withSlash
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`
}

/**
 * Named exceptions to the general rules, each signed by CT-1 (2026-10-15) and matched as an EXACT from/to pair so a note can never open a
 * new hole. Anything else that breaks a rule is dropped. Changing this list needs CT-1's sign-off.
 *   - 'home alias': /home.html -> /  (an alias of the home page, not a catch-all).
 *   - 'sitemap index target': six old WordPress child sitemaps -> /sitemap_index.xml (a generated file, not a page; it answers
 *     noindex on private deploys). Exempt from "target is a page" and "target is not noindex" only.
 */
export const NAMED_EXCEPTIONS: ReadonlyArray<{ name: string; from: string; to: string; waives: ReadonlyArray<string> }> = [
  { name: 'home alias', from: '/home.html', to: '/', waives: ['TO_HOME'] },
  ...['/category-sitemap.xml', '/dt_portfolio-sitemap.xml', '/page-sitemap.xml', '/post-sitemap1.xml', '/post-sitemap2.xml', '/product-sitemap.xml'].map((from) => ({
    name: 'sitemap index target',
    from,
    to: '/sitemap_index.xml',
    waives: ['TARGET_MISSING', 'TARGET_NOINDEX'],
  })),
]
const waived = (r: LedgerRow, code: string): boolean => NAMED_EXCEPTIONS.some((e) => e.from === r.from && e.to === r.to && e.waives.includes(code))

export function parseLedger(tsv: string): { rows: LedgerRow[]; issues: LedgerIssue[]; slashOnly: LedgerRow[] } {
  const rows: LedgerRow[] = []
  const slashOnly: LedgerRow[] = []
  const issues: LedgerIssue[] = []
  let header = true
  tsv.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    if (!raw.trim() || raw.startsWith('#')) return
    const cols = raw.split('\t')
    if (header) {
      header = false
      if (cols.slice(0, 3).join(',') !== 'from,to,status') issues.push({ line, from: '', code: 'BAD_HEADER', message: 'the first line must be: from, to, status, note (tab separated)' })
      return
    }
    const [from = '', to = '', status = '', note = ''] = cols
    const s = Number(status.trim())
    if (s !== 301 && s !== 410) {
      issues.push({ line, from, code: 'BAD_STATUS', message: `status must be 301 or 410, got "${status}"` })
      return
    }
    if (!from.trim().startsWith('/')) {
      issues.push({ line, from, code: 'BAD_FROM', message: 'from must be a site path starting with /' })
      return
    }
    const row: LedgerRow = { from: normalisePath(from), to: to.trim() ? normalisePath(to) : '', status: s, note: note.trim(), line }
    // `/x` -> `/x/` only adds the trailing slash: the site already answers that with one permanent redirect (trailingSlash), so the row is a no-op, not a loop.
    if (s === 301 && row.to === row.from && from.trim() !== to.trim()) slashOnly.push(row)
    else rows.push(row)
  })
  return { rows, issues, slashOnly }
}

export function ledgerIssues(rows: readonly LedgerRow[], pages: readonly ListedPage[]): LedgerIssue[] {
  const issues: LedgerIssue[] = []
  const bad = (r: LedgerRow, code: string, message: string) => {
    if (!waived(r, code)) issues.push({ line: r.line, from: r.from, code, message })
  }
  const sources = new Set(rows.map((r) => r.from))
  const byPath = new Map(pages.map((p) => [p.path, p]))
  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r.from)) bad(r, 'DUPLICATE_FROM', 'this source appears more than once')
    seen.add(r.from)
    if (PLATFORM.test(r.from)) bad(r, 'PLATFORM_PATH', 'platform paths (/api, /admin, /crm, /_next) are never redirected')
    if (r.from === '/') bad(r, 'FROM_HOME', 'the home page cannot be redirected')
    if (byPath.has(r.from)) bad(r, 'SHADOWS_PAGE', 'this source is a live page: remove the page or the row')
    if (r.status === 410) {
      if (r.to) bad(r, 'GONE_HAS_TARGET', '410 must have no destination')
      continue
    }
    if (!r.to) {
      bad(r, 'NO_TARGET', '301 needs a destination')
      continue
    }
    if (r.to === r.from) bad(r, 'SELF', 'a row redirecting to itself loops')
    if (r.to === '/') bad(r, 'TO_HOME', 'never redirect to the home page (it passes a page-specific signal to a generic page)')
    if (sources.has(r.to)) bad(r, 'CHAIN', `the destination ${r.to} is itself redirected: point this row at the final page (zero chains)`)
    const dest = byPath.get(r.to)
    if (!dest && r.to !== '/') bad(r, 'TARGET_MISSING', `the destination ${r.to} is not a page of this site`)
    else if (dest?.page.noindex) bad(r, 'TARGET_NOINDEX', `the destination ${r.to} is noindex`)
  }
  return issues
}

export type RedirectIndex = { map: Map<string, { to: string; status: 301 | 410 }>; issues: LedgerIssue[]; slashOnly: number }

/** The usable rows: those that break no rule. The issues are returned so the caller can log them once. */
export function buildIndex(tsv: string, pages: readonly ListedPage[]): RedirectIndex {
  const { rows, issues, slashOnly } = parseLedger(tsv)
  const all = [...issues, ...ledgerIssues(rows, pages)]
  const badLines = new Set(all.map((i) => i.line))
  const map = new Map<string, { to: string; status: 301 | 410 }>()
  for (const r of rows) if (!badLines.has(r.line)) map.set(r.from, { to: r.to, status: r.status })
  return { map, issues: all, slashOnly: slashOnly.length }
}

export const ledgerFile = (slug: string, root: string = clientsRoot()): string => path.join(root, slug, 'redirects', 'ledger.tsv')

let cached: { key: string; index: RedirectIndex } | null = null
export function resetRedirectCache(): void {
  cached = null
}

/** The client's redirect index, loaded once per process. No ledger file = no redirects. Rows that break a rule are dropped and reported once on stderr. */
export function loadRedirects(slug: string, root: string = clientsRoot()): RedirectIndex {
  const file = ledgerFile(slug, root)
  const key = `${root}|${slug}`
  if (cached?.key === key) return cached.index
  const index = existsSync(file) ? buildIndex(readFileSync(file, 'utf8'), listPages(slug, root)) : { map: new Map(), issues: [], slashOnly: 0 }
  if (index.issues.length) process.stderr.write(`${JSON.stringify({ level: 'error', code: 'REDIRECT_LEDGER_ROWS_DROPPED', count: index.issues.length, first: index.issues.slice(0, 3).map((i) => `${i.line}:${i.code}`) })}\n`)
  cached = { key, index }
  return index
}

/** The response decision for a request path: null = not redirected. */
export function redirectFor(pathname: string, index: RedirectIndex): { to: string; status: 301 | 410 } | null {
  if (PLATFORM.test(pathname) || pathname.startsWith('/client-preview')) return null
  return index.map.get(normalisePath(pathname)) ?? null
}
