import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { lintCopy, type LintResult } from '../../email/copy-lint'
import { readEmailConfig, kindAllowed } from '../../email/config'
import { recipientRef } from '../../email/gate'
import { textToHtml } from '../../email/messages'
import { renderTemplate, templateHash, type MergeValues } from '../../email/templates'
import { recordActivity } from '../activity'
import { relId } from '../guards'
import { emailKey } from '../normalize'
import { messageIdFor } from '../notify'
import { officeCalendar } from '../offices'
import { officeSettings } from '../officeSettings'
import { ensureReplyToken, replyToAddress } from '../reply'
import { isApproved, textOf } from '../settings/templates'
import { activeFromLedger, ledgerFor } from '../suppression'
import { ensureSystemTask } from '../tasks'
import { endOfBusinessDay } from '../workspace/time'
import { ENROLLMENT_LIVE, MISSING_INFORMATION_ITEMS, type EnrollmentExitReason, type MissingInformationItem } from '../vocabulary'
import { afterBusinessDays } from './calendar'
import { ersSettings, type ErsSettings } from './settings'
import { runRules } from '../seq/rules'
import { advisoryLock, LIVE, transition, withRfqLock, type EnrollmentStatus } from './transition'
import { REPLY_HOLD_RECHECK_MS, checkVerdict, manualConfigured, releasedFirstEmails, unprocessedInbound } from './reply-mode'
import { unsubscribeUrl } from './unsubscribe'

/**
 * Revenue Engine slice 1 — the sequence engine (E0.1 runtime under the LEAN CUT; CT rulings 2026-10-05).
 *
 * A tick (every minute in the runner) takes enrollments whose `next_action_at` has come and runs their next step:
 *   WAIT  → the next step is due N business days later (the RFQ office's calendar, at the window's opening hour);
 *   TASK  → one idempotent task for the owner;
 *   EMAIL → gates 1–9 + 11–13 of the E0.1 order: exits, the approved template whose hash the version pinned, the merge
 *           (fail closed), the frozen copy-risk linter on the final text (BLOCK or REVIEW → hold), then ONE outbox row
 *           (idempotency key `seq:<enrollment>:<step>`). The enrollment waits for the row's outcome; the outbox worker
 *           runs the admission check (kill switch, mode, health, inbound freshness, exits again, window, caps).
 * Exits are re-checked before every step and again at send time: reply, new RFQ, RFQ closed or qualified, owner
 * responded, unsubscribe, bounce, complaint, suppression, manual stop. Holds pause the enrollment with a review task;
 * an admin resumes it after the fix. Nothing here sends mail.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }
const iso = (d: Date) => d.toISOString()
const find = async (payload: Payload, collection: string, where: Doc, opts: { limit?: number; sort?: string } = {}) =>
  (await payload.find({ collection: collection as never, where: where as never, limit: opts.limit ?? 100, sort: opts.sort, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
const byId = async (payload: Payload, collection: string, id: unknown) =>
  id ? ((await payload.findByID({ collection: collection as never, id: String(id), depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null) : null

export const CLOSED_RFQ = ['CLOSED', 'REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING']

// ── exits ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The suppression floor, as an exit reason (any active suppression blocks a non-transactional message). */
export function floorExit(reasons: string[]): EnrollmentExitReason | null {
  if (!reasons.length) return null
  const r = reasons[0]!
  if (r === 'UNSUBSCRIBED') return 'UNSUBSCRIBED'
  if (r === 'COMPLAINT') return 'COMPLAINT'
  if (r === 'HARD_BOUNCE' || r === 'INVALID_ADDRESS' || r === 'SOFT_BOUNCE_HOLD') return 'BOUNCED'
  return 'SUPPRESSED'
}

/**
 * Should this enrollment (or a candidate, with `since` = now) stop? `null` = no exit applies. `rfqId` is null for a
 * relationship, cohort or publication enrollment: the inquiry-specific goals (closed, qualified, owner responded, replies
 * on the inquiry thread) are skipped, and the contact-level ones (suppression floor, a newer inquiry, mail from this
 * address in the review queue) still apply.
 */
export async function exitReasonFor(payload: Payload, input: { contactId: string; rfqId: string | null; since: Date }): Promise<EnrollmentExitReason | null> {
  const contact = await byId(payload, 'crm-contacts', input.contactId)
  if (!contact || contact.record_state !== 'ACTIVE' || typeof contact.email_match_key !== 'string') return 'SUPPRESSED'
  const active = activeFromLedger(await ledgerFor({ payload } as never, contact.email_match_key))
  const floor = floorExit(active.map((r) => r.reason))
  if (floor) return floor
  if (input.rfqId) {
    const rfq = await byId(payload, 'crm-rfqs', input.rfqId)
    if (!rfq || CLOSED_RFQ.includes(String(rfq.status))) return 'RFQ_CLOSED'
    if (rfq.status === 'QUALIFIED' || rfq.qualification_state === 'COMPLETE' || (typeof rfq.motion === 'string' && rfq.motion)) return 'RFQ_QUALIFIED'
    if (rfq.follow_up_state === 'HUMAN_RESPONDED') return 'OWNER_RESPONDED'
  }
  const since = iso(input.since)
  const rfqs = await find(payload, 'crm-rfqs', { contact: { equals: input.contactId } }, { limit: 200 })
  const ids = rfqs.map((r) => String(r.id))
  if (rfqs.some((r) => String(r.id) !== input.rfqId && String(r.received_at ?? '') > since)) return 'RFQ_SUBMITTED'
  if (ids.length) {
    const msgs = await find(payload, 'crm-email-messages', { and: [{ rfq: { in: ids } }, { occurred_at: { greater_than: since } }] }, { limit: 200 })
    if (msgs.some((m) => m.direction === 'INBOUND')) return 'REPLIED'
    if (msgs.some((m) => m.direction === 'OUTBOUND' && m.status === 'SENT')) return 'OWNER_RESPONDED'
  }
  // A reply that M3 could not link (no token) still counts: the review queue holds mail from this address.
  const reviews = await find(payload, 'crm-email-review', { received_at: { greater_than: since } }, { limit: 500 })
  if (reviews.some((r) => emailKey(r.from_address)?.matchKey === contact.email_match_key)) return 'REPLIED'
  return null
}

// ── merge values ─────────────────────────────────────────────────────────────────────────────────────────────────
export const joinItems = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

export async function sequenceMergeValues(payload: Payload, s: ErsSettings, enr: Doc, rfq: Doc, contact: Doc): Promise<MergeValues> {
  const submitted = (rfq.submitted ?? {}) as Doc
  const missing = Array.isArray(enr.missing_items) ? (enr.missing_items as MissingInformationItem[]).filter((k) => k in MISSING_INFORMATION_ITEMS).map((k) => MISSING_INFORMATION_ITEMS[k]) : []
  // The owner's signature: the team and the sales address (2026-10-05). Owner rule 2026-10-06: no phone number and no
  // postal address in any email, so nothing about an office's phone can hold or block a step.
  return {
    first_name: String(contact.first_name ?? submitted.first_name ?? ''),
    rfq_reference: String(rfq.rfq_number ?? ''),
    missing_information_list: joinItems(missing),
    sequence_signature: [s.signature.signer, s.signature.email].filter(Boolean).join('\n'),
  }
}

/**
 * The footer the engine adds: the one-click unsubscribe link, always (the floor). Owner rule 2026-10-06: no postal
 * address and no phone number in any email, so there is no address line and nothing here can hold a step.
 */
export function footerFor(_s: ErsSettings, _sequence: Doc, enrollmentId: string): { text: string; url: string } | { hold: string } {
  const url = unsubscribeUrl(enrollmentId)
  return { text: `If you’d rather not receive these follow-ups, unsubscribe here: ${url}`, url }
}

// ── one step ─────────────────────────────────────────────────────────────────────────────────────────────────────
type StepResult = 'EXITED' | 'WAITED' | 'TASKED' | 'QUEUED' | 'HELD' | 'DEAD' | 'COMPLETED' | 'SKIPPED'

async function activity(payload: Payload, enr: Doc, summary: string, detail: Doc, key: string) {
  await recordActivity({ payload } as never, {
    type: 'SEQUENCE_EVENT',
    summary: summary.slice(0, 240),
    idempotency_key: key,
    rfq: relId(enr.rfq),
    account: relId(enr.account),
    contact: relId(enr.contact),
    detail,
    actor_kind: 'SYSTEM',
  })
}

/** The step the enrollment was on when this pass read it. A write that finds it moved (someone else ran or changed it) loses the race. */
const sameStep = (enr: Doc) => (locked: Doc) => Number(locked.current_step ?? 0) === Number(enr.current_step ?? 0)

/**
 * `user` is the person who stopped it (so the audit row names them); the engine's own exits pass none. Returns false when
 * the enrollment was no longer live under the lock (already stopped, exited or finished): nothing is written then.
 */
export async function exitEnrollment(payload: Payload, enr: Doc, reason: EnrollmentExitReason, now: Date, user?: unknown): Promise<boolean> {
  const r = await transition(payload, enr.id, {
    from: LIVE,
    to: 'EXITED',
    data: { status: 'EXITED', exit_reason: reason, exited_at: iso(now), next_action_at: null },
    user,
    work:
      reason === 'REPLIED'
        ? async ({ req }) => {
            await ensureSystemTask(req, {
              kind: 'SEQUENCE_REVIEW',
              title: 'Reply received on a sequence — read it and decide the next step',
              priority: 'HIGH',
              idempotency_key: `seq:${String(enr.id)}:replied`,
              source_rule: 'ERS:EXIT_REPLIED',
              assignee: relId(enr.owner),
              rfq: relId(enr.rfq),
              contact: relId(enr.contact),
              account: relId(enr.account),
            })
          }
        : undefined,
  })
  if (!r.ok) return false
  await activity(payload, enr, `Sequence stopped: ${reason.toLowerCase().replace(/_/g, ' ')}`, { enrollment: String(enr.id), exit: reason }, `seq:${String(enr.id)}:exit`)
  return true
}

async function hold(payload: Payload, enr: Doc, reason: 'LINT_HOLD' | 'RENDER_HOLD', code: string, now: Date): Promise<StepResult> {
  const r = await transition(payload, enr.id, {
    from: ['ACTIVE'],
    to: 'PAUSED',
    guard: sameStep(enr),
    data: { status: 'PAUSED', pause_reason: reason, hold_code: code.slice(0, 80), next_action_at: null },
    work: async ({ req }) => {
      await ensureSystemTask(req, {
        kind: 'SEQUENCE_REVIEW',
        title: reason === 'LINT_HOLD' ? 'A sequence email was held by the copy-risk check — review it' : 'A sequence email could not be completed — fix the missing value',
        priority: 'NORMAL',
        idempotency_key: `seq:${String(enr.id)}:hold:${String(enr.current_step)}:${code}`.slice(0, 200),
        source_rule: `ERS:${reason}`,
        assignee: relId(enr.owner),
        rfq: relId(enr.rfq),
        contact: relId(enr.contact),
        account: relId(enr.account),
        due_at: iso(now),
      })
    },
  })
  if (!r.ok) return 'SKIPPED'
  await activity(payload, enr, `Sequence step held (${code})`, { enrollment: String(enr.id), hold: reason, code }, `seq:${String(enr.id)}:hold:${String(enr.current_step)}`)
  return 'HELD'
}

export type Step = { step_key: string; type: 'EMAIL' | 'WAIT' | 'TASK'; template?: unknown; template_hash?: string | null; business_days?: number | null; task_title?: string | null; task_due_days?: number | null }

/** Render, lint and queue one EMAIL step. Exported for the dry run (`queue: false`). */
export async function renderStep(
  payload: Payload,
  s: ErsSettings,
  ctx: { enr: Doc; sequence: Doc; step: Step; rfq: Doc; contact: Doc },
): Promise<{ ok: true; subject: string; text: string; html: string; lint: LintResult; footerUrl: string } | { ok: false; kind: 'DEAD' | 'RENDER_HOLD' | 'LINT_HOLD'; code: string; lint?: LintResult }> {
  const tpl = await byId(payload, 'crm-email-templates', relId(ctx.step.template))
  if (!tpl || tpl.purpose !== 'SEQUENCE' || !isApproved(tpl) || templateHash(textOf(tpl)) !== ctx.step.template_hash) return { ok: false, kind: 'DEAD', code: 'TEMPLATE_CHANGED' }
  const values = await sequenceMergeValues(payload, s, ctx.enr, ctx.rfq, ctx.contact)
  const r = renderTemplate(textOf(tpl), values)
  if (!r.ok) return { ok: false, kind: 'RENDER_HOLD', code: r.code === 'MERGE_FIELD_MISSING' ? `MISSING_${r.missing.join('_').toUpperCase()}` : r.code }
  const lint = lintCopy(r.subject, r.text, 'FINAL')
  if (lint.decision === 'HOLD')
    return { ok: false, kind: 'LINT_HOLD', code: `LINT_${lint.hits.filter((h) => h.severity === 'BLOCK' || h.severity === 'REVIEW').map((h) => h.rule_id.replace('ICS_V2_', '')).slice(0, 4).join('_')}`, lint }
  const footer = footerFor(s, ctx.sequence, String(ctx.enr.id))
  if ('hold' in footer) return { ok: false, kind: 'RENDER_HOLD', code: footer.hold }
  const text = `${r.text.trimEnd()}\n\n${footer.text}\n`
  return { ok: true, subject: r.subject, text, html: textToHtml(text), lint, footerUrl: footer.url }
}

class BatchFull extends Error {}

async function queueEmail(payload: Payload, s: ErsSettings, ctx: { enr: Doc; sequence: Doc; step: Step; rfq: Doc; contact: Doc }, now: Date, batch?: { limit: number; firstKey: string }): Promise<StepResult> {
  const { enr, step, rfq, contact } = ctx
  const idem = `seq:${String(enr.id)}:${step.step_key}`
  const existing = (await find(payload, 'crm-email-outbox', { idempotency_key: { equals: idem } }, { limit: 1 }))[0]
  if (existing?.status === 'SENT') return advance(payload, enr, now)
  const rendered = await renderStep(payload, s, ctx)
  if (!rendered.ok) {
    if (rendered.kind === 'DEAD') {
      const r = await transition(payload, enr.id, { from: ['ACTIVE'], to: 'DEAD_LETTER', guard: sameStep(enr), data: { status: 'DEAD_LETTER', hold_code: rendered.code, next_action_at: null } })
      return r.ok ? 'DEAD' : 'SKIPPED'
    }
    return hold(payload, enr, rendered.kind, rendered.code, now)
  }
  const to = emailKey(contact.email)
  if (!to) return hold(payload, enr, 'RENDER_HOLD', 'NO_VALID_ADDRESS', now)
  const cfg = readEmailConfig()
  // SEND-FIX-1a (R2-02): sequence email is not in the allowed kinds at launch — held for review, nothing queued
  if (!kindAllowed('SEQUENCE_EMAIL', cfg)) return hold(payload, enr, 'RENDER_HOLD', 'KIND_NOT_ALLOWED', now)
  const msg = rendered
  const addr = to
  let rowId = ''
  // N1: the reply token first, in its own transaction in the staff order (RFQ, then token); idempotent and reusable, so
  // doing it before the lock costs nothing if the transition then loses a race.
  const token = await withRfqLock(payload, String(rfq.id), (req) => ensureReplyToken(req, String(rfq.id), now))
  // R1: the outbox row and the ACTIVE → AWAITING_SEND change are ONE transaction under the row lock.
  // If a person paused or stopped meanwhile, the status read under the lock is not ACTIVE and none of it happens.
  let r: Awaited<ReturnType<typeof transition>>
  try {
    r = await transitionToSend()
  } catch (err) {
    if (err instanceof BatchFull) return deferStep(payload, enr, 'BATCH_FULL', now)
    throw err
  }
  return r.ok ? 'QUEUED' : 'SKIPPED'

  function transitionToSend() {
    return transition(payload, enr.id, {
    from: ['ACTIVE'],
    to: 'AWAITING_SEND',
    guard: sameStep(enr),
    data: () => ({ status: 'AWAITING_SEND', awaiting_outbox: rowId, next_action_at: null, hold_code: null, pause_reason: null }),
    work: async ({ req }) => {
      // Manual reply mode: the first-email batch is bounded. The count and the insert share one lock, so two workers
      // cannot both take the last place.
      if (batch) {
        await advisoryLock(payload, req, `ers-batch:${String(ctx.sequence.id)}`)
        if ((await releasedFirstEmails(payload, String(ctx.sequence.id), batch.firstKey)) >= batch.limit) throw new BatchFull()
      }
      const row = {
        kind: 'SEQUENCE_EMAIL',
        status: 'PENDING',
        rfq: String(rfq.id),
        enrollment: String(enr.id),
        step_key: step.step_key,
        recipient_ref: recipientRef(addr.canonical),
        to_address: addr.canonical,
        recipient_domain: addr.domain,
        subject: msg.subject,
        body_text: msg.text,
        body_html: msg.html,
        lint: msg.lint,
        approval_decision: 'AUTO_AUTHORIZED',
        reply_to: cfg.fromAddress ? replyToAddress(cfg.fromAddress, token, cfg.replyTag) : null,
        list_unsubscribe: msg.footerUrl,
        attempts: 0,
        next_attempt_at: null,
        last_error_code: null,
      }
      if (existing) {
        // The same logical message again (a held or suppressed step being resumed): the row and its Message-ID are reused.
        // SEND-FIX-1a: a row that was handed to the mail server (SUBMITTING) or may have been delivered (UNCERTAIN) is never
        // reset to PENDING — that would send it again.
        if (!['PENDING', 'RETRY', 'SENDING', 'SUBMITTING', 'UNCERTAIN'].includes(String(existing.status))) await payload.update({ collection: 'crm-email-outbox', id: String(existing.id), data: row as never, ...sys, req })
        rowId = String(existing.id)
      } else {
        const created = (await payload.create({ collection: 'crm-email-outbox', data: { ...row, idempotency_key: idem, message_id: messageIdFor(cfg) } as never, ...sys, req })) as unknown as Doc
        rowId = String(created.id)
      }
    },
    })
  }
}

/** Keep the enrollment running but not yet due: a hold that releases itself when the reason clears (manual reply mode). */
async function deferStep(payload: Payload, enr: Doc, code: string, now: Date): Promise<StepResult> {
  const r = await transition(payload, enr.id, {
    from: ['ACTIVE'],
    to: 'ACTIVE',
    guard: sameStep(enr),
    data: { hold_code: code, next_action_at: iso(new Date(now.getTime() + REPLY_HOLD_RECHECK_MS)) },
  })
  return r.ok ? 'HELD' : 'SKIPPED'
}

/** Move to the next step. `from` is the status the caller expects: ACTIVE after a wait or task, AWAITING_SEND after a send. */
async function advance(payload: Payload, enr: Doc, now: Date, nextAt: Date = now, from: readonly EnrollmentStatus[] = ['ACTIVE']): Promise<StepResult> {
  const r = await transition(payload, enr.id, {
    from,
    to: 'ACTIVE',
    guard: sameStep(enr),
    data: (locked) => ({ status: 'ACTIVE', current_step: Number(locked.current_step ?? 0) + 1, last_step_at: iso(now), next_action_at: iso(nextAt), awaiting_outbox: null }),
  })
  return r.ok ? 'WAITED' : 'SKIPPED'
}

export async function runEnrollment(payload: Payload, s: ErsSettings, enr: Doc, now: Date, ctx: { inboundOk?: boolean } = {}): Promise<StepResult> {
  const sequence = await byId(payload, 'crm-sequences', relId(enr.sequence))
  if (!sequence || sequence.run_state !== 'ACTIVE') return 'SKIPPED'
  // Reply detection is not live: only a program in manual reply mode (an owner, coverage, a batch size) may run at all.
  const unmonitored = ctx.inboundOk === false
  if (unmonitored && !manualConfigured(sequence)) return 'SKIPPED'
  const version = await byId(payload, 'crm-sequence-versions', relId(enr.version))
  if (!version || version.state === 'DRAFT') {
    const r = await transition(payload, enr.id, { from: ['ACTIVE'], to: 'DEAD_LETTER', guard: sameStep(enr), data: { status: 'DEAD_LETTER', hold_code: 'VERSION_INVALID', next_action_at: null } })
    return r.ok ? 'DEAD' : 'SKIPPED'
  }
  const exit = await exitReasonFor(payload, { contactId: String(relId(enr.contact)), rfqId: relId(enr.rfq) ? String(relId(enr.rfq)) : null, since: new Date(String(enr.enrolled_at)) })
  if (exit) return (await exitEnrollment(payload, enr, exit, now)) ? 'EXITED' : 'SKIPPED'
  const steps = (version.steps ?? []) as Step[]
  const i = Number(enr.current_step ?? 0)
  const step = steps[i]
  if (!step) {
    const r = await transition(payload, enr.id, { from: ['ACTIVE'], to: 'COMPLETED', guard: sameStep(enr), data: { status: 'COMPLETED', next_action_at: null } })
    if (!r.ok) return 'SKIPPED'
    await activity(payload, enr, 'Sequence completed', { enrollment: String(enr.id) }, `seq:${String(enr.id)}:completed`)
    return 'COMPLETED'
  }
  // An enrollment without an inquiry uses the US office calendar (the default office) for its waits.
  const rfq = relId(enr.rfq) ? await byId(payload, 'crm-rfqs', relId(enr.rfq)) : null
  const cal = officeCalendar(rfq?.office === 'TH' ? 'TH' : 'US', await officeSettings(payload))
  if (step.type === 'WAIT') return advance(payload, enr, now, afterBusinessDays(now, Number(step.business_days ?? 0), cal, s.windowStartHour))
  if (step.type === 'TASK') {
    const due = afterBusinessDays(now, Number(step.task_due_days ?? 0), cal, s.windowStartHour)
    // The task and the move to the next step commit together, under the lock.
    const r = await transition(payload, enr.id, {
      from: ['ACTIVE'],
      to: 'ACTIVE',
      guard: sameStep(enr),
      data: (locked) => ({ status: 'ACTIVE', current_step: Number(locked.current_step ?? 0) + 1, last_step_at: iso(now), next_action_at: iso(now), awaiting_outbox: null }),
      work: async ({ req }) => {
        await ensureSystemTask(req, {
          kind: 'SEQUENCE_STEP',
          title: String(step.task_title ?? 'Sequence task').slice(0, 200),
          priority: 'NORMAL',
          idempotency_key: `seq:${String(enr.id)}:${step.step_key}`,
          source_rule: `ERS:${String(sequence.key)}:${step.step_key}`,
          assignee: relId(enr.owner),
          rfq: relId(enr.rfq),
          contact: relId(enr.contact),
          account: relId(enr.account),
          due_at: iso(endOfBusinessDay(due, cal.zone)),
        })
      },
    })
    if (!r.ok) return 'SKIPPED'
    await activity(payload, enr, `Sequence task created: ${String(step.task_title ?? '')}`, { enrollment: String(enr.id), step: step.step_key }, `seq:${String(enr.id)}:${step.step_key}`)
    return 'TASKED'
  }
  // Replies come back on an inquiry thread (reply token). Until an enrollment-anchored reply address is agreed, an email step
  // for an enrollment with no inquiry is held, never sent.
  if (!rfq) return hold(payload, enr, 'RENDER_HOLD', 'NO_REPLY_ANCHOR', now)
  // Manual reply mode: the first email goes out in a bounded batch; every later email waits for the owner's reply check.
  let batch: { limit: number; firstKey: string } | undefined
  if (unmonitored) {
    const firstEmail = steps.find((x) => x.type === 'EMAIL')!
    if (step.step_key === firstEmail.step_key) batch = { limit: Number(sequence.initial_batch), firstKey: firstEmail.step_key }
    else {
      const verdict = checkVerdict(sequence, now, await unprocessedInbound(payload))
      if (!verdict.ok) return deferStep(payload, enr, 'REPLY_REVIEW', now)
    }
  }
  const contact = (await byId(payload, 'crm-contacts', relId(enr.contact)))!
  return queueEmail(payload, s, { enr, sequence, step, rfq, contact }, now, batch)
}

export type TickResult = { ran: boolean; reason?: string; processed: number; results: Partial<Record<StepResult, number>>; rules?: { created: number; skipped: number } }

/** One engine pass. The caller (runner) checks inbound freshness; `deps.inboundOk` lets tests state it. */
export async function tick(payload: Payload, opts: { now?: Date; inboundOk: boolean; limit?: number }): Promise<TickResult> {
  const now = opts.now ?? new Date()
  const s = await ersSettings(payload, now.getTime())
  if (!s.enabled) return { ran: false, reason: 'ERS_OFF', processed: 0, results: {} }
  // CT ruling 3: without live reply detection no step runs (a reply might already be waiting), EXCEPT a program in manual
  // reply mode, which releases a bounded first batch and holds every follow-up until its owner records a reply check.
  if (!opts.inboundOk) {
    const manual = await payload.count({ collection: 'crm-sequences', where: { and: [{ run_state: { equals: 'ACTIVE' } }, { reply_mode: { equals: 'MANUAL' } }] } as never, overrideAccess: true })
    if (!manual.totalDocs) return { ran: false, reason: 'INBOUND_STALE', processed: 0, results: {} }
  }
  const due = await find(payload, 'crm-enrollments', { and: [{ status: { equals: 'ACTIVE' } }, { next_action_at: { less_than_equal: iso(now) } }] }, { limit: opts.limit ?? 25, sort: 'next_action_at' })
  const results: TickResult['results'] = {}
  for (const enr of due) {
    try {
      const r = await runEnrollment(payload, s, enr, now, { inboundOk: opts.inboundOk })
      results[r] = (results[r] ?? 0) + 1
    } catch (err) {
      payload.logger.error({ code: 'ERS_STEP_FAILED', enrollment: String(enr.id), errName: (err as Error)?.name })
    }
  }
  // Trigger rules (admin-enabled, only possible with every gate met) enroll on match; inert unless the engine is on and healthy.
  const rules = s.health.state === 'ACTIVE' ? await runRules(payload, { engineOn: true, now }) : null
  return { ran: true, processed: due.length, results, ...(rules && (rules.created || rules.skipped) ? { rules: { created: rules.created, skipped: rules.skipped } } : {}) }
}

/** The outbox worker reports a sequence row's terminal outcome. Every status change goes through the row lock. */
export async function onSequenceRowTerminal(payload: Payload, row: Doc, status: string, code: string | null, now: Date): Promise<void> {
  const enr = await byId(payload, 'crm-enrollments', relId(row.enrollment))
  if (!enr || !ENROLLMENT_LIVE.includes(enr.status as never)) return
  if (status === 'SENT') {
    await activity(payload, enr, `Sequence email sent (${String(row.step_key)})`, { enrollment: String(enr.id), step: row.step_key, outbox: String(row.id) }, `seq:${String(enr.id)}:${String(row.step_key)}:sent`)
    // Only an enrollment still waiting on this send moves on. A paused or stopped one stays paused or stopped.
    await advance(payload, enr, now, now, ['AWAITING_SEND'])
    return
  }
  if (code === 'HARD_BOUNCE') {
    await exitEnrollment(payload, enr, 'BOUNCED', now)
    return
  }
  if (status === 'SUPPRESSED_BY_SUPPRESSION' && code?.startsWith('EXIT_')) {
    await exitEnrollment(payload, enr, code.slice(5) as EnrollmentExitReason, now)
    return
  }
  if (status === 'SUPPRESSED_BY_MODE') {
    // Allowlist mode and an address that is not on the list: held, so it can resume if the address is allowed later.
    await transition(payload, enr.id, { from: ['AWAITING_SEND'], to: 'PAUSED', data: { status: 'PAUSED', pause_reason: 'MANUAL', hold_code: code ?? 'MODE', next_action_at: null } })
    return
  }
  await transition(payload, enr.id, { from: ['AWAITING_SEND'], to: 'DEAD_LETTER', data: { status: 'DEAD_LETTER', hold_code: code ?? status, next_action_at: null } })
}

/** Stop every live enrollment for an address (the suppression ledger's hook calls this when a row is recorded). One lock per transaction, in id order. */
export async function exitForAddress(payload: Payload, emailMatchKey: string, reason: EnrollmentExitReason, now: Date): Promise<number> {
  const contacts = await find(payload, 'crm-contacts', { email_match_key: { equals: emailMatchKey } }, { limit: 50 })
  if (!contacts.length) return 0
  const live = (await find(payload, 'crm-enrollments', { and: [{ contact: { in: contacts.map((c) => String(c.id)) } }, { status: { in: [...ENROLLMENT_LIVE] } }] }, { limit: 200 })).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  let n = 0
  for (const enr of live) if (await exitEnrollment(payload, enr, reason, now)) n++
  return n
}

/** E0.1 dry-run / cohort identity: a stable hash of what would be enrolled into which version. */
export const cohortHash = (versionHash: string, pairs: Array<{ contactId: string; rfqId: string }>): string =>
  createHash('sha256').update(JSON.stringify([versionHash, pairs.map((p) => `${p.contactId}:${p.rfqId}`).sort()])).digest('hex')

