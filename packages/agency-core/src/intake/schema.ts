import { z } from 'zod'
import { EMAIL_RE } from './email'

/**
 * Brief-form payload (C6). Field names mirror the legacy `send.php` request so the CRM mapping is
 * one-to-one. Select fields are validated against the `form-config` options at runtime (the schema
 * only bounds their length), the honeypot and dwell timer ride along, and the Turnstile token is
 * optional here — its presence is decided by `turnstileReadiness()` in the route.
 */
export const briefSchema = z.object({
  name: z.string().trim().min(1, 'name-required').max(120),
  email: z.string().trim().max(254).regex(EMAIL_RE, 'email-invalid'),
  company: z.string().trim().max(160).optional().default(''),
  site: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default('')
    .transform((s) => s.replace(/^https?:\/\//i, '').replace(/\/$/, '')),
  brief: z.string().trim().min(1, 'brief-required').max(4000),
  want_plan: z.union([z.literal('1'), z.literal('on'), z.literal('true')]).optional(), // roadmap opt-in, legacy name
  website_url: z.string().max(500).optional().default(''), // honeypot
  t0: z.string().max(20).optional().default(''), // dwell timer (epoch ms), empty without JS
  'cf-turnstile-response': z.string().max(4096).optional(),
  email_ok: z.string().max(1).optional(), // typo-layer bypass, mirrors legacy email_ok=1
  // Context captured by the client enhancement; all optional, all bounded.
  page: z.string().max(300).optional(),
  referrer: z.string().max(500).optional(),
  utm: z.record(z.string().max(60), z.string().max(200)).optional(),
  screen: z.string().max(20).optional(),
  language: z.string().max(20).optional(),
  timezone: z.string().max(60).optional(),
})
export type BriefInput = z.input<typeof briefSchema>
export type Brief = z.output<typeof briefSchema>

/** Extra select fields (service, budget, timeline…) come from form-config; they are validated as `name → one of options`. */
export function pickSelects(
  body: Record<string, unknown>,
  selects: Array<{ name: string; options: string[] }>,
): { values: Record<string, string>; errors: string[] } {
  const values: Record<string, string> = {}
  const errors: string[] = []
  for (const s of selects) {
    const v = body[s.name]
    if (v === undefined || v === '') continue
    if (typeof v !== 'string' || !s.options.includes(v)) errors.push(`${s.name}-invalid`)
    else values[s.name] = v
  }
  return { values, errors }
}
