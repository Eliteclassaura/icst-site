import { stepUp } from '../../email/sending-settings'
import { recordActivity } from '../activity'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'

/**
 * ENGINE-SCOPE-1c — "AUTO applies to NEW programs only". A program with live work (running, held or failed enrollments)
 * never switches approval mode silently. This is the one door: admin + step-up + a written reason, audited with the
 * actor and from → to, and it says plainly what it affects. The collection hook (`collections/sequences.ts`) refuses any
 * other change while live work exists. A held or queued email is never re-labelled: from the next step on, the program
 * runs under the new mode; work already queued keeps what it was queued with.
 */
type Doc = Record<string, unknown>
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

export async function liveWork(s: CrmSession, sequenceId: string): Promise<number> {
  return (
    await s.payload.count({
      collection: 'crm-enrollments',
      where: { and: [{ sequence: { equals: sequenceId } }, { status: { in: ['ACTIVE', 'AWAITING_SEND', 'PAUSED', 'DEAD_LETTER'] } }] } as never,
      overrideAccess: true,
    })
  ).totalDocs
}

export async function changeSequenceApprovalMode(s: CrmSession, sid: string | null, input: { sequenceId?: string; mode?: string; reason?: string }): Promise<Outcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Only an admin changes a program’s approval mode.')
  const mode = input.mode === 'AUTO' || input.mode === 'REQUIRED' ? input.mode : null
  if (!mode) return fail('SEQUENCE_MODE_INVALID', 'Choose automatic sending or approval required.')
  // STEP-UP-1: switching TO automatic sending needs the step-up; going back to "approval required" is the safer direction and never does.
  if (mode === 'AUTO') {
    const denied = await stepUp(s, sid, undefined)
    if (denied) return denied
  }
  const reason = (input.reason ?? '').trim()
  if (reason.length < 3) return fail('SEQUENCE_MODE_REASON', 'Say why the approval mode is changing (a few words).')
  const seq = input.sequenceId ? ((await s.payload.findByID({ collection: 'crm-sequences', id: input.sequenceId, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null) : null
  if (!seq) return fail('NOT_FOUND', 'That program no longer exists.')
  if (seq.approval_mode === mode) return fail('SEQUENCE_MODE_SAME', 'It is already set to that.')
  const affected = await liveWork(s, String(seq.id))
  await s.payload.update({
    collection: 'crm-sequences',
    id: String(seq.id),
    data: { approval_mode: mode } as never,
    overrideAccess: true,
    depth: 0,
    context: { crmServer: {}, approvalChangeAllowed: true },
    user: s.user as never,
  })
  await recordActivity({ payload: s.payload } as never, {
    type: 'SEQUENCE_EVENT',
    summary: `Approval mode changed to ${mode}`,
    idempotency_key: `seq:${String(seq.id)}:mode:${Date.now()}`,
    detail: { sequence: String(seq.id), from: seq.approval_mode, to: mode, by: s.userId, affected },
    actor_kind: 'USER',
  })
  return {
    ok: true,
    message:
      affected > 0
        ? `Approval mode set. ${affected} enrollment${affected === 1 ? '' : 's'} in progress run under the new mode from their next step. Emails already queued keep what they were queued with.`
        : 'Approval mode set. Nothing is in progress.',
  }
}
