import { z } from 'zod'
import { envelope } from './common'

/**
 * evidence-bundle: Search Evidence export → OGCS. The Factory never stores these (ADR-028: raw evidence
 * stays out of the client repository); the schema lives here so both sides validate the same shape.
 */
export const EVIDENCE_BUNDLE_VERSION = '1.0.0'
export const PROVENANCE = ['measured', 'imported', 'recorded', 'estimated', 'generated', 'unknown'] as const

const prov = z.enum(PROVENANCE)
/** Any measured block: numeric/boolean/string/list fields plus a mandatory provenance; `null` = not measured. */
const measured = z.object({ provenance: prov }).catchall(z.unknown()).nullable()

export const evidencePage = z
  .object({
    url: z.string().url(),
    canonicalized_url: z.string().url().optional(),
    gsc: measured.optional(),
    backlinks: measured.optional(),
    crawl: measured.optional(),
    surfer: measured.optional(),
    ai_visibility: measured.optional(),
  })
  .passthrough()

export const evidenceBundlePayload = z
  .object({
    source_format: z.string().min(1),
    source_version: z.union([z.string(), z.number()]),
    measurement_window: z
      .object({ start: z.string(), end: z.string(), basis: z.string().optional() })
      .passthrough(),
    coverage: z.record(z.string(), z.union([z.boolean(), z.number()])),
    pages: z.array(evidencePage),
    queries: z.array(z.unknown()).optional(),
    page_query_ownership: z.array(z.unknown()).optional(),
    findings: z.union([z.array(z.unknown()), z.record(z.string(), z.array(z.unknown()))]).optional(),
    action_queue: z.array(z.unknown()).optional(),
    run_history_reference: z.unknown().optional(),
  })
  .passthrough()
export const evidenceBundle = envelope(
  'factory.seo/evidence-bundle',
  EVIDENCE_BUNDLE_VERSION,
  evidenceBundlePayload,
)
export type EvidenceBundle = z.infer<typeof evidenceBundle>
