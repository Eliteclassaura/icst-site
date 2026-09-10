import { z } from 'zod'
import { envelope, sha256, ulid } from './common'

export const QA_REPORT_VERSION = '1.0.0'
export const QA_CHECKS = [
  'status',
  'title',
  'description',
  'canonical',
  'robots',
  'og',
  'twitter',
  'h1',
  'schema_type',
  'schema_id',
  'anchor',
  'internal_link',
  'redirect',
  'noindex',
  'protect_missing',
  'word_count',
  'glossary_anchors',
] as const

export const qaFinding = z.object({
  url: z.string(),
  check: z.enum(QA_CHECKS),
  expected: z.unknown(),
  actual: z.unknown(),
  note: z.string().optional(),
})

export const qaReportPayload = z.object({
  environment: z.enum(['local', 'ci', 'staging', 'production']),
  base_url: z.string().url(),
  baseline: z.object({ kind: z.enum(['frozen-old-site', 'approved-staging']), sha256: z.string() }),
  blueprint_sha256: sha256,
  page_decisions_run_id: ulid.nullable().optional(),
  result: z.enum(['pass', 'fail']),
  blocking: z.array(qaFinding),
  advisory: z.array(qaFinding),
  coverage: z.object({
    routes_checked: z.number().int(),
    routes_in_decisions: z.number().int().optional(),
    protect_urls_missing: z.number().int(),
  }),
  e2e: z.object({ passed: z.number().int(), failed: z.number().int() }).optional(),
  lighthouse: z.record(z.string(), z.number()).optional(),
})

export const qaReport = envelope('factory.seo/qa-report', QA_REPORT_VERSION, qaReportPayload)
export type QaReport = z.infer<typeof qaReport>
