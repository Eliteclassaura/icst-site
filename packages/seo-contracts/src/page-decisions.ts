import { z } from 'zod'
import { envelope, handle, isoDate, sha256 } from './common'

export const PAGE_DECISIONS_VERSION = '1.0.0'
export const ACTIONS = [
  'PROTECT',
  'IMPROVE',
  'REWRITE',
  'REPOSITION',
  'CONSOLIDATE',
  'REDIRECT',
  'NOINDEX',
  'PRUNE',
  'REVIEW',
] as const
export const REDIRECT_SOURCES = ['migration', 'manual', 'slug-change', 'legacy-hash', 'automation'] as const
export const PARITY_CHECKS = [
  'title',
  'description',
  'h1',
  'word_count',
  'schema_type',
  'internal_links',
  'og',
  'canonical',
] as const

const url = z.string().url()

export const pageDecision = z
  .object({
    source_url: url,
    action: z.enum(ACTIONS),
    target_url: url.nullable().optional(),
    status_code: z
      .union([z.literal(301), z.literal(308), z.literal(410)])
      .nullable()
      .optional(),
    page_type: z.string().min(1),
    project_scale_fit: z.enum([
      'mega_industrial',
      'industrial',
      'adjacent',
      'small_commercial',
      'consumer',
      'irrelevant',
      'unknown',
    ]),
    strategic_fit_score: z.number().min(0).max(40),
    seo_equity_score: z.number().min(0).max(40).nullable(),
    seo_lock: z.boolean(),
    prune_blocked: z.boolean(),
    reason: z.string().min(1),
    why_should_this_exist: z.string().optional(),
    collection_hint: z.string().optional(),
    parity: z
      .object({
        accept: z.array(z.enum(PARITY_CHECKS)).optional(),
        word_count_blocking: z.boolean().optional(),
      })
      .optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if ((d.action === 'REDIRECT' || d.action === 'CONSOLIDATE') && (!d.target_url || !d.status_code))
      ctx.addIssue({
        code: 'custom',
        path: ['target_url'],
        message: `${d.action} requires target_url and status_code`,
      })
    if (d.action === 'PRUNE' && d.prune_blocked)
      ctx.addIssue({ code: 'custom', path: ['prune_blocked'], message: 'PRUNE while prune_blocked' })
    if (d.action === 'PRUNE' && d.seo_equity_score === null)
      ctx.addIssue({
        code: 'custom',
        path: ['seo_equity_score'],
        message: 'PRUNE requires measured SEO equity',
      })
  })

export const decisionRedirect = z.object({
  from: z.string().min(1),
  to: z.string().nullable(),
  status: z.union([z.literal(301), z.literal(308), z.literal(410)]),
  reason: z.string(),
  source: z.enum(REDIRECT_SOURCES),
})

export const pageDecisionsPayload = z
  .object({
    site: z.object({ source_origin: z.string().url(), target_origin: z.string().url() }).passthrough(),
    decisions_status: z.enum(['draft', 'approved']),
    approved_by: handle.nullable().optional(),
    approved_at: isoDate.nullable().optional(),
    evidence_bundle_sha256: sha256,
    review_window_days: z.number().int().min(0).optional(),
    pages: z.array(pageDecision),
    redirects: z.array(decisionRedirect),
    information_architecture: z.unknown().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.decisions_status === 'approved' && (!p.approved_by || !p.approved_at))
      ctx.addIssue({
        code: 'custom',
        path: ['approved_by'],
        message: 'approved requires approved_by and approved_at',
      })
  })

export const pageDecisions = envelope(
  'factory.seo/page-decisions',
  PAGE_DECISIONS_VERSION,
  pageDecisionsPayload,
)
export type PageDecisions = z.infer<typeof pageDecisions>
export type PageDecision = z.infer<typeof pageDecision>

/**
 * Importer-level rule (pack §2): while decisions are `draft`, PRUNE / REDIRECT / NOINDEX / CONSOLIDATE
 * degrade to REVIEW and the page is imported as a draft. Nothing structural happens on an unapproved run.
 */
export function effectiveAction(doc: PageDecisions, d: PageDecision): PageDecision['action'] {
  if (doc.payload.decisions_status === 'approved') return d.action
  return ['PRUNE', 'REDIRECT', 'NOINDEX', 'CONSOLIDATE'].includes(d.action) ? 'REVIEW' : d.action
}
