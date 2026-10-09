/**
 * LEGAL-1 (owner: legal pages approved, publish at launch; CT 2026-10-08): the four legal pages and their ledger rows.
 *
 * The texts are OGCS's LEGAL-FINAL-1 files, byte for byte, in content/legal/ (provenance in content/legal/SOURCE_SHA256SUMS).
 * /privacy-policy/ keeps its live URL (and its release-ledger row); /terms-of-use/, /cookie-notice/ and /accessibility/ are new.
 * The pages are code routes: they are answered before the release/Payload lookup, and the ledger rows below are added to the
 * published ledger wherever it decides indexing and the sitemap (proxy, sitemap response), so nothing about them depends on a
 * database record. Pure data: no React, no I/O.
 */
/** `modified`: the date of the text (its effective date; the accessibility statement has none, so its publication date) — WebPage dateModified. */
export type LegalPage = { path: string; file: string; title: string; description: string; modified: string }

export const LEGAL_PAGES: readonly LegalPage[] = [
  {
    path: '/privacy-policy/',
    file: 'privacy-policy.md',
    title: 'Privacy Policy | ICS Industrial Cooling Solutions',
    description: 'How Industrial Cooling Solutions (ICS) handles personal information when you visit h2ocooling.com or ask us for a quote.',
    modified: '2026-10-09',
  },
  {
    path: '/terms-of-use/',
    file: 'terms-of-use.md',
    title: 'Terms of Use | ICS Industrial Cooling Solutions',
    description: 'The terms for using h2ocooling.com and for sending Industrial Cooling Solutions (ICS) a quote request.',
    modified: '2026-10-09',
  },
  {
    path: '/cookie-notice/',
    file: 'cookie-notice.md',
    title: 'Cookie Notice | ICS Industrial Cooling Solutions',
    description: 'The cookies and browser storage h2ocooling.com uses, and what each one does.',
    modified: '2026-10-09',
  },
  {
    path: '/accessibility/',
    file: 'accessibility.md',
    title: 'Accessibility Statement | ICS Industrial Cooling Solutions',
    description: 'Our accessibility target for h2ocooling.com and how to get help if part of the site is hard to use.',
    modified: '2026-10-09',
  },
] as const

export const LEGAL_ORIGIN = 'https://h2ocooling.com'

export const legalPageForPath = (value: string): LegalPage | undefined => LEGAL_PAGES.find((page) => page.path === value)

/** The three new pages as published-ledger rows (the privacy page already has its imported row). */
export const LEGAL_NEW_ROWS = LEGAL_PAGES.filter((page) => page.path !== '/privacy-policy/').map((page) => ({
  path: page.path,
  routeId: `RELEASE-LEGAL-${page.file.replace(/\.md$/, '').toUpperCase()}`,
  routeClass: 'pages',
  state: 'PUBLIC',
  export: true,
  indexable: true,
  sitemap: true,
  searchable: false,
  canonical: `${LEGAL_ORIGIN}${page.path}`,
  previousCanonical: '',
  sourceRobots: 'index, follow',
  matchedArticle: false,
  sourceFile: `content/legal/${page.file}`,
  sourceSha256: null,
  releaseOverride: null,
  redirect: null,
}))

/** The ledger with the legal rows added once (rows already present, by path, are left as they are). */
export function withLegalRows<T extends { routes: Array<{ path: string }> }>(ledger: T): T {
  const have = new Set(ledger.routes.map((row) => row.path))
  const add = LEGAL_NEW_ROWS.filter((row) => !have.has(row.path))
  return add.length ? { ...ledger, routes: [...ledger.routes, ...(add as unknown as T['routes'])] } : ledger
}
