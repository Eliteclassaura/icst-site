import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { templateHash } from '../../email/templates'
import { relId } from '../guards'
import { emailKey } from '../normalize'
import { CLOSED_RFQ, exitReasonFor, renderStep, type Step } from '../ers/engine'
import { identityBase, rfqIdentity } from '../ers/identity'
import { ersSettings } from '../ers/settings'
import { textOf } from '../settings/templates'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'

/**
 * SEQ-BUILD-1 — simulation (dry run). Shows who would enter a sequence and what would happen to each, as the engine
 * would decide it, without writing anything: no enrollment, no outbox row, no counter, no activity. This module has no
 * create / update / delete call and imports no transport (a unit test enforces both). The only thing ever stored is an
 * admin's APPROVAL of a simulation (`approveSimulation`), a separate small record that authorises nothing by itself.
 *
 * The approval binds to a hash of what was simulated: the published version, the exact wording of every email step,
 * and the approval mode. Change any of those and the approval no longer matches ("out of date"). The candidate list is
 * deliberately NOT in the hash: new inquiries arrive every day and would make every approval stale at once.
 */
type Doc = Record<string, unknown>
const ro = { overrideAccess: true as const, depth: 0 }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

export type Predicted = 'SEND' | 'REVIEW' | 'HOLD' | 'BLOCK'
export type SimRow = { rfqId: string; contactId: string | null; label: string; action: Predicted | null; reasons: string[]; firstDay: number | null }
export type SimResult = {
  ok: true
  sequenceId: string
  sequenceName: string
  versionHash: string
  snapshotHash: string
  generatedAt: string
  counts: { candidates: number; excluded: number; wouldEnter: number } & Record<Predicted, number>
  enroll: SimRow[]
  excluded: SimRow[]
  timeline: Array<{ day: number; send: number; review: number }>
  samples: Array<{ label: string; subject: string; text: string } | { label: string; held: string }>
  approvalMode: string
  autoSteps: number
}

/** What a simulation of this sequence is bound to (not the candidates). Null when there is no published version. */
export async function configHash(payload: Payload, sequenceId: string): Promise<{ hash: string; versionHash: string; version: Doc; sequence: Doc } | null> {
  const sequence = (await payload.findByID({ collection: 'crm-sequences', id: sequenceId, ...ro }).catch(() => null)) as Doc | null
  if (!sequence?.published_version) return null
  const version = (await payload.findByID({ collection: 'crm-sequence-versions', id: String(relId(sequence.published_version)), ...ro }).catch(() => null)) as Doc | null
  if (!version) return null
  const templates: string[] = []
  for (const st of (version.steps ?? []) as Step[]) {
    if (st.type !== 'EMAIL') continue
    const t = (await payload.findByID({ collection: 'crm-email-templates', id: String(relId(st.template)), ...ro }).catch(() => null)) as Doc | null
    templates.push(t ? templateHash(textOf(t)) : 'MISSING')
  }
  const hash = createHash('sha256')
    .update(JSON.stringify([String(version.definition_hash), templates, String(sequence.approval_mode)]))
    .digest('hex')
  return { hash, versionHash: String(version.definition_hash), version, sequence }
}

export async function simulate(s: CrmSession, input: { sequenceId?: string; limit?: number }, now = new Date()): Promise<SimResult | Outcome> {
  if (!input.sequenceId) return fail('NOT_FOUND', 'Choose a sequence.')
  const cfg = await configHash(s.payload, input.sequenceId)
  if (!cfg) return fail('NOT_PUBLISHED', 'Only a sequence with a published version can be simulated. Mark it Ready first.')
  const limit = Math.min(Math.max(Number(input.limit ?? 200), 1), 500)
  const settings = await ersSettings(s.payload, now.getTime())
  const steps = (cfg.version.steps ?? []) as Step[]
  const firstEmailIdx = steps.findIndex((x) => x.type === 'EMAIL')
  const firstEmail = steps[firstEmailIdx]
  const firstDay = steps.slice(0, Math.max(firstEmailIdx, 0)).reduce((n, x) => n + (x.type === 'WAIT' ? Number(x.business_days ?? 0) : 0), 0)
  const required = cfg.sequence.approval_mode === 'REQUIRED'
  const rfqs = (await s.payload.find({ collection: 'crm-rfqs', sort: '-received_at', limit, ...ro })).docs as unknown as Doc[]
  const enroll: SimRow[] = []
  const excluded: SimRow[] = []
  const samples: SimResult['samples'] = []
  const counts = { candidates: 0, excluded: 0, wouldEnter: 0, SEND: 0, REVIEW: 0, HOLD: 0, BLOCK: 0 }
  for (const rfq of rfqs) {
    counts.candidates++
    const contactId = relId(rfq.contact) as string | null
    const contact = contactId ? ((await s.payload.findByID({ collection: 'crm-contacts', id: contactId, ...ro }).catch(() => null)) as Doc | null) : null
    const reasons: string[] = []
    if (CLOSED_RFQ.includes(String(rfq.status))) reasons.push('RFQ_CLOSED')
    if (!contact) reasons.push('NO_CONTACT')
    else if (!emailKey(contact.email)) reasons.push('NO_VALID_ADDRESS')
    if (contact && !reasons.length) {
      const base = identityBase(rfqIdentity(String(cfg.sequence.id), String(contact.id), String(rfq.id)))
      const dup = await s.payload.find({ collection: 'crm-enrollments', where: { identity_base: { equals: base } } as never, limit: 1, ...ro })
      if (dup.docs.length) reasons.push('ALREADY_ENROLLED')
      const exit = await exitReasonFor(s.payload, { contactId: String(contact.id), rfqId: String(rfq.id), since: now })
      if (exit && !reasons.includes(exit)) reasons.push(exit)
    }
    const row: SimRow = { rfqId: String(rfq.id), contactId, label: String(rfq.rfq_number ?? 'inquiry'), action: null, reasons, firstDay: null }
    if (reasons.length) {
      counts.excluded++
      excluded.push(row)
      continue
    }
    counts.wouldEnter++
    let action: Predicted = 'SEND'
    if (firstEmail) {
      const out = await renderStep(s.payload, settings, { enr: { id: '00000000-0000-4000-8000-000000000000', missing_items: [], current_step: firstEmailIdx }, sequence: cfg.sequence, step: firstEmail, rfq, contact: contact! })
      if (!out.ok) {
        action = out.kind === 'LINT_HOLD' ? 'REVIEW' : 'HOLD'
        row.reasons = [out.code]
        if (samples.length < 3) samples.push({ label: row.label, held: out.code })
      } else {
        action = required ? 'REVIEW' : 'SEND'
        if (samples.length < 3) samples.push({ label: row.label, subject: out.subject, text: out.text })
      }
    }
    row.action = action
    row.firstDay = firstDay
    counts[action]++
    enroll.push(row)
  }
  const days = new Map<number, { send: number; review: number }>()
  for (const r of enroll) {
    const d = days.get(r.firstDay ?? 0) ?? { send: 0, review: 0 }
    if (r.action === 'SEND') d.send++
    if (r.action === 'REVIEW') d.review++
    days.set(r.firstDay ?? 0, d)
  }
  const emailSteps = steps.filter((x) => x.type === 'EMAIL').length
  return {
    ok: true,
    sequenceId: String(cfg.sequence.id),
    sequenceName: String(cfg.sequence.name),
    versionHash: cfg.versionHash,
    snapshotHash: cfg.hash,
    generatedAt: now.toISOString(),
    counts,
    enroll: enroll.slice(0, 100),
    excluded: excluded.slice(0, 100),
    timeline: [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, v]) => ({ day, ...v })),
    samples,
    approvalMode: String(cfg.sequence.approval_mode),
    autoSteps: required ? 0 : emailSteps,
  }
}
