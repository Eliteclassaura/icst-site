import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { briefSchema, pickSelects } from './schema'
import { isDisposable, maskEmail, normalizeEmail, typoSuggestion } from './email'
import { scoreSpam, SPAM_THRESHOLD } from './spam'
import { checkRequestLimits, isDuplicate, recordSend } from './rate-limit'
import { scoreLead } from './score'

export type ProcessInput = {
  payload: Payload
  body: Record<string, unknown>
  ip: string
  userAgent?: string | null
  now?: Date
  /** From the `form-config` global — the only accepted option sets. */
  selects: Array<{ name: string; options: string[] }>
  /** Result of `turnstileReadiness()`: `required` means a missing/invalid token is a 403. */
  turnstile: { required: boolean; verify?: (token: string, ip: string) => Promise<boolean> }
  /** The `forms` document key for this form (seeded as `brief`). */
  formKey?: string
}

export type ProcessResult =
  | { ok: true; silent: true; reason: 'honeypot' | 'spam' | 'duplicate' }
  | { ok: true; silent: false; submissionId: string; leadId: string; maskedEmail: string; firstName: string }
  | { ok: false; status: 400 | 403 | 422 | 429 | 503; code: string; message: string; suggestion?: string }

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * The end-to-end lead (release-plan C6, definition-of-done item 4). Order matters: nothing is stored
 * before the abuse checks pass; the submission is stored before any email is attempted; every step
 * is idempotent on the dedupe key so a retry never duplicates a lead.
 */
export async function processBrief(input: ProcessInput): Promise<ProcessResult> {
  const { payload, body, ip } = input
  const now = input.now ?? new Date()
  const salt = process.env.IP_HASH_SALT || payload.secret
  const ipHash = sha(`${salt}:${ip}`)

  // 0. Rate limits — recorded before validation so a flood of garbage counts too.
  const limit = await checkRequestLimits(payload, ipHash, now)
  if (!limit.allowed)
    return {
      ok: false,
      status: 429,
      code: limit.reason,
      message: 'Too many requests. Please try again later.',
    }

  // 1. Shape
  const parsed = briefSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      status: 400,
      code: String(first?.message ?? 'invalid'),
      message: 'Please check the highlighted fields.',
    }
  }
  const d = parsed.data
  const { values: selectValues, errors: selectErrors } = pickSelects(body, input.selects)
  if (selectErrors.length)
    return {
      ok: false,
      status: 400,
      code: selectErrors[0]!,
      message: 'Please choose from the options offered.',
    }

  // 2. Honeypot — bots fill it; humans never see it. Silent 200, nothing stored.
  if (d.website_url) return { ok: true, silent: true, reason: 'honeypot' }

  // 3. Dwell — the JS enhancement sets t0; a native no-JS post has none and is allowed through (scored, not refused).
  let dwellSeconds: number | null = null
  if (d.t0) {
    const t0 = Number(d.t0)
    if (Number.isFinite(t0) && t0 > 0) dwellSeconds = Math.max(0, (now.getTime() - t0) / 1000)
    if (dwellSeconds !== null && dwellSeconds < 3)
      return {
        ok: false,
        status: 400,
        code: 'too-fast',
        message: 'That was quick — please take a moment and try again.',
      }
  }

  // 4. Turnstile (fail-closed when required)
  if (input.turnstile.required) {
    const token = d['cf-turnstile-response']
    if (!token || !input.turnstile.verify)
      return {
        ok: false,
        status: 403,
        code: 'turnstile-missing',
        message: 'Please complete the verification and try again.',
      }
    if (!(await input.turnstile.verify(token, ip)))
      return {
        ok: false,
        status: 403,
        code: 'turnstile-failed',
        message: 'Verification failed. Please try again.',
      }
  }

  // 5. Email layers: disposable → 422; typo → 422 with suggestion unless email_ok=1 (legacy behaviour)
  if (isDisposable(d.email))
    return {
      ok: false,
      status: 422,
      code: 'email-disposable',
      message: 'Please use a work or personal address we can reply to.',
    }
  const suggestion = d.email_ok === '1' ? null : typoSuggestion(d.email)
  if (suggestion)
    return { ok: false, status: 422, code: 'email-typo', message: `Did you mean ${suggestion}?`, suggestion }

  // 6. Spam score — silent accept, no records, so the sender learns nothing.
  const spam = scoreSpam({
    brief: d.brief,
    name: d.name,
    company: d.company,
    site: d.site,
    email: d.email,
    dwellSeconds,
  })
  if (spam.score >= SPAM_THRESHOLD) return { ok: true, silent: true, reason: 'spam' }

  // 7. Dedupe — same address + same brief inside the window is a retry.
  const emailNormalized = normalizeEmail(d.email)
  const dedupeKey = sha(`${emailNormalized}:${d.brief.trim().toLowerCase()}`)
  if (await isDuplicate(payload, dedupeKey, now)) return { ok: true, silent: true, reason: 'duplicate' }

  // 8. Records — contact (find or create) → submission → lead → activity. Local API with overrideAccess:
  //    the public route has no user; the access rules exist for humans and API keys.
  const form = input.formKey
    ? (
        await payload.find({
          collection: 'forms',
          where: { key: { equals: input.formKey } },
          limit: 1,
          overrideAccess: true,
        })
      ).docs[0]
    : undefined
  if (!form)
    return {
      ok: false,
      status: 503,
      code: 'form-not-configured',
      message: 'This form is not available right now.',
    }

  const existing = await payload.find({
    collection: 'contacts',
    where: { emailNormalized: { equals: emailNormalized } },
    limit: 1,
    overrideAccess: true,
  })
  const contact =
    existing.docs[0] ??
    (await payload.create({
      collection: 'contacts',
      data: { email: d.email.trim().toLowerCase(), emailNormalized, name: d.name, provenance: 'form' },
      overrideAccess: true,
    }))

  const fields = { ...selectValues, brief: d.brief, roadmapOptIn: Boolean(d.want_plan) }
  const submission = await payload.create({
    collection: 'submissions',
    data: {
      form: form.id,
      mode: 'brief',
      source: 'form',
      status: 'received',
      email: d.email.trim().toLowerCase(),
      name: d.name,
      company: d.company || undefined,
      site: d.site || undefined,
      fields,
      context: {
        page: d.page,
        dwellSeconds: dwellSeconds ?? undefined,
        referrer: d.referrer,
        utm: d.utm,
        screen: d.screen,
        language: d.language,
        timezone: d.timezone,
        userAgent: input.userAgent ?? undefined,
        ipHash,
      },
      spamScore: spam.score,
      spamReasons: spam.reasons,
      fingerprint: dedupeKey,
      contact: contact.id,
    },
    overrideAccess: true,
  })

  const rules = await payload.find({
    collection: 'lead-score-rules',
    where: { active: { equals: true } },
    limit: 200,
    overrideAccess: true,
  })
  const scored = scoreLead(
    { ...selectValues, company: d.company, site: d.site, brief: d.brief, roadmap: d.want_plan ? '1' : '' },
    rules.docs.map((r) => ({
      field: r.field,
      match: r.match,
      points: r.points,
      name: r.name,
      factor: r.factor,
    })),
  )

  const lead = await payload.create({
    collection: 'leads',
    data: {
      title: `${d.company || d.name} — ${selectValues.focus ?? selectValues.service ?? 'brief'}`,
      contact: contact.id,
      stage: 'new',
      source: 'form',
      attribution: { landingPage: d.page, referrer: d.referrer, utm: d.utm, campaign: d.utm?.utm_campaign },
      submittedFields: fields,
      score: scored.total,
      scoreBreakdown: scored.components,
    },
    overrideAccess: true,
  })

  await payload.update({
    collection: 'submissions',
    id: submission.id,
    data: { lead: lead.id, status: 'processed' },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'activities',
    data: {
      type: 'submission',
      contact: contact.id,
      lead: lead.id,
      submission: submission.id,
      summary: `Brief received from ${maskEmail(d.email)}`,
      data: { selects: selectValues, spamScore: spam.score },
    },
    overrideAccess: true,
  })

  // 9. Jobs — owner notification and CRM sync, both idempotent on ids the worker can re-run safely.
  await payload.jobs.queue({ task: 'notifyOwner', input: { submissionId: String(submission.id) } })
  await payload.jobs.queue({ task: 'crmSync', input: { leadId: String(lead.id) } })

  await recordSend(payload, ipHash, dedupeKey, now)
  return {
    ok: true,
    silent: false,
    submissionId: String(submission.id),
    leadId: String(lead.id),
    maskedEmail: maskEmail(d.email),
    firstName: d.name.split(/\s+/)[0] ?? '',
  }
}
