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
  /** True when the bounded content-recovery overlay supersedes the accepted body for rendering. */
  bodyRecovered: boolean
  /** SHA-256 of the body as rendered: the accepted hash, or the overlay's recovered-body hash. */
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

export class ContentOverlayError extends Error {}

type RecoveredRow = {
  canonical_path: string
  recovered_body_file: string
  recovered_body_sha256: string
  route_id: string
  superseded_body_sha256: string
}

type RemediatedRow = {
  accepted_sha256: string
  body_file: string
  remediated_sha256: string
  route_id: string
}

let recoveredCache: Map<string, { markdown: string; sha256: string; supersedes: string }> | null = null

/**
 * The bounded content-recovery overlay, loaded and self-checked.
 *
 * Two hashes per row, and both matter. `superseded_body_sha256` proves the overlay is superseding
 * the body it says it is — if the accepted body were ever changed, the overlay would refuse rather
 * than silently apply to different content. `recovered_body_sha256` proves the recovered file on
 * disk is the one the overlay was written against.
 */
const recoveredBodies = (): Map<string, { markdown: string; sha256: string; supersedes: string }> => {
  if (recoveredCache !== null) return recoveredCache
  const file = path.join(CONTENT_ROOT, 'PHASE2D_VISUAL_R2_CONTENT_OVERLAY.json')
  let doc: { recovered_bodies?: RecoveredRow[]; remediated_bodies?: RemediatedRow[] }
  try {
    doc = JSON.parse(readFileSync(file, 'utf8')) as {
      recovered_bodies?: RecoveredRow[]
      remediated_bodies?: RemediatedRow[]
    }
  } catch {
    recoveredCache = new Map()
    return recoveredCache
  }
  const out = new Map<string, { markdown: string; sha256: string; supersedes: string }>()
  /*
    Two kinds of supersession, loaded through one path because they need the same two gates.

    A RECOVERED body is a rewrite: seven commercial routes whose accepted bodies held 1,195 words
    between them. A REMEDIATED body is not a rewrite at all — it is a frozen technical article with
    specific unsupported claims removed, one string at a time, with the paragraph around each one
    kept. The directive draws that distinction explicitly and so does this loader: the overlay
    records the edits for a remediated body, and the file on disk is the accepted body with those
    edits applied and nothing else.
  */
  for (const row of doc.remediated_bodies ?? []) {
    let markdown: string
    try {
      markdown = readFileSync(path.join(CONTENT_ROOT, 'bodies-r2', row.body_file), 'utf8')
    } catch {
      throw new ContentOverlayError(
        `Remediated body ${row.body_file} for route ${row.route_id} is missing`,
      )
    }
    const measured = sha256(markdown)
    if (measured !== row.remediated_sha256) {
      throw new ContentOverlayError(
        `Remediated body ${row.body_file} for route ${row.route_id} does not match its overlay ` +
          `hash (expected ${row.remediated_sha256}, measured ${measured})`,
      )
    }
    out.set(row.route_id, {
      markdown,
      sha256: measured,
      supersedes: row.accepted_sha256,
    })
  }
  for (const row of doc.recovered_bodies ?? []) {
    let markdown: string
    try {
      markdown = readFileSync(path.join(CONTENT_ROOT, 'bodies-r2', row.recovered_body_file), 'utf8')
    } catch {
      throw new ContentOverlayError(
        `Recovered body ${row.recovered_body_file} for route ${row.route_id} is missing`,
      )
    }
    const measured = sha256(markdown)
    if (measured !== row.recovered_body_sha256) {
      throw new ContentOverlayError(
        `Recovered body ${row.recovered_body_file} for route ${row.route_id} does not match its ` +
          `overlay hash (expected ${row.recovered_body_sha256}, measured ${measured})`,
      )
    }
    out.set(row.route_id, {
      markdown,
      sha256: measured,
      supersedes: row.superseded_body_sha256,
    })
  }
  recoveredCache = out
  return out
}

const recoveredBodyFor = (
  routeId: string,
  acceptedSha: string,
): { markdown: string; sha256: string } | null => {
  const row = recoveredBodies().get(routeId)
  if (row === undefined) return null
  if (row.supersedes !== acceptedSha) {
    throw new ContentOverlayError(
      `The content overlay supersedes ${row.supersedes} on route ${routeId}, but the accepted ` +
        `body now hashes to ${acceptedSha}. Refusing to apply a recovery to different content.`,
    )
  }
  return { markdown: row.markdown, sha256: row.sha256 }
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

    /*
      The bounded content-recovery overlay. The frozen body above is still read and still gated by
      its accepted hash — that check runs first and is not conditional — and only then may a
      recovered body supersede it for rendering.

      That order is the whole design. The accepted body is not deleted, not edited and not
      un-gated; it remains on disk at its accepted hash, and a change to it still fails the build.
      The overlay names which routes carry a recovered body, records the hash of the superseded
      body so the supersession is provably of the body it claims, and carries its own hash for the
      recovered file. Both hashes are checked, so neither file can drift.
    */
    const recovered = recoveredBodyFor(row.route_id ?? '', bodySha256)

    const canonicalPath = row.canonical_path ?? ''
    if (!canonicalPath.startsWith('/') || !canonicalPath.endsWith('/')) {
      throw new CohortIntegrityError(
        `Route ${row.route_id} has a canonical path that is not a rooted directory URL`,
      )
    }

    return {
      bodyMarkdown: recovered?.markdown ?? bodyMarkdown,
      bodyRecovered: recovered !== null,
      bodySha256: recovered?.sha256 ?? bodySha256,
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
