import type { Payload } from 'payload'
import { recordActivity } from '../activity'
import { TRIGGER_KEYS, type TriggerKey } from '../collections/sequence-triggers'
import { createEnrollment } from '../ers/create'
import { CLOSED_RFQ, exitReasonFor } from '../ers/engine'
import { rfqIdentity, type Identity } from '../ers/identity'
import { relId } from '../guards'

/**
 * ENGINE-SCOPE-1c — the rule runner: enroll on match. It runs inside the engine's tick, only when the engine is on and
 * healthy, and it is INERT otherwise (it reads nothing and writes nothing). A rule that is turned off does nothing; a
 * rule is turned on only by an admin with step-up when every activation gate is met (seq/triggers.ts), and turning it off
 * takes effect on the next pass. Enrollment goes through the same identity, duplicate guard and exit checks as a manual
 * enrollment (ers/create.ts, exitReasonFor), so a replay enrolls nobody and a suppressed contact is never enrolled. Each
 * enrollment is `enrolled_via = RULE`, written by the system, with a timeline entry. A pass enrolls at most `CAP` contacts.
 */
type Doc = Record<string, unknown>
const ro = { overrideAccess: true as const, depth: 0 }
export const RULE_PASS_CAP = 25
const DAY = 86400_000

export type RulePass = { ran: boolean; reason?: string; created: number; skipped: number }

type Candidate = { rfq: Doc; identity: Identity; eventRef: string }

async function candidatesFor(payload: Payload, key: TriggerKey, seq: Doc, idleDays: number, now: Date): Promise<Candidate[]> {
  const purpose = String(seq.purpose ?? 'RFQ_RESPONSE')
  const out: Candidate[] = []
  if (key === 'RFQ_RECEIVED' && purpose === 'RFQ_RESPONSE') {
    const since = new Date(now.getTime() - 2 * DAY).toISOString()
    const rfqs = (await payload.find({ collection: 'crm-rfqs', where: { received_at: { greater_than: since } } as never, sort: 'received_at', limit: 100, ...ro })).docs as unknown as Doc[]
    for (const rfq of rfqs) {
      const c = relId(rfq.contact)
      if (c && !CLOSED_RFQ.includes(String(rfq.status))) out.push({ rfq, identity: rfqIdentity(String(seq.id), String(c), String(rfq.id)), eventRef: String(rfq.id) })
    }
  }
  if ((key === 'DEAL_QUOTE_SENT' || key === 'NO_ACTIVITY') && (purpose === 'QUOTE_FOLLOWUP' || purpose === 'RFQ_RESPONSE')) {
    const where =
      key === 'DEAL_QUOTE_SENT'
        ? { stage: { equals: 'PROPOSAL' } }
        : { and: [{ outcome_status: { equals: 'OPEN' } }, { updatedAt: { less_than: new Date(now.getTime() - idleDays * DAY).toISOString() } }] }
    const opps = (await payload.find({ collection: 'crm-opportunities', where: where as never, limit: 100, ...ro })).docs as unknown as Doc[]
    for (const opp of opps) {
      const rfq = (await payload.find({ collection: 'crm-rfqs', where: { opportunity: { equals: String(opp.id) } } as never, sort: '-received_at', limit: 1, ...ro })).docs[0] as unknown as Doc | undefined
      const c = rfq ? relId(rfq.contact) : null
      if (!rfq || !c) continue
      out.push(
        purpose === 'QUOTE_FOLLOWUP'
          ? { rfq, identity: { sequenceId: String(seq.id), contactId: String(c), purpose: 'QUOTE_FOLLOWUP', scopeKind: 'DEAL', scopeRef: String(opp.id) }, eventRef: `deal:${String(opp.id)}:${String(opp.last_stage_change ?? 'v1')}` }
          : { rfq, identity: rfqIdentity(String(seq.id), String(c), String(rfq.id)), eventRef: `${String(rfq.id)}` },
      )
    }
  }
  return out
}

async function skipReason(payload: Payload, rule: Doc, seq: Doc, cand: Candidate, now: Date): Promise<string | null> {
  const contactId = cand.identity.contactId
  if (rule.skip_in_sequence !== false) {
    const other = await payload.find({ collection: 'crm-enrollments', where: { and: [{ contact: { equals: contactId } }, { status: { in: ['ACTIVE', 'AWAITING_SEND', 'PAUSED'] } }, { sequence: { not_equals: String(seq.id) } }] } as never, limit: 1, ...ro })
    if (other.docs.length) return 'IN_ANOTHER_SEQUENCE'
  }
  if (rule.skip_open_deal !== false && rule.key === 'RFQ_RECEIVED' && cand.rfq.opportunity) {
    const opp = (await payload.findByID({ collection: 'crm-opportunities', id: String(relId(cand.rfq.opportunity)), ...ro }).catch(() => null)) as Doc | null
    if (opp && opp.outcome_status === 'OPEN') return 'OPEN_DEAL'
  }
  const recent = Number(rule.skip_recent_days ?? 0)
  if (recent > 0) {
    const cutoff = new Date(now.getTime() - recent * DAY).toISOString()
    const touched = await payload.find({ collection: 'crm-enrollments', where: { and: [{ contact: { equals: contactId } }, { last_step_at: { greater_than: cutoff } }] } as never, limit: 1, ...ro })
    if (touched.docs.length) return 'EMAILED_RECENTLY'
  }
  const exit = await exitReasonFor(payload, { contactId, rfqId: String(cand.rfq.id), since: now })
  return exit
}

export async function runRules(payload: Payload, input: { engineOn: boolean; now?: Date }): Promise<RulePass> {
  const now = input.now ?? new Date()
  if (!input.engineOn) return { ran: false, reason: 'ERS_OFF', created: 0, skipped: 0 }
  const rules = (await payload.find({ collection: 'crm-sequence-triggers', where: { enabled: { equals: true } } as never, limit: 10, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  let created = 0
  let skipped = 0
  for (const key of TRIGGER_KEYS) {
    const rule = rules.find((r) => r.key === key)
    if (!rule || !rule.sequence) continue
    const seq = (await payload.findByID({ collection: 'crm-sequences', id: String(relId(rule.sequence)), ...ro }).catch(() => null)) as Doc | null
    if (!seq || seq.run_state !== 'ACTIVE' || !seq.published_version) continue
    const version = (await payload.findByID({ collection: 'crm-sequence-versions', id: String(relId(seq.published_version)), ...ro }).catch(() => null)) as Doc | null
    if (!version) continue
    const cands = await candidatesFor(payload, key, seq, Number(rule.idle_days ?? 30), now)
    let matched = 0
    for (const cand of cands) {
      if (created >= RULE_PASS_CAP) break
      const why = await skipReason(payload, rule, seq, cand, now)
      if (why) {
        skipped++
        continue
      }
      const made = await createEnrollment(payload, {
        identity: cand.identity,
        eventRef: cand.eventRef,
        data: {
          sequence: String(seq.id),
          version: String(version.id),
          content_version: String(version.definition_hash ?? ''),
          contact: cand.identity.contactId,
          rfq: String(cand.rfq.id),
          account: relId(cand.rfq.account),
          owner: relId(cand.rfq.assignee),
          enrolled_via: 'RULE',
          status: 'ACTIVE',
          current_step: 0,
          next_action_at: now.toISOString(),
          enrolled_at: now.toISOString(),
        },
      })
      if (!made.ok) continue // a replay, or already live: nothing created
      created++
      matched++
      await recordActivity({ payload } as never, {
        type: 'SEQUENCE_EVENT',
        summary: 'Enrolled by a rule',
        idempotency_key: `seq:${String(made.doc.id)}:enrolled`,
        rfq: String(cand.rfq.id),
        contact: cand.identity.contactId,
        detail: { enrollment: String(made.doc.id), sequence: String(seq.id), rule: key },
        actor_kind: 'SYSTEM',
      })
    }
    if (matched) await payload.update({ collection: 'crm-sequence-triggers', id: String(rule.id), data: { last_matched_at: now.toISOString() } as never, ...ro, context: { crmServer: {} } })
  }
  return { ran: true, created, skipped }
}
