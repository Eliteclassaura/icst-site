/**
 * H2O Phase 2D — the accepted public route registry, read for the launch cohort.
 *
 * The accepted mount contract names its own route authority: `"routes": "PUBLIC_ROUTE_REGISTRY.tsv"`.
 * Mount applicability therefore cannot be decided from the content index alone — the content index
 * carries `route_class`, but the surface a mount attaches to is decided by the registry's own
 * `page_type` and `template` columns. Those columns are what distinguish a category or family
 * listing from an article, and reading them is the difference between reconciling a surface and
 * guessing at one.
 *
 * The registry ships verbatim beside the cohort tables. Only the 29 cohort rows are ever consulted,
 * and every one of them must be present: a cohort route absent from the registry is a missing
 * authority, not a route to be treated as generic.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const CONTENT_ROOT = path.join(process.cwd(), 'content', '2d-launch-cohort')

export class RegistryIntegrityError extends Error {}

export type RegistryRow = {
  canonicalPath: string
  classification: string
  pageType: string
  publicationReady: string
  routeClass: string
  routeId: string
  template: string
}

const REQUIRED_COLUMNS = [
  'route_id',
  'route_class',
  'canonical_path',
  'page_type',
  'classification',
  'template',
  'publication_ready',
] as const

let cache: Map<string, RegistryRow> | null = null

/** Every registry row, keyed by route id. Read once; the file is large and never changes. */
export const registry = (): Map<string, RegistryRow> => {
  if (cache !== null) return cache

  const text = readFileSync(path.join(CONTENT_ROOT, 'PUBLIC_ROUTE_REGISTRY.tsv'), 'utf8')
  const lines = text.split('\n').filter((line) => line !== '')
  const header = (lines[0] ?? '').split('\t')

  for (const column of REQUIRED_COLUMNS) {
    if (!header.includes(column)) {
      throw new RegistryIntegrityError(
        `PUBLIC_ROUTE_REGISTRY.tsv has no "${column}" column, so no mount surface can be reconciled from it`,
      )
    }
  }

  const at = (cells: string[], column: string): string => cells[header.indexOf(column)] ?? ''
  const rows = new Map<string, RegistryRow>()
  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const routeId = at(cells, 'route_id')
    if (routeId === '') continue
    rows.set(routeId, {
      canonicalPath: at(cells, 'canonical_path'),
      classification: at(cells, 'classification'),
      pageType: at(cells, 'page_type'),
      publicationReady: at(cells, 'publication_ready'),
      routeClass: at(cells, 'route_class'),
      routeId,
      template: at(cells, 'template'),
    })
  }

  cache = rows
  return rows
}

/**
 * The registry row for a cohort route.
 *
 * Throws rather than returning a default. A mount surface decided from a missing row would be a
 * guess, and the correction this package answers to is explicit that a surface mapping the supplied
 * authorities do not determine must fail closed and name what is missing.
 */
export const registryRow = (routeId: string): RegistryRow => {
  const row = registry().get(routeId)
  if (row === undefined) {
    throw new RegistryIntegrityError(
      `Route ${routeId} is not in PUBLIC_ROUTE_REGISTRY.tsv, so its mount surface is not determined ` +
        `by any supplied authority (missing authority: PUBLIC_ROUTE_REGISTRY.tsv row for ${routeId})`,
    )
  }
  return row
}
