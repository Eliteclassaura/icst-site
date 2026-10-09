import { recordActivity } from '../activity'
import { relId } from '../guards'
import type { Outcome } from '../workspace/mutations'
import { asUser, type CrmSession } from '../workspace/session'
import { exitEnrollment } from './engine'
import { transition } from './transition'

/**
 * ERS-HUB-1 — per-enrollment Pause / Resume / Stop. Role rules (re-checked here, never trusted from the screen):
 *   - Pause and Stop: any CRM user (admin or sales) who can see the enrollment. Stopping is always the safe direction.
 *   - Resume: an admin, or the enrollment's owner when it was a person's pause (MANUAL). A copy-check or render hold is
 *     resumed by an admin only, after the cause is fixed.
 * Every change writes the status (audited by the collection) and a timeline entry naming the actor. None of this sends
 * anything: a resumed enrollment goes back to the engine, which still checks the engine switch, safety gates and outbox.
 */
type Doc = Record<string, unknown>
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

async function load(s: CrmSession, id: string | undefined): Promise<Doc | null> {
  if (!id) return null
  return (await s.payload.findByID({ collection: 'crm-enrollments', id, depth: 0, ...asUser(s) }).catch(() => null)) as Doc | null
}

async function note(s: CrmSession, enr: Doc, what: 'paused' | 'resumed' | 'stopped', now: Date) {
  await recordActivity({ payload: s.payload } as never, {
    type: 'SEQUENCE_EVENT',
    summary: `Sequence ${what} by a person`,
    idempotency_key: `seq:${String(enr.id)}:${what}:${now.getTime()}`,
    rfq: relId(enr.rfq) as string | null,
    contact: relId(enr.contact) as string | null,
    account: relId(enr.account) as string | null,
    detail: { enrollment: String(enr.id), by: s.userId, action: what },
    actor_kind: 'USER',
  })
}

const CHANGED = 'Someone just changed this enrollment. Reload and look again.'

export async function pauseOne(s: CrmSession, id: string | undefined, now = new Date()): Promise<Outcome> {
  const enr = await load(s, id)
  if (!enr) return fail('NOT_FOUND', 'That enrollment does not exist or you do not have access.')
  // Only a waiting enrollment can be paused. One whose email is already being sent can be stopped, not paused.
  if (enr.status === 'AWAITING_SEND') return fail('SENDING_NOW', 'This email is already being sent, so it cannot be paused. You can stop the sequence after it.')
  if (enr.status !== 'ACTIVE') return fail('NOT_RUNNING', 'Only a running enrollment can be paused.')
  const r = await transition(s.payload, String(enr.id), { from: ['ACTIVE'], to: 'PAUSED', data: { status: 'PAUSED', pause_reason: 'MANUAL', next_action_at: null }, user: s.user })
  if (!r.ok) return fail('CHANGED', CHANGED)
  await note(s, enr, 'paused', now)
  return { ok: true, message: 'Paused. Nothing more runs for this contact until it is resumed.' }
}

export async function resumeOne(s: CrmSession, id: string | undefined, now = new Date()): Promise<Outcome> {
  const enr = await load(s, id)
  if (!enr) return fail('NOT_FOUND', 'That enrollment does not exist or you do not have access.')
  if (enr.status !== 'PAUSED') return fail('NOT_PAUSED', 'Only a paused enrollment can be resumed.')
  const own = String(relId(enr.owner) ?? '') === s.userId
  const may = (d: Doc) => s.isAdmin || (own && d.pause_reason === 'MANUAL')
  if (!may(enr)) return fail('FORBIDDEN', enr.pause_reason === 'MANUAL' ? 'Only the contact owner or an admin can resume this.' : 'Only an admin can resume an enrollment held by a safety check.')
  const r = await transition(s.payload, String(enr.id), {
    from: ['PAUSED'],
    to: 'ACTIVE',
    guard: may,
    data: { status: 'ACTIVE', pause_reason: null, hold_code: null, next_action_at: now.toISOString() },
    user: s.user,
  })
  if (!r.ok) return fail('CHANGED', CHANGED)
  await note(s, enr, 'resumed', now)
  return { ok: true, message: 'Resumed. The next step runs when the safety checks and limits allow.' }
}

export async function stopOne(s: CrmSession, id: string | undefined, now = new Date()): Promise<Outcome> {
  const enr = await load(s, id)
  if (!enr) return fail('NOT_FOUND', 'That enrollment does not exist or you do not have access.')
  if (!['ACTIVE', 'AWAITING_SEND', 'PAUSED'].includes(String(enr.status))) return fail('NOT_LIVE', 'That enrollment has already ended.')
  if (!(await exitEnrollment(s.payload, enr, 'MANUAL_STOP', now, s.user))) return fail('NOT_LIVE', 'That enrollment has already ended.')
  await note(s, enr, 'stopped', now)
  return { ok: true, message: 'Stopped. This contact will not get any more emails from this sequence.' }
}
