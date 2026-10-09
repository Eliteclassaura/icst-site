import type { Where } from 'payload'
import { relId } from '../guards'
import { emailKey } from '../normalize'
import type { Outcome } from '../workspace/mutations'
import { asUser, type CrmSession } from '../workspace/session'
import { segmentWhere } from '../workspace/views'
import { MISSING_INFORMATION_ITEMS, type MissingInformationItem } from '../vocabulary'
import { CLOSED_RFQ, cohortHash, exitEnrollment, exitReasonFor, renderStep, type Step } from './engine'
import { ersSettings } from './settings'
import { createEnrollment } from './create'
import { identityBase, rfqIdentity, purposeNeedsRfq, type Identity } from './identity'
import { transition } from './transition'

/**
 * Revenue Engine slice 1 — enrollment (LEAN CUT 3): from one RFQ or contact (a person, any CRM user), or from a saved
 * view (admins, bulk). Every enrollment is anchored to an RFQ from the contact — the relationship basis in every
 * country (CT ruling 1) — so a contact without an open RFQ is not enrolled.
 *
 * Bulk enrollment is two steps (E0.1 §7 dry run): the preview evaluates every candidate exactly as the engine will
 * (exits, suppression floor, already enrolled, address), renders the first email for a sample, and returns a cohort
 * hash; "Enroll" re-runs the preview and refuses unless the hash still matches, so what was reviewed is what runs.
 * Candidates are read AS THE USER (access applies); the preview sends and writes nothing.
 */
type Doc = Record<string, unknown>
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })
export const MAX_COHORT = 500

export type Source = { rfqId?: string; contactId?: string; savedViewId?: string }
export type PreviewRow = { contactId: string | null; rfqId: string | null; label: string; decision: 'ENROLL' | 'SKIP'; reasons: string[] }
export type Preview = {
  ok: true
  sequenceId: string
  versionId: string
  versionHash: string
  rows: PreviewRow[]
  counts: Record<string, number>
  samples: Array<{ label: string; subject: string; text: string; lint: string } | { label: string; held: string }>
  cohortHash: string
}

const ACCEPTABLE_RFQ = (r: Doc) => !CLOSED_RFQ.includes(String(r.status))

async function latestOpenRfq(s: CrmSession, contactId: string): Promise<Doc | null> {
  const res = await s.payload.find({ collection: 'crm-rfqs', where: { contact: { equals: contactId } }, sort: '-received_at', limit: 20, depth: 0, ...asUser(s) })
  return (res.docs as unknown as Doc[]).find(ACCEPTABLE_RFQ) ?? null
}

/** RFQ + contact pairs for a source (deduplicated by contact; a contact's latest open RFQ anchors it). */
async function candidates(s: CrmSession, src: Source): Promise<{ pairs: Array<{ rfq: Doc | null; contactId: string | null }> } | Outcome> {
  if (src.rfqId) {
    const rfq = (await s.payload.findByID({ collection: 'crm-rfqs', id: src.rfqId, depth: 0, ...asUser(s) }).catch(() => null)) as Doc | null
    if (!rfq) return fail('NOT_FOUND', 'That inquiry doesn’t exist or you don’t have access.')
    return { pairs: [{ rfq, contactId: relId(rfq.contact) }] }
  }
  if (src.contactId) {
    const contact = await s.payload.findByID({ collection: 'crm-contacts', id: src.contactId, depth: 0, ...asUser(s) }).catch(() => null)
    if (!contact) return fail('NOT_FOUND', 'That contact doesn’t exist or you don’t have access.')
    return { pairs: [{ rfq: await latestOpenRfq(s, src.contactId), contactId: src.contactId }] }
  }
  if (src.savedViewId) {
    if (!s.isAdmin) return fail('FORBIDDEN', 'Enrolling a saved view is for admins.')
    const view = (await s.payload.findByID({ collection: 'crm-saved-views', id: src.savedViewId, depth: 0, ...asUser(s) }).catch(() => null)) as Doc | null
    if (!view) return fail('NOT_FOUND', 'That saved view doesn’t exist or you don’t have access.')
    if (view.list !== 'inbox' && view.list !== 'contacts') return fail('VIEW_LIST', 'Enroll from an inquiry view or a contact view.')
    const seg = await segmentWhere(s, view.list as 'inbox' | 'contacts', String(view.query ?? ''))
    const res = await s.payload.find({ collection: seg.collection, where: seg.where as Where, limit: MAX_COHORT + 1, depth: 0, ...asUser(s) })
    if (res.docs.length > MAX_COHORT) return fail('COHORT_TOO_LARGE', `The view has more than ${MAX_COHORT} records. Narrow it first.`)
    const pairs: Array<{ rfq: Doc | null; contactId: string | null }> = []
    const seen = new Set<string>()
    for (const d of res.docs as unknown as Doc[]) {
      const contactId = seg.collection === 'crm-rfqs' ? relId(d.contact) : String(d.id)
      if (contactId && seen.has(contactId)) continue
      if (contactId) seen.add(contactId)
      pairs.push({ rfq: seg.collection === 'crm-rfqs' ? d : contactId ? await latestOpenRfq(s, contactId) : null, contactId })
    }
    return { pairs }
  }
  return fail('NO_SOURCE', 'Choose an inquiry, a contact or a saved view.')
}

/**
 * Who and what an enrollment is about (ENGINE-SCOPE-1b). An inquiry response is about the inquiry. A quote follow-up is
 * about the deal the inquiry became, and its event is that deal's last stage change, so a NEW quote on the same deal is a
 * new cycle once the first has ended, while a replay is not. Other purposes are not started from an inquiry.
 */
async function scopeFor(s: CrmSession, seq: Doc, contactId: string, rfq: Doc): Promise<{ identity: Identity; eventRef: string } | { reason: string }> {
  const purpose = String(seq.purpose ?? 'RFQ_RESPONSE')
  if (purpose === 'RFQ_RESPONSE') return { identity: rfqIdentity(String(seq.id), contactId, String(rfq.id)), eventRef: String(rfq.id) }
  if (purpose === 'QUOTE_FOLLOWUP') {
    const oppId = relId(rfq.opportunity)
    if (!oppId) return { reason: 'NO_DEAL' }
    const opp = (await s.payload.findByID({ collection: 'crm-opportunities', id: String(oppId), depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
    return {
      identity: { sequenceId: String(seq.id), contactId, purpose: 'QUOTE_FOLLOWUP', scopeKind: 'DEAL', scopeRef: String(oppId) },
      eventRef: `deal:${String(oppId)}:${String(opp?.last_stage_change ?? 'v1')}`,
    }
  }
  return { reason: 'NOT_FROM_INQUIRY' }
}

const validItems = (items: unknown): MissingInformationItem[] =>
  [...new Set((Array.isArray(items) ? items : []).filter((k): k is MissingInformationItem => typeof k === 'string' && k in MISSING_INFORMATION_ITEMS))]

export async function previewEnrollment(s: CrmSession, input: { sequenceId?: string; source: Source; missingItems?: unknown }, now = new Date()): Promise<Preview | Outcome> {
  const seq = input.sequenceId ? ((await s.payload.findByID({ collection: 'crm-sequences', id: input.sequenceId, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null) : null
  if (!seq) return fail('NOT_FOUND', 'Choose a sequence.')
  if (seq.run_state !== 'ACTIVE' || !seq.published_version) return fail('SEQUENCE_NOT_RUNNING', 'That sequence is not running.')
  const versionId = String(relId(seq.published_version))
  const version = (await s.payload.findByID({ collection: 'crm-sequence-versions', id: versionId, depth: 0, overrideAccess: true })) as unknown as Doc
  if (!purposeNeedsRfq(String(seq.purpose ?? 'RFQ_RESPONSE'))) return fail('PURPOSE_NOT_MANUAL', 'This program is not started from an inquiry. It is enrolled from a list, which is not available yet.')
  const items = validItems(input.missingItems)
  if (seq.needs_missing_items && !input.source.rfqId) return fail('ONE_RFQ_ONLY', 'This sequence asks for specific missing items, so it is started from one inquiry at a time.')
  if (seq.needs_missing_items && items.length === 0) return fail('MISSING_ITEMS_REQUIRED', 'Tick the items that are missing.')
  const c = await candidates(s, input.source)
  if ('ok' in c) return c
  const settings = await ersSettings(s.payload, now.getTime())
  const rows: PreviewRow[] = []
  for (const p of c.pairs) {
    const reasons: string[] = []
    const contact = p.contactId ? ((await s.payload.findByID({ collection: 'crm-contacts', id: p.contactId, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null) : null
    const label = String(p.rfq?.rfq_number ?? contact?.display_name ?? 'unknown')
    if (!contact) reasons.push('NO_CONTACT')
    else if (!emailKey(contact.email)) reasons.push('NO_VALID_ADDRESS')
    if (!p.rfq || !ACCEPTABLE_RFQ(p.rfq)) reasons.push('NO_OPEN_RFQ')
    if (contact && p.rfq && reasons.length === 0) {
      const scope = await scopeFor(s, seq, String(contact.id), p.rfq)
      if ('reason' in scope) reasons.push(scope.reason)
      else {
        // A replay (same event) or a live enrollment of this identity is "already enrolled"; a new event after the earlier one ended is a new cycle.
        const earlier = (await s.payload.find({ collection: 'crm-enrollments', where: { identity_base: { equals: identityBase(scope.identity) } } as never, limit: 50, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
        if (earlier.some((e) => e.scope_event_ref === scope.eventRef || ['ACTIVE', 'AWAITING_SEND', 'PAUSED', 'DEAD_LETTER'].includes(String(e.status)))) reasons.push('ALREADY_ENROLLED')
      }
      const exit = await exitReasonFor(s.payload, { contactId: String(contact.id), rfqId: String(p.rfq.id), since: now })
      if (exit) reasons.push(exit)
    }
    rows.push({ contactId: contact ? String(contact.id) : null, rfqId: p.rfq ? String(p.rfq.id) : null, label, decision: reasons.length ? 'SKIP' : 'ENROLL', reasons })
  }
  const enrollable = rows.filter((r) => r.decision === 'ENROLL')
  const counts: Record<string, number> = { ENROLL: enrollable.length }
  for (const r of rows) for (const reason of r.reasons) counts[reason] = (counts[reason] ?? 0) + 1
  // A sample of the first email, exactly as the engine would render and lint it.
  const firstEmail = ((version.steps ?? []) as Step[]).find((st) => st.type === 'EMAIL')
  const samples: Preview['samples'] = []
  for (const r of enrollable.slice(0, 3)) {
    if (!firstEmail) break
    const rfq = (await s.payload.findByID({ collection: 'crm-rfqs', id: r.rfqId!, depth: 0, overrideAccess: true })) as unknown as Doc
    const contact = (await s.payload.findByID({ collection: 'crm-contacts', id: r.contactId!, depth: 0, overrideAccess: true })) as unknown as Doc
    const out = await renderStep(s.payload, settings, { enr: { id: '00000000-0000-4000-8000-000000000000', missing_items: items, current_step: 0 }, sequence: seq, step: firstEmail, rfq, contact })
    samples.push(out.ok ? { label: r.label, subject: out.subject, text: out.text, lint: `${out.lint.hits.length} notes, ${out.lint.decision}` } : { label: r.label, held: out.code })
  }
  const hash = cohortHash(String(version.definition_hash), enrollable.map((r) => ({ contactId: r.contactId!, rfqId: r.rfqId! })))
  return { ok: true, sequenceId: String(seq.id), versionId, versionHash: String(version.definition_hash), rows, counts, samples, cohortHash: hash }
}

export async function enrollFromPreview(
  s: CrmSession,
  input: { sequenceId?: string; source: Source; missingItems?: unknown; cohortHash?: string },
  now = new Date(),
): Promise<Outcome & { enrolled?: number }> {
  const p = await previewEnrollment(s, input, now)
  if (!('rows' in p)) return p
  if (!input.cohortHash || input.cohortHash !== p.cohortHash) return fail('STALE', 'Something changed since the preview (records, exits or the sequence). Preview again.')
  const items = validItems(input.missingItems)
  let enrolled = 0
  for (const r of p.rows.filter((x) => x.decision === 'ENROLL')) {
    const rfq = (await s.payload.findByID({ collection: 'crm-rfqs', id: r.rfqId!, depth: 0, overrideAccess: true })) as unknown as Doc
    try {
      const seqDoc = (await s.payload.findByID({ collection: 'crm-sequences', id: p.sequenceId, depth: 0, overrideAccess: true })) as unknown as Doc
      const scope = await scopeFor(s, seqDoc, String(r.contactId), rfq)
      if ('reason' in scope) continue
      const made = await createEnrollment(s.payload, {
        identity: scope.identity,
        eventRef: scope.eventRef,
        user: s.user,
        data: {
          sequence: p.sequenceId,
          version: p.versionId,
          content_version: p.versionHash,
          contact: r.contactId,
          rfq: r.rfqId,
          account: relId(rfq.account),
          owner: relId(rfq.assignee) ?? s.user.id,
          enrolled_by: s.user.id,
          enrolled_via: input.source.savedViewId ? 'SAVED_VIEW' : 'MANUAL',
          saved_view: input.source.savedViewId ?? null,
          cohort_hash: p.cohortHash,
          status: 'ACTIVE',
          current_step: 0,
          next_action_at: now.toISOString(),
          enrolled_at: now.toISOString(),
          missing_items: items,
        },
      })
      // A replay or a live enrollment of this identity (another worker got there first) creates nothing.
      if (!made.ok) continue
      const enr = made.doc
      enrolled++
      const { recordActivity } = await import('../activity')
      await recordActivity({ payload: s.payload } as never, {
        type: 'SEQUENCE_EVENT',
        summary: 'Enrolled in a sequence',
        idempotency_key: `seq:${String(enr.id)}:enrolled`,
        rfq: r.rfqId,
        account: relId(rfq.account),
        contact: r.contactId,
        detail: { enrollment: String(enr.id), sequence: p.sequenceId, version_hash: p.versionHash },
        actor_kind: 'USER',
      })
    } catch {
      // Enrolled meanwhile (the unique coalesce key): one enrollment per contact per sequence, ever.
    }
  }
  return { ok: true, message: enrolled === 1 ? '1 contact enrolled.' : `${enrolled} contacts enrolled.`, enrolled }
}

export async function stopEnrollment(s: CrmSession, enrollmentId: string | undefined, now = new Date()): Promise<Outcome> {
  const enr = enrollmentId ? ((await s.payload.findByID({ collection: 'crm-enrollments', id: enrollmentId, depth: 0, ...asUser(s) }).catch(() => null)) as Doc | null) : null
  if (!enr) return fail('NOT_FOUND', 'That enrollment doesn’t exist or you don’t have access.')
  if (!['ACTIVE', 'AWAITING_SEND', 'PAUSED'].includes(String(enr.status))) return fail('NOT_LIVE', 'That enrollment has already ended.')
  if (!(await exitEnrollment(s.payload, enr, 'MANUAL_STOP', now, s.user))) return fail('NOT_LIVE', 'That enrollment has already ended.')
  return { ok: true, message: 'Enrollment stopped.' }
}

/** Resume a held enrollment (after fixing the template, the signature data or the copy). Admins. */
export async function resumeEnrollment(s: CrmSession, enrollmentId: string | undefined, now = new Date()): Promise<Outcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Only an admin resumes a held enrollment.')
  const enr = enrollmentId ? ((await s.payload.findByID({ collection: 'crm-enrollments', id: enrollmentId, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null) : null
  if (!enr || enr.status !== 'PAUSED') return fail('NOT_PAUSED', 'Only a held enrollment can be resumed.')
  const r = await transition(s.payload, String(enr.id), { from: ['PAUSED'], to: 'ACTIVE', data: { status: 'ACTIVE', pause_reason: null, next_action_at: now.toISOString() }, user: s.user })
  if (!r.ok) return fail('NOT_PAUSED', 'Only a held enrollment can be resumed.')
  return { ok: true, message: 'Enrollment resumed. The held step runs again with the current data.' }
}
