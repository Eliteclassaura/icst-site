/**
 * H2O Phase 2D — the accepted launch cohort, loaded and verified.
 *
 * Every value a page renders comes from an accepted authority file that ships beside this module,
 * and nothing is derived, inferred or defaulted. Two properties make that claim checkable rather
 * than aspirational:
 *
 *   1. **Each body is hashed on load** and compared with the `final_body_sha256` the accepted index
 *      records for it. A body that has been edited — by anyone, for any reason — fails the build.
 *      That is what "use each FINAL_BODY verbatim" means operationally.
 *   2. **The route set is the table.** `cohort()` is the only source of routes, so a route that is
 *      not in `CONTENT_IMPLEMENTATION_READY.tsv` cannot exist, and the 16 remediation-hold routes
 *      and the 210 blocked product routes cannot be reached even by mistake.
 *
 * Nothing here publishes anything. Every route loaded is private implementation/preview content.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const CONTENT_ROOT = path.join(process.cwd(), 'content', '2d-launch-cohort')

/** Minimal, strict TSV reader. The accepted tables are tab-separated with no quoting. */
const readTsv = (file: string): Array<Record<string, string>> => {
  const text = readFileSync(path.join(CONTENT_ROOT, file), 'utf8')
  const lines = text.split('\n').filter((line) => line !== '')
  const header = (lines[0] ?? '').split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row: Record<string, string> = {}
    header.forEach((name, i) => {
      row[name] = cells[i] ?? ''
    })
    return row
  })
}

export type IndexabilityInstruction = 'INDEX_ON_PUBLICATION_READY'

export type CohortPage = {
  bodyMarkdown: string
  /** SHA-256 of the body as loaded. Equal to `bodySha256Accepted` or the build has already failed. */
  bodySha256: string
  bodySha256Accepted: string
  bylineInstruction: string
  canonical: string
  canonicalPath: string
  cohortId: string
  ctaPresent: boolean
  /** Schema properties this route class may never emit. */
  forbiddenProperties: string[]
  h1: string
  indexabilityInstruction: string
  metaDescription: string
  observedAuthor: string
  observedDateModified: string
  observedDatePublished: string
  publicationCondition: string
  routeClass: string
  routeId: string
  schemaRecommendation: string
  /** Path segments for the catch-all route, e.g. `['contact-us']`; `[]` for the homepage. */
  segments: string[]
  titleTag: string
}

export class CohortIntegrityError extends Error {}

const segmentsOf = (canonicalPath: string): string[] =>
  canonicalPath.split('/').filter((segment) => segment !== '')

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')

/**
 * Assert that a body is the accepted body, by hash.
 *
 * Exported so the guard itself can be tested rather than only its effect: a test can prove this
 * throws on a mismatch, which is what makes removing the guard a failing check rather than a
 * silently weaker build.
 */
export const assertAcceptedBody = (
  file: string,
  routeId: string,
  bodyMarkdown: string,
  accepted: string,
): string => {
  const measured = sha256(bodyMarkdown)
  if (measured !== accepted) {
    // The hash is the whole point: it is how "verbatim" stops being a promise and becomes a gate.
    throw new CohortIntegrityError(
      `Accepted body ${file} for route ${routeId} does not match its accepted hash ` +
        `(expected ${accepted}, measured ${measured})`,
    )
  }
  return measured
}

let cached: CohortPage[] | null = null

/**
 * Load and verify the cohort. Throws rather than returning a partial set: a launch cohort with one
 * page missing is not a smaller cohort, it is a broken one.
 */
export const cohort = (): CohortPage[] => {
  if (cached !== null) return cached

  const index = readTsv('PAGE_CONTENT_INDEX.tsv')
  const ready = readTsv('CONTENT_IMPLEMENTATION_READY.tsv')

  const readyIds = new Set(ready.map((row) => row.route_id))
  const indexIds = new Set(index.map((row) => row.route_id))
  for (const id of readyIds) {
    if (!indexIds.has(id))
      throw new CohortIntegrityError(`Implementation-ready route ${id} has no content-index row`)
  }
  for (const id of indexIds) {
    if (!readyIds.has(id))
      throw new CohortIntegrityError(`Content-index route ${id} is not implementation-ready`)
  }

  const pages = index.map((row): CohortPage => {
    const file = row.final_body_file ?? ''
    if (file === '') throw new CohortIntegrityError(`Route ${row.route_id} names no final body file`)

    let bodyMarkdown: string
    try {
      bodyMarkdown = readFileSync(path.join(CONTENT_ROOT, 'bodies', file), 'utf8')
    } catch {
      throw new CohortIntegrityError(`Accepted body ${file} for route ${row.route_id} is missing`)
    }

    const accepted = row.final_body_sha256 ?? ''
    const bodySha256 = assertAcceptedBody(file, row.route_id ?? '', bodyMarkdown, accepted)

    const canonicalPath = row.canonical_path ?? ''
    if (!canonicalPath.startsWith('/') || !canonicalPath.endsWith('/')) {
      throw new CohortIntegrityError(
        `Route ${row.route_id} has a canonical path that is not a rooted directory URL`,
      )
    }

    return {
      bodyMarkdown,
      bodySha256,
      bodySha256Accepted: accepted,
      bylineInstruction: row.byline_instruction ?? '',
      canonical: row.canonical ?? '',
      canonicalPath,
      cohortId: row.cohort_id ?? '',
      ctaPresent: (row.cta_present ?? '') === 'YES',
      forbiddenProperties: (row.forbidden_properties ?? '').split(';').filter((p) => p !== ''),
      h1: row.h1 ?? '',
      indexabilityInstruction: row.indexability_instruction ?? '',
      metaDescription: row.meta_description ?? '',
      observedAuthor: row.observed_author ?? '',
      observedDateModified: row.observed_date_modified ?? '',
      observedDatePublished: row.observed_date_published ?? '',
      publicationCondition: row.publication_condition ?? '',
      routeClass: row.route_class ?? '',
      routeId: row.route_id ?? '',
      schemaRecommendation: row.schema_recommendation ?? '',
      segments: segmentsOf(canonicalPath),
      titleTag: row.title_tag ?? '',
    }
  })

  const paths = new Set(pages.map((page) => page.canonicalPath))
  if (paths.size !== pages.length)
    throw new CohortIntegrityError('Two cohort routes claim the same canonical path')

  cached = pages
  return pages
}

/** The accepted cohort route for a set of URL segments, or null. Null means 404 — never a guess. */
export const pageForSegments = (segments: string[] | undefined): CohortPage | null => {
  const wanted = (segments ?? []).join('/')
  return cohort().find((page) => page.segments.join('/') === wanted) ?? null
}

/** Routes held back from implementation. Loaded so the build can prove none of them is reachable. */
export const remediationHold = (): Array<Record<string, string>> => readTsv('REMEDIATION_HOLD.tsv')

/** The accepted internal-link plan, used to validate every link a body emits. */
export const internalLinkPlan = (): Array<Record<string, string>> => readTsv('INTERNAL_LINK_PLAN.tsv')

/** Media references. Every row is recorded; none publishes in this build. */
export const mediaReferences = (): Array<Record<string, string>> => readTsv('MEDIA_REFERENCES.tsv')
