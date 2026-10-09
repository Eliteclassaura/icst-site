import { stepUp } from '../../email/sending-settings'
import { recordActivity } from '../activity'
import { relId } from '../guards'
import { checkVerdict, coverageOf, inCoverage, manualConfigured, unprocessedInbound } from '../ers/reply-mode'
import type { Outcome } from '../workspace/mutations'
import { displayNameOf, type CrmSession } from '../workspace/session'

/**
 * ENGINE-SCOPE-1c — setting and using manual reply mode. Setting it (an owner, coverage hours and zone, a first-email
 * batch size) is admin + step-up and audited. The owner (or an admin) records a reply check with ONE confirmation: "I
 * checked the reply mailbox and logged every reply and stop request." That does not read any mailbox; it is a person's
 * statement, recorded with who and when. The rules that use it are in ers/reply-mode.ts and the engine.
 */
type Doc = Record<string, unknown>
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })
const ro = { overrideAccess: true as const, depth: 0 }
const MODES = ['MANUAL', 'MONITORED', 'NOT_SET'] as const

export async function setReplyMode(
  s: CrmSession,
  sid: string | null,
  input: { sequenceId?: string; mode?: string; ownerId?: string; days?: string; startHour?: number; endHour?: number; zone?: string; initialBatch?: number },
): Promise<Outcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Only an admin sets how replies are handled.')
  const denied = await stepUp(s, sid, undefined)
  if (denied) return denied
  const mode = (MODES as readonly string[]).includes(input.mode ?? '') ? (input.mode as (typeof MODES)[number]) : null
  if (!mode) return fail('REPLY_MODE_INVALID', 'Choose manual, monitored or not set.')
  const seq = input.sequenceId ? ((await s.payload.findByID({ collection: 'crm-sequences', id: input.sequenceId, ...ro }).catch(() => null)) as Doc | null) : null
  if (!seq) return fail('NOT_FOUND', 'That program no longer exists.')
  const data: Doc = { reply_mode: mode }
  if (mode === 'MANUAL') {
    const owner = input.ownerId ? ((await s.payload.findByID({ collection: 'users', id: input.ownerId, ...ro }).catch(() => null)) as Doc | null) : null
    const roles = ((owner?.roles ?? []) as string[]) ?? []
    if (!owner || !(roles.includes('platform-admin') || roles.includes('sales'))) return fail('REPLY_OWNER', 'Choose a person who works in the CRM as the reply owner.')
    const start = Number(input.startHour)
    const end = Number(input.endHour)
    const probe = { reply_coverage: { days: input.days === 'EVERY_DAY' ? 'EVERY_DAY' : 'MON_FRI', start_hour: start, end_hour: end, zone: input.zone ?? '' } }
    if (!coverageOf(probe)) return fail('REPLY_COVERAGE', 'Give the coverage hours (start before end) and a time zone.')
    const batch = Math.round(Number(input.initialBatch))
    if (!(batch >= 1 && batch <= 500)) return fail('REPLY_BATCH', 'Choose how many first emails may go out (1 to 500).')
    Object.assign(data, { reply_owner: String(owner.id), reply_coverage: probe.reply_coverage, initial_batch: batch })
  }
  await s.payload.update({ collection: 'crm-sequences', id: String(seq.id), data: data as never, ...ro, context: { crmServer: {} }, user: s.user as never })
  return {
    ok: true,
    message:
      mode === 'MANUAL'
        ? 'Manual reply handling is on. Only the first emails go out, in a batch; follow-ups wait until the owner records a reply check.'
        : mode === 'MONITORED'
          ? 'Marked as monitored. It counts only while reply detection is live.'
          : 'Reply handling is not set. Nothing runs unless reply detection is live.',
  }
}

export async function recordReplyCheck(s: CrmSession, input: { sequenceId?: string; confirmed?: boolean }, now = new Date()): Promise<Outcome> {
  const seq = input.sequenceId ? ((await s.payload.findByID({ collection: 'crm-sequences', id: input.sequenceId, ...ro }).catch(() => null)) as Doc | null) : null
  if (!seq) return fail('NOT_FOUND', 'That program no longer exists.')
  if (!manualConfigured(seq)) return fail('REPLY_NOT_MANUAL', 'This program is not in manual reply handling.')
  const own = String(relId(seq.reply_owner) ?? '') === s.userId
  if (!own && !s.isAdmin) return fail('FORBIDDEN', 'Only the reply owner or an admin records a reply check.')
  if (input.confirmed !== true) return fail('REPLY_CONFIRM', 'Confirm that you checked the reply mailbox and logged every reply and stop request.')
  await s.payload.update({ collection: 'crm-sequences', id: String(seq.id), data: { reply_last_check_at: now.toISOString(), reply_last_check_by: s.userId } as never, ...ro, context: { crmServer: {} }, user: s.user as never })
  await recordActivity({ payload: s.payload } as never, {
    type: 'SEQUENCE_EVENT',
    summary: 'Reply check recorded',
    idempotency_key: `seq:${String(seq.id)}:replycheck:${now.getTime()}`,
    detail: { sequence: String(seq.id), by: s.userId },
    actor_kind: 'USER',
  })
  const verdict = checkVerdict({ ...seq, reply_last_check_at: now.toISOString() }, now, await unprocessedInbound(s.payload))
  return {
    ok: true,
    message: verdict.ok
      ? 'Reply check recorded. Follow-ups that are due can go out.'
      : verdict.reason === 'OUTSIDE_COVERAGE'
        ? 'Reply check recorded, but you are outside the coverage hours, so follow-ups stay held until then.'
        : 'Reply check recorded. Follow-ups stay held while inbound mail is waiting to be handled.',
  }
}

/** What the screen and the gate say about reply handling for one program. Never claims automatic handling in manual mode. */
export async function replyHandling(s: CrmSession, seq: Doc, inboundLive: boolean, now = new Date()) {
  if (inboundLive) return { kind: 'MONITORED' as const, ok: true, text: 'Replies are monitored.' }
  if (seq.reply_mode !== 'MANUAL' || !manualConfigured(seq)) return { kind: 'NOT_SET' as const, ok: false, text: 'Replies are not monitored in the CRM yet.' }
  const owner = (await s.payload.findByID({ collection: 'users', id: String(relId(seq.reply_owner)), ...ro }).catch(() => null)) as Doc | null
  const cov = coverageOf(seq)!
  const verdict = checkVerdict(seq, now, await unprocessedInbound(s.payload))
  const where = `Owner ${owner ? displayNameOf(owner) : 'unknown'} · covers ${cov.days === 'MON_FRI' ? 'Mon–Fri' : 'every day'} ${cov.startHour}:00–${cov.endHour}:00 ${cov.zone} · ${seq.reply_last_check_at ? `last check ${new Date(String(seq.reply_last_check_at)).toUTCString()}` : 'no reply check yet'}`
  return { kind: 'MANUAL' as const, ok: verdict.ok, text: where, reason: verdict.reason, inCoverage: inCoverage(now, cov) }
}
