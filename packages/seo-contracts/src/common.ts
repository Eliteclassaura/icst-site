import { z } from 'zod'

/**
 * Shared pieces of every contract (ADR-028 §2; pack §seo-contracts.md). Semver versions, ULID run ids,
 * SHA-256 provenance, and the platform rule that no string anywhere in an artefact may be an email.
 */
export const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

/** Recursively refuses any string that looks like an email address (ADR-028 §10). */
export function findEmailStrings(value: unknown, path = '$'): string[] {
  if (typeof value === 'string') return EMAIL_PATTERN.test(value) ? [path] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => findEmailStrings(v, `${path}[${i}]`))
  if (value && typeof value === 'object')
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      findEmailStrings(v, `${path}.${k}`),
    )
  return []
}

export const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'semver')
export const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'ULID')
export const sha256 = z.string().regex(/^[a-f0-9]{64}$/, 'sha256 hex')
export const isoDate = z.string().datetime({ offset: true })
export const handle = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[^@\s]+$/, 'handle, not an email')

export const producedBy = z.object({
  system: z.enum(['ogcs', 'ses-adapter', 'factory-ci', 'wordpress-import', 'decisions-apply', 'factory-app']),
  version: z.string().min(1),
})
export const provenanceInput = z.object({ artefact: z.string().min(1), sha256 })

export function envelope<TName extends string, TPayload extends z.ZodTypeAny>(
  contract: TName,
  version: string,
  payload: TPayload,
) {
  const [major] = version.split('.')
  return z
    .object({
      contract: z.literal(contract),
      contract_version: semver.refine((v) => v.split('.')[0] === major, {
        message: `MAJOR must be ${major}`,
      }),
      produced_by: producedBy,
      produced_at: isoDate,
      project_id: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-z0-9][a-z0-9-]*$/),
      run_id: ulid,
      inputs: z.array(provenanceInput),
      payload,
    })
    .superRefine((doc, ctx) => {
      for (const p of findEmailStrings(doc))
        ctx.addIssue({ code: 'custom', message: `email address not allowed in artefacts (${p})`, path: [] })
    })
}

export type Envelope<T> = {
  contract: string
  contract_version: string
  produced_by: z.infer<typeof producedBy>
  produced_at: string
  project_id: string
  run_id: string
  inputs: z.infer<typeof provenanceInput>[]
  payload: T
}
