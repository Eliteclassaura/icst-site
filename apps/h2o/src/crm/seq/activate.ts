import { stepUp } from '../../email/sending-settings'
import { activateSequence, pauseSequence, publishVersion } from '../ers/admin'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'
import { activationGates, type GateReport } from './gates'

/**
 * SEQ-BUILD-1 — Mark as Ready and gated activation. Admin only, step-up to activate. Marking Ready publishes the draft
 * (the existing publish checks: approved wording, copy-risk) and records that the sequence is built and checked; it
 * starts nothing. Activation re-reads every gate at the moment of confirming and refuses while any hard gate is unmet:
 * there is no override. Pausing is never gated: stopping must always be easy.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })
const NOT_ADMIN = fail('FORBIDDEN', 'Only an admin activates a sequence.')

export async function markReady(s: CrmSession, input: { sequenceId?: string }, now = new Date()): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const seq = input.sequenceId ? ((await s.payload.findByID({ collection: 'crm-sequences', id: input.sequenceId, ...sys }).catch(() => null)) as Doc | null) : null
  if (!seq) return fail('NOT_FOUND', 'That sequence no longer exists.')
  if (seq.run_state === 'RETIRED') return fail('RETIRED', 'A retired sequence cannot be made ready.')
  const versions = (await s.payload.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: String(seq.id) } } as never, sort: '-version_number', limit: 20, ...sys })).docs as unknown as Doc[]
  const draft = versions.find((v) => v.state === 'DRAFT')
  if (draft) {
    const pub = await publishVersion(s, String(draft.id), now)
    if (!pub.ok) return pub
  } else if (!seq.published_version) return fail('NOTHING_TO_PUBLISH', 'There are no steps to make ready yet.')
  await s.payload.update({ collection: 'crm-sequences', id: String(seq.id), data: { readiness: 'READY', ready_at: now.toISOString(), ready_by: s.userId } as never, ...sys, user: s.user as never })
  return { ok: true, message: 'Marked Ready. Nothing starts until every safety check is met and an admin activates it.' }
}

export type ActivateOutcome = Outcome & { gates?: GateReport }

export async function activateGated(s: CrmSession, sid: string | null, input: { sequenceId?: string; password?: string; seen?: string }): Promise<ActivateOutcome> {
  if (!s.isAdmin) return NOT_ADMIN
  if (!input.sequenceId) return fail('NOT_FOUND', 'Choose a sequence.')
  const gates = await activationGates(s, { sequenceId: input.sequenceId })
  if (!gates.allMet) {
    const changed = input.seen !== undefined && input.seen !== gates.fingerprint
    return { ok: false, code: 'GATES_UNMET', message: `${changed ? 'A safety check changed while this was open. ' : ''}Can’t start yet: ${gates.blocker!.reason}`, gates }
  }
  const denied = await stepUp(s, sid, input.password)
  if (denied) return { ...denied, gates }
  // Re-read at the moment of confirming (a gate may have changed while the code was being checked).
  const again = await activationGates(s, { sequenceId: input.sequenceId })
  if (!again.allMet) return { ok: false, code: 'GATES_UNMET', message: `A safety check changed while this was open. Can’t start yet: ${again.blocker!.reason}`, gates: again }
  const out = await activateSequence(s, input.sequenceId)
  return { ...out, gates: again }
}

export { pauseSequence }
