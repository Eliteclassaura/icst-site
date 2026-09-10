import { z } from 'zod'
import { ACTIONS, PARITY_CHECKS } from './page-decisions'
import { sha256, ulid } from './common'

/**
 * site-blueprint v2 (ADR-025 seam, ADR-028 §8). The v1 shape emitted by tools/legacy-extract plus:
 * `version: 2`, a required `parity` block, optional `source.decisions_run_id`, and per-page
 * `decision_ref` / `migration` provenance. Block payloads (`layout`, `seo`) are validated structurally
 * only — their field-level truth is Payload's, at seed time.
 */
export const BLUEPRINT_VERSION = 2

export const blueprintRedirect = z.object({
  from: z.string().min(1),
  to: z.string().nullable().optional(),
  status: z.union([z.literal(301), z.literal(308), z.literal(410)]),
  reason: z.string().optional(),
  source: z.enum(['migration', 'manual', 'slug-change', 'legacy-hash', 'automation']).optional(),
})

export const migrationProvenance = z
  .object({
    sourceUrl: z.string().url(),
    sourceId: z.string().optional(),
    sourceSystem: z.enum(['wordpress', 'static-html', 'copy-deck', 'other']).optional(),
    originalTitle: z.string().optional(),
    originalMetaDescription: z.string().optional(),
    originalH1: z.string().optional(),
    originalWordCount: z.number().int().optional(),
    contentHash: sha256.optional(),
    importedAt: z.string().optional(),
    decisionsVersion: ulid.optional(),
  })
  .nullable()

export const decisionRef = z
  .object({ run_id: ulid, source_url: z.string().url(), action: z.enum(ACTIONS) })
  .nullable()

export const blueprintPage = z
  .object({
    path: z.string().regex(/^\/([a-z0-9-]+\/)*$/, 'trailing-slash path'),
    slug: z.string().min(1),
    pageType: z.string().min(1),
    title: z.string().min(1),
    parent: z.string().nullable().optional(),
    seo: z.record(z.string(), z.unknown()),
    layout: z.array(z.object({ blockType: z.string().min(1) }).passthrough()),
    decision_ref: decisionRef.optional(),
    migration: migrationProvenance.optional(),
  })
  .passthrough()

export const blueprintParity = z.object({
  baseline: z.enum(['frozen-old-site', 'approved-staging']),
  accept: z
    .array(
      z.object({
        route: z.string(),
        field: z.string(),
        value: z.unknown().optional(),
        reason: z.string().min(1),
      }),
    )
    .default([]),
  wordCountBlocking: z.array(z.string()).default([]),
  checks: z.array(z.enum(PARITY_CHECKS)).optional(),
})

export const blueprint = z
  .object({
    version: z.literal(BLUEPRINT_VERSION),
    generatedAt: z.string(),
    source: z
      .object({
        archive: z.string(),
        files: z.record(z.string(), sha256),
        extractor: z.string(),
        decisions_run_id: ulid.nullable().optional(),
      })
      .passthrough(),
    site: z
      .object({ name: z.string().min(1), url: z.string().url(), trailingSlash: z.boolean() })
      .passthrough(),
    parity: blueprintParity,
    redirects: z.array(blueprintRedirect),
    /** Paths that must answer 404/410 with no body (legacy endpoints); served by the proxy, never redirected. */
    gone: z
      .array(z.object({ path: z.string().min(1), status: z.union([z.literal(404), z.literal(410)]) }))
      .default([]),
    media: z.array(z.unknown()),
    pages: z.array(blueprintPage),
  })
  .passthrough()
  .superRefine((b, ctx) => {
    const paths = new Set<string>()
    b.pages.forEach((p, i) => {
      if (paths.has(p.path))
        ctx.addIssue({ code: 'custom', path: ['pages', i, 'path'], message: `duplicate path ${p.path}` })
      paths.add(p.path)
    })
    const froms = new Set<string>()
    b.redirects.forEach((r, i) => {
      if (froms.has(r.from))
        ctx.addIssue({
          code: 'custom',
          path: ['redirects', i, 'from'],
          message: `duplicate redirect from ${r.from}`,
        })
      froms.add(r.from)
      if (r.status !== 410 && !r.to)
        ctx.addIssue({
          code: 'custom',
          path: ['redirects', i, 'to'],
          message: 'redirect needs a target unless 410',
        })
      if (paths.has(r.from))
        ctx.addIssue({
          code: 'custom',
          path: ['redirects', i, 'from'],
          message: `redirect shadows a page: ${r.from}`,
        })
    })
  })

export type Blueprint = z.infer<typeof blueprint>
export type BlueprintPage = z.infer<typeof blueprintPage>
