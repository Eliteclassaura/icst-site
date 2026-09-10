import type { Blueprint, PageDecisions } from '@factory/seo-contracts'

/**
 * Importer pipeline shape (docs/wordpress-importer.md). Each stage is a pure function over the previous
 * stage's output so every step is testable against a fixture and re-runnable identically.
 */
export type WpSource = {
  /** Path to a MySQL dump (already stripped of customer/comment tables by the owner) and the uploads dir. */
  sqlDump: string
  uploadsDir: string
  tablePrefix: string
  /** Snapshot time recorded in the manifest; content changed after it is a delta import (R44). */
  snapshotAt: string
}

export type WpRecord = {
  id: number
  type: 'page' | 'post' | 'product' | 'attachment' | 'nav_menu_item' | string
  status: 'publish' | 'draft' | 'private' | string
  slug: string
  parentId: number | null
  title: string
  content: string
  excerpt: string
  date: string
  modified: string
  authorLabel: string
  meta: Record<string, string>
  terms: Array<{ taxonomy: string; slug: string; name: string }>
  url: string
}

/**
 * Language / region detection (ADR-029 §4, A23, R60). Always produced — a monolingual source is the
 * recorded finding `{ multilingual: false, languages: [] }`, never an assumption. When `representable`
 * is false the import stops with `reason` instead of flattening the site into one language.
 */
export type LanguageDetection = {
  multilingual: boolean
  plugin: 'wpml' | 'polylang' | 'translatepress' | 'woocommerce-multilingual' | 'other' | null
  languages: Array<{
    code: string
    region?: string
    isDefault: boolean
    recordCount: number
    urlSample?: string
  }>
  urlPattern: 'subdirectory' | 'subdomain' | 'cctld' | 'query' | 'none-detected' | 'unknown'
  hreflangSource: 'yoast' | 'rank-math' | 'plugin' | 'theme' | 'none' | 'unknown'
  hasXDefault: boolean | null
  /** False when the Factory cannot yet represent what was found; the importer must refuse. */
  representable: boolean
  reason?: string
}

export type ImportManifest = {
  snapshotAt: string
  sqlSha256: string
  recordsRead: number
  recordsImported: number
  pruned: number
  redirected: number
  review: Array<{ url: string; reason: string }>
  emailsRemoved: number
  languages: LanguageDetection
  decisionsRunId: string | null
}

export type ImportResult = { blueprint: Blueprint; manifest: ImportManifest }

export interface Importer {
  /** Runs before parse; its result is always recorded, and a non-representable result stops the import. */
  detectLanguages(source: WpSource): Promise<LanguageDetection>
  parse(source: WpSource): Promise<WpRecord[]>
  apply(records: WpRecord[], decisions: PageDecisions | null): ImportResult
}
