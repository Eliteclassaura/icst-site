import type { Payload } from 'payload'
import { stepUp } from '../../email/sending-settings'
import { TRIGGER_KEYS, type TriggerKey } from '../collections/sequence-triggers'
import { CLOSED_RFQ } from '../ers/engine'
import { identityBase, rfqIdentity } from '../ers/identity'
import { relId } from '../guards'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'
import { activationGates } from './gates'
import { runRules } from './rules'

/**
 * SEQ-BUILD-1 — trigger rules (admin only). Four fixed rules; each is OFF until an admin turns it on with step-up, and it
 * can only be turned on when every activation gate is met (including the engine being on and the rule runner being
 * available). With the engine OFF nothing can be on, and `evaluateRules` does nothing at all (inert). "Would match
 * today" is a read-only count and writes nothing. Turning a rule OFF is never gated and needs no step-up.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }
const ro = { overrideAccess: true as const, depth: 0 }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

export const TRIGGER_DEFS: Record<TriggerKey, { label: string; applies: string; sequence: string }> = {
  RFQ_RECEIVED: { label: 'RFQ received', applies: 'New inquiries from the website form.', sequence: 'ICS_RFQ_RECEIPT_FIRST_RESPONSE' },
  RFQ_NEEDS_INFO: { label: 'RFQ needs info', applies: 'Inquiries where a person has listed what is missing.', sequence: 'ICS_MISSING_INFORMATION' },
  DEAL_QUOTE_SENT: { label: 'Deal stage “Quote sent”', applies: 'Deals that move to the quote stage.', sequence: 'ICS_QUOTE_PROPOSAL_FOLLOWUP' },
  NO_ACTIVITY: { label: 'No activity for a number of days', applies: 'Open deals with no recorded activity.', sequence: 'ICS_DORMANT_OPPORTUNITY_RECOVERY' },
}

export async function ensureTriggers(payload: Payload): Promise<void> {
  for (const key of TRIGGER_KEYS) {
    const have = await payload.find({ collection: 'crm-sequence-triggers', where: { key: { equals: key } } as never, limit: 1, ...ro })
    if (have.docs.length) continue
    const seq = (await payload.find({ collection: 'crm-sequences', where: { key: { equals: TRIGGER_DEFS[key].sequence } } as never, limit: 1, ...ro })).docs[0] as unknown as Doc | undefined
    try {
      await payload.create({ collection: 'crm-sequence-triggers', data: { key, enabled: false, sequence: seq ? String(seq.id) : null, idle_days: key === 'NO_ACTIVITY' ? 30 : null } as never, ...sys })
    } catch {
      // Another request created it first (unique key).
    }
  }
}

export type TriggerRow = {
  id: string
  key: TriggerKey
  label: string
  applies: string
  enabled: boolean
  sequenceId: string | null
  sequenceName: string | null
  idleDays: number | null
  skipInSequence: boolean
  skipOpenDeal: boolean
  skipRecentDays: number
  lastMatchedAt: string | null
  wouldMatch: number | null
}

export async function listTriggers(s: CrmSession): Promise<TriggerRow[]> {
  await ensureTriggers(s.payload)
  const rows = (await s.payload.find({ collection: 'crm-sequence-triggers', limit: 20, depth: 1, ...{ overrideAccess: true as const } })).docs as unknown as Doc[]
  const out: TriggerRow[] = []
  for (const key of TRIGGER_KEYS) {
    const r = rows.find((x) => x.key === key)
    if (!r) continue
    const seq = (r.sequence ?? null) as Doc | null
    out.push({
      id: String(r.id),
      key,
      label: TRIGGER_DEFS[key].label,
      applies: TRIGGER_DEFS[key].applies,
      enabled: r.enabled === true,
      sequenceId: seq && typeof seq === 'object' ? String(seq.id) : null,
      sequenceName: seq && typeof seq === 'object' ? String(seq.name) : null,
      idleDays: r.idle_days == null ? null : Number(r.idle_days),
      skipInSequence: r.skip_in_sequence !== false,
      skipOpenDeal: r.skip_open_deal !== false,
      skipRecentDays: Number(r.skip_recent_days ?? 7),
      lastMatchedAt: (r.last_matched_at as string | null) ?? null,
      wouldMatch: await wouldMatchToday(s.payload, key, seq && typeof seq === 'object' ? String(seq.id) : null, r.idle_days == null ? 30 : Number(r.idle_days)),
    })
  }
  return out
}

/** Read-only dry-run count. `null` = this build has no source for the rule (shown as "Not available yet", never 0). */
export async function wouldMatchToday(payload: Payload, key: TriggerKey, sequenceId: string | null, idleDays: number, now = new Date()): Promise<number | null> {
  const enrolled = async (contactId: string, rfqId: string) =>
    sequenceId ? (await payload.find({ collection: 'crm-enrollments', where: { identity_base: { equals: identityBase(rfqIdentity(sequenceId, contactId, rfqId)) } } as never, limit: 1, ...ro })).docs.length > 0 : false
  if (key === 'RFQ_RECEIVED') {
    const since = new Date(now.getTime() - 2 * 86400_000).toISOString()
    const rfqs = (await payload.find({ collection: 'crm-rfqs', where: { received_at: { greater_than: since } } as never, limit: 200, ...ro })).docs as unknown as Doc[]
    let n = 0
    for (const r of rfqs) {
      const c = relId(r.contact) as string | null
      if (!CLOSED_RFQ.includes(String(r.status)) && c && !(await enrolled(c, String(r.id)))) n++
    }
    return n
  }
  if (key === 'DEAL_QUOTE_SENT') {
    const opps = (await payload.find({ collection: 'crm-opportunities', where: { stage: { equals: 'PROPOSAL' } } as never, limit: 200, ...ro })).docs as unknown as Doc[]
    return opps.length
  }
  if (key === 'NO_ACTIVITY') {
    const before = new Date(now.getTime() - idleDays * 86400_000).toISOString()
    const opps = (await payload.find({ collection: 'crm-opportunities', where: { and: [{ outcome_status: { equals: 'OPEN' } }, { updatedAt: { less_than: before } }] } as never, limit: 200, ...ro })).docs as unknown as Doc[]
    return opps.length
  }
  return null
}

export async function setTriggerEnabled(s: CrmSession, sid: string | null, input: { key?: string; enabled?: boolean }): Promise<Outcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Only an admin changes a trigger rule.')
  const key = (TRIGGER_KEYS as readonly string[]).includes(input.key ?? '') ? (input.key as TriggerKey) : null
  if (!key) return fail('NOT_FOUND', 'That rule does not exist.')
  await ensureTriggers(s.payload)
  const row = (await s.payload.find({ collection: 'crm-sequence-triggers', where: { key: { equals: key } } as never, limit: 1, ...ro })).docs[0] as unknown as Doc
  const now = new Date().toISOString()
  if (input.enabled !== true) {
    await s.payload.update({ collection: 'crm-sequence-triggers', id: String(row.id), data: { enabled: false, changed_at: now, changed_by: s.userId } as never, ...sys, user: s.user as never })
    return { ok: true, message: 'Rule turned off.' }
  }
  const denied = await stepUp(s, sid, undefined)
  if (denied) return denied
  const seqId = relId(row.sequence) as string | null
  if (!seqId) return fail('RULE_NO_SEQUENCE', 'Choose a sequence for this rule first.')
  if (key === 'RFQ_NEEDS_INFO') return fail('RULE_NO_SOURCE', 'This rule needs a person to list the missing items on an inquiry. That is not recorded as data yet, so it cannot be turned on.')
  const gates = await activationGates(s, { sequenceId: seqId, trigger: true })
  if (!gates.allMet) return { ok: false, code: 'GATES_UNMET', message: `Can’t turn this on yet: ${gates.blocker!.reason}` }
  await s.payload.update({ collection: 'crm-sequence-triggers', id: String(row.id), data: { enabled: true, changed_at: now, changed_by: s.userId } as never, ...sys, user: s.user as never })
  return { ok: true, message: 'Rule turned on.' }
}

export async function saveTriggerConfig(s: CrmSession, sid: string | null, input: { key?: string; sequenceId?: string; idleDays?: number }): Promise<Outcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Only an admin changes a trigger rule.')
  const denied = await stepUp(s, sid, undefined)
  if (denied) return denied
  const key = (TRIGGER_KEYS as readonly string[]).includes(input.key ?? '') ? (input.key as TriggerKey) : null
  if (!key) return fail('NOT_FOUND', 'That rule does not exist.')
  await ensureTriggers(s.payload)
  const row = (await s.payload.find({ collection: 'crm-sequence-triggers', where: { key: { equals: key } } as never, limit: 1, ...ro })).docs[0] as unknown as Doc
  const data: Doc = { changed_at: new Date().toISOString(), changed_by: s.userId }
  if (input.sequenceId) {
    const seq = (await s.payload.findByID({ collection: 'crm-sequences', id: input.sequenceId, ...ro }).catch(() => null)) as Doc | null
    if (!seq) return fail('NOT_FOUND', 'That sequence no longer exists.')
    if (seq.readiness !== 'READY' && seq.run_state !== 'ACTIVE') return fail('SEQUENCE_NOT_READY', 'Only a Ready or running sequence can be chosen.')
    data.sequence = String(seq.id)
  }
  if (key === 'NO_ACTIVITY' && input.idleDays !== undefined) {
    const n = Math.round(Number(input.idleDays))
    if (!(n >= 7 && n <= 365)) return fail('RULE_IDLE_RANGE', 'Choose between 7 and 365 days.')
    data.idle_days = n
  }
  // Changing what a running rule does turns it off; it is turned on again on purpose.
  if (row.enabled === true) data.enabled = false
  await s.payload.update({ collection: 'crm-sequence-triggers', id: String(row.id), data: data as never, ...sys, user: s.user as never })
  return { ok: true, message: row.enabled === true ? 'Saved. The rule was turned off; turn it on again to use the change.' : 'Saved.' }
}

/** The runner entry: inert while the engine is off or paused (nothing is read or written); otherwise one pass of seq/rules.ts. */
export async function evaluateRules(payload: Payload, input: { engineOn: boolean; dryRun?: boolean }): Promise<{ ran: boolean; reason?: string; matched: number }> {
  const out = await runRules(payload, { engineOn: input.engineOn })
  return { ran: out.ran, reason: out.reason, matched: out.created }
}
