import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminMfaAction, listPeople, noticeText } from '../../auth/mfa/admin-actions'
import { rememberDevice } from '../../auth/mfa/devices'
import { pendingSession } from '../../auth/mfa/guard'
import { beginEnrolment, enrolWithSecret, isSessionVerified, loadMfaUser, verifySecondFactorByEmail } from '../../auth/mfa/service'
import { confirmStepUp, confirmStepUpApp } from '../../auth/mfa/service'
import { generateSecret, totpCode } from '../../auth/mfa/totp'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { HARNESS_TOTP_SECRET, PASSWORD, payload, user, type TestUser } from './harness'

/**
 * MFA-ADMIN-1 against the isolated synthetic database: an admin can reset anyone's two-step sign-in and turn it off (and
 * back on) for NON-admins only. Nothing is sent: the notice goes to a recording function.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0, showHiddenFields: true }
const SID = 'sid-mfa-admin-1'
const REASON = 'Lost phone, confirmed by phone call'
let p: Payload
let admin: TestUser, clientAdmin: TestUser, sales: TestUser
let seq = 0

const session = (u: TestUser): CrmSession => crmSessionFor(p, u.user)!
const grantStepUp = (u: TestUser, at = new Date()) => p.update({ collection: 'users', id: u.id, data: { mfa_stepup: { sid: SID, appAt: at.toISOString() } } as never, ...sys })
const exec = async (q: unknown) => (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle.execute(q)
const notices = () => {
  const sent: Array<{ to: string; subject: string; text: string }> = []
  return { sent, notify: async (to: string, subject: string, text: string) => void sent.push({ to, subject, text }) }
}
const fresh = async (id: string) => (await loadMfaUser(p, id))!
const auditOf = async (id: string, action: string) => (await p.find({ collection: 'audit-log', where: { and: [{ docId: { equals: id } }, { action: { equals: action } }] }, limit: 20, ...sys })).docs as unknown as Doc[]

/** A real user with a real login session (password-valid; verified only when `verified`). */
async function person(roles: string[], opts: { enrol?: boolean } = {}) {
  const email = `madm.${Date.now()}.${++seq}@example.test`
  const created = (await p.create({ collection: 'users', data: { email, password: PASSWORD, roles, name: `Synthetic Person ${seq}` } as never, ...sys })) as unknown as Doc
  const id = String(created.id)
  if (opts.enrol !== false) await enrolWithSecret(p, id, generateSecret())
  const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
  const headers = new Headers({ authorization: `JWT ${String(login.token)}` })
  const pending = (await pendingSession(p, headers))!
  return { id, email, headers, sid: pending.sid }
}
const act = (actor: TestUser, input: { userId: string; action: string; reason?: string }, n = notices(), now?: Date) => adminMfaAction(session(actor), SID, { reason: REASON, ...input }, { notify: n.notify, now })

beforeAll(async () => {
  p = await payload()
  ;[admin, clientAdmin, sales] = await Promise.all([user('platform-admin'), user('client-admin'), user('sales')])
})
beforeEach(async () => {
  await grantStepUp(admin)
  await grantStepUp(clientAdmin)
})

describe('MFA-ADMIN-1: who may do it', () => {
  it('a non-admin is FORBIDDEN (even with a step-up on their own record)', async () => {
    const t = await person(['sales'])
    await grantStepUp(sales)
    const n = notices()
    expect(await act(sales, { userId: t.id, action: 'reset' }, n)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await act(sales, { userId: t.id, action: 'turn-off' }, n)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect((await fresh(t.id)).mfa_enabled).toBe(true)
    expect(n.sent).toHaveLength(0)
  })
  it('without a fresh step-up: STEP_UP_REQUIRED, and nothing changes', async () => {
    const t = await person(['sales'])
    await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null } as never, ...sys })
    const n = notices()
    expect(await act(admin, { userId: t.id, action: 'reset' }, n)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await act(admin, { userId: t.id, action: 'turn-off' }, n)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    // a step-up older than 5 minutes does not count either (this gate keeps the authenticator window)
    await grantStepUp(admin, new Date(Date.now() - 6 * 60_000))
    expect(await act(admin, { userId: t.id, action: 'reset' }, n)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect((await fresh(t.id)).mfa_enabled).toBe(true)
    expect(n.sent).toHaveLength(0)
  })
  it('STEP-UP-1.1 (Auditor C1): a PASSWORD step-up does not open this gate; a fresh authenticator code does', async () => {
    const t = await person(['sales'])
    await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null, mfa_failures: 0, mfa_locked_until: null } as never, ...sys })
    const n = notices()
    const t0 = new Date(Date.now() + 3 * 3600_000) // a time step nobody used yet
    expect(await confirmStepUp(p, await fresh(admin.id), SID, PASSWORD, t0)).toMatchObject({ ok: true })
    expect(await act(admin, { userId: t.id, action: 'reset' }, n, t0)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect((await fresh(t.id)).mfa_enabled).toBe(true)
    expect(n.sent).toHaveLength(0)
    expect(await confirmStepUpApp(p, await fresh(admin.id), SID, totpCode(HARNESS_TOTP_SECRET, t0), t0)).toMatchObject({ ok: true })
    // The app code and the password step-up live side by side in one session: the password one is still there.
    const rec = (await fresh(admin.id)).mfa_stepup as { at?: string; appAt?: string }
    expect(typeof rec.at).toBe('string')
    expect(typeof rec.appAt).toBe('string')
    expect(await act(admin, { userId: t.id, action: 'reset' }, n, t0)).toMatchObject({ ok: true })
    expect((await fresh(t.id)).mfa_enabled).not.toBe(true)
  })
  it('a reason is required (and is not the audit): short, empty and control characters are refused', async () => {
    const t = await person(['sales'])
    for (const reason of ['', '   ', 'no', 'bad\u0000reason here']) expect(await act(admin, { userId: t.id, action: 'reset', reason })).toMatchObject({ ok: false, code: 'REASON_REQUIRED' })
    expect((await fresh(t.id)).mfa_enabled).toBe(true)
  })
  it('an admin cannot reset or exempt THEMSELVES', async () => {
    const n = notices()
    for (const action of ['reset', 'turn-off', 'turn-on']) expect(await act(admin, { userId: admin.id, action }, n)).toMatchObject({ ok: false, code: 'SELF_REFUSED' })
    expect((await fresh(admin.id)).mfa_enabled).toBe(true)
    expect(n.sent).toHaveLength(0)
  })
  it('only a platform-admin can change a platform-admin', async () => {
    expect(await act(clientAdmin, { userId: admin.id, action: 'reset' })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })
})

describe('MFA-ADMIN-1: the admin guard (never exempt an admin)', () => {
  it('turning off is refused for platform-admin, client-admin and any multi-role account holding an admin role', async () => {
    const targets = [await person(['platform-admin']), await person(['client-admin']), await person(['sales', 'client-admin']), await person(['client-admin', 'sales'])]
    for (const t of targets) {
      expect(await act(admin, { userId: t.id, action: 'turn-off' })).toMatchObject({ ok: false, code: 'ADMIN_NOT_EXEMPTABLE' })
      const u = await fresh(t.id)
      expect(u.mfa_exempt).not.toBe(true)
      expect(u.mfa_enabled).toBe(true)
    }
  })
  it('an account with no role cannot be exempted either (fail closed)', async () => {
    const t = await person(['sales'])
    await exec(sql`DELETE FROM users_roles WHERE parent_id = ${t.id}`)
    expect(await act(admin, { userId: t.id, action: 'turn-off' })).toMatchObject({ ok: false, code: 'ADMIN_NOT_EXEMPTABLE' })
  })
  it('even if the flag were set on an admin, the session is judged as admin: not verified without the second factor', async () => {
    const t = await person(['client-admin'], { enrol: false })
    await exec(sql`UPDATE users SET mfa_exempt = true WHERE id = ${t.id}`)
    const u = await fresh(t.id)
    expect(u.mfa_exempt).toBe(true)
    expect(isSessionVerified(u, t.sid)).toBe(false)
    expect((await pendingSession(p, t.headers))!.verified).toBe(false)
  })
  it('the flag cannot be set through the API, not even by an admin (field access)', async () => {
    const t = await person(['sales'])
    await p.update({ collection: 'users', id: t.id, data: { mfa_exempt: true } as never, overrideAccess: false, user: { ...admin.user, collection: 'users' } as never }).catch(() => undefined)
    expect((await fresh(t.id)).mfa_exempt).not.toBe(true)
  })
  it('a role change that adds an admin role clears the exemption', async () => {
    const t = await person(['sales'], { enrol: false })
    expect(await act(admin, { userId: t.id, action: 'turn-off' })).toMatchObject({ ok: true })
    expect((await fresh(t.id)).mfa_exempt).toBe(true)
    await p.update({ collection: 'users', id: t.id, data: { roles: ['sales', 'client-admin'] } as never, ...sys })
    const u = await fresh(t.id)
    expect(u.mfa_exempt).toBe(false)
    expect(u.mfa_exempt_at ?? null).toBeNull()
    expect(await auditOf(t.id, 'mfa-exempt-cleared')).toHaveLength(1)
  })
})

describe('MFA-ADMIN-1: reset', () => {
  it('clears the enrolment and forces enrolment at the next sign-in; the old session and remembered devices stop working', async () => {
    const t = await person(['sales'])
    await rememberDevice(p, { id: t.id, roles: ['sales'] } as never)
    const before = Number((await fresh(t.id)).security_epoch ?? 0)
    const n = notices()
    expect(await act(admin, { userId: t.id, action: 'reset' }, n)).toMatchObject({ ok: true })
    const u = await fresh(t.id)
    expect(u.mfa_enabled).toBe(false)
    expect(u.mfa_secret ?? null).toBeNull()
    expect(u.mfa_recovery ?? null).toBeNull()
    expect(Number(u.security_epoch)).toBe(before + 1)
    expect(await pendingSession(p, t.headers)).toBeNull() // the old session is gone
    expect(Number((await exec(sql`SELECT count(*)::int AS n FROM users_sessions WHERE _parent_id = ${t.id}`)).rows[0]!.n)).toBe(0)
    expect(Number((await exec(sql`SELECT count(*)::int AS n FROM mfa_trusted_devices WHERE user_id = ${t.id} AND revoked_at IS NULL`)).rows[0]!.n)).toBe(0)
    // signing in again: password-only session, must enrol (a setup key is offered)
    const login = await p.login({ collection: 'users', data: { email: t.email, password: PASSWORD } })
    const pending = (await pendingSession(p, new Headers({ authorization: `JWT ${String(login.token)}` })))!
    expect(pending.verified).toBe(false)
    expect(await beginEnrolment(p, pending.user)).toHaveProperty('secret')
    expect(n.sent).toHaveLength(1)
  })
  it('an admin target must enrol with the authenticator app again (TOTP stays mandatory)', async () => {
    const t = await person(['client-admin'])
    expect(await act(admin, { userId: t.id, action: 'reset' })).toMatchObject({ ok: true })
    const login = await p.login({ collection: 'users', data: { email: t.email, password: PASSWORD } })
    const pending = (await pendingSession(p, new Headers({ authorization: `JWT ${String(login.token)}` })))!
    expect(pending.verified).toBe(false)
    expect((await fresh(t.id)).mfa_exempt).not.toBe(true)
  })
  it('a reset of someone who has two-step turned off points at "turn back on"', async () => {
    const t = await person(['sales'], { enrol: false })
    await act(admin, { userId: t.id, action: 'turn-off' })
    expect(await act(admin, { userId: t.id, action: 'reset' })).toMatchObject({ ok: false, code: 'USE_TURN_ON' })
  })
})

describe('MFA-ADMIN-1: turn off / back on', () => {
  it('an exempt user signs in without a second factor; turning it back on restores two-step', async () => {
    const t = await person(['sales'])
    expect(await act(admin, { userId: t.id, action: 'turn-off' })).toMatchObject({ ok: true })
    const u = await fresh(t.id)
    expect(u.mfa_exempt).toBe(true)
    expect(u.mfa_enabled).toBe(false)
    const login = await p.login({ collection: 'users', data: { email: t.email, password: PASSWORD } })
    const headers = new Headers({ authorization: `JWT ${String(login.token)}` })
    const pending = (await pendingSession(p, headers))!
    expect(pending.verified).toBe(true)
    expect((await p.auth({ headers })).user?.id).toBe(t.id as never)
    expect(await act(admin, { userId: t.id, action: 'turn-on' })).toMatchObject({ ok: true })
    expect((await fresh(t.id)).mfa_exempt).toBe(false)
    expect(await pendingSession(p, headers)).toBeNull() // revoked
    const again = await p.login({ collection: 'users', data: { email: t.email, password: PASSWORD } })
    const h2 = new Headers({ authorization: `JWT ${String(again.token)}` })
    expect((await pendingSession(p, h2))!.verified).toBe(false)
    expect((await p.auth({ headers: h2 })).user).toBeNull()
  })
  it('turn-off is refused when already off; turn-on when not off', async () => {
    const t = await person(['sales'], { enrol: false })
    expect(await act(admin, { userId: t.id, action: 'turn-on' })).toMatchObject({ ok: false, code: 'NOT_OFF' })
    await act(admin, { userId: t.id, action: 'turn-off' })
    expect(await act(admin, { userId: t.id, action: 'turn-off' })).toMatchObject({ ok: false, code: 'ALREADY_OFF' })
  })
  it('the people list marks admins as never-exemptable and the caller as self', async () => {
    const rows = await listPeople(session(admin))
    const me = rows.find((r) => r.id === admin.id)!
    expect(me).toMatchObject({ isSelf: true, admin: true, canTurnOff: false })
    expect(rows.filter((r) => r.admin).every((r) => !r.canTurnOff)).toBe(true)
  })
})

describe('MFA-ADMIN-1: audit, reason, notice, sessions', () => {
  it('audits actor and from → to; the reason is in its own row, not in the audit', async () => {
    const t = await person(['sales'])
    expect(await act(admin, { userId: t.id, action: 'turn-off', reason: 'Owner asked: shared kiosk login' })).toMatchObject({ ok: true })
    const rows = await auditOf(t.id, 'mfa-admin-turned-off')
    expect(rows).toHaveLength(1)
    expect(String(rows[0]!.actor)).toBe(admin.id)
    expect((rows[0]!.detail as Doc).from).toEqual({ mfa: 'on', exempt: false })
    expect((rows[0]!.detail as Doc).to).toEqual({ mfa: 'off', exempt: true })
    expect(JSON.stringify(rows[0])).not.toContain('kiosk')
    const r = (await exec(sql`SELECT actor_id, action, reason FROM mfa_admin_actions WHERE user_id = ${t.id}`)).rows
    expect(r).toEqual([{ actor_id: admin.id, action: 'turn-off', reason: 'Owner asked: shared kiosk login' }])
  })
  it('sends ONE plain notice to the person: no addresses, no codes, no phone', async () => {
    const t = await person(['sales'])
    const n = notices()
    const now = new Date('2026-10-09T10:00:00Z')
    await grantStepUp(admin, now)
    await act(admin, { userId: t.id, action: 'reset' }, n, now)
    expect(n.sent).toHaveLength(1)
    const m = n.sent[0]!
    expect(m.to).toBe(t.email)
    expect(m.text).toContain('2026-10-09')
    expect(m.text).toContain('contact your administrator')
    expect(m.text.endsWith('contact your administrator.\n\nICS Sales Team\n')).toBe(true) // OGCS: signed
    expect(`${m.subject}${m.text}`.replace('2026-10-09', 'DATE')).not.toMatch(/@|https?:|\d{6}|\+?\d[\d\s().-]{8,}\d/)
    for (const a of ['reset', 'turn-off', 'turn-on'] as const) expect(noticeText(a, now).text).not.toMatch(/@|https?:/)
    expect((await auditOf(t.id, 'mfa-admin-notice'))[0]!.detail).toMatchObject({ for: 'reset', sent: true })
  })
  it('a failed notice does not fail the action, and its outcome is audited', async () => {
    const t = await person(['sales'])
    const out = await adminMfaAction(session(admin), SID, { userId: t.id, action: 'reset', reason: REASON }, { notify: async () => { throw new Error('SMTP_DOWN') } })
    expect(out).toMatchObject({ ok: true })
    expect((await fresh(t.id)).mfa_enabled).toBe(false)
    expect((await auditOf(t.id, 'mfa-admin-notice'))[0]!.detail).toMatchObject({ sent: false })
  })
  it('the default notice goes through the system mail adapter (payload.sendEmail)', async () => {
    const t = await person(['sales'])
    const spy = vi.spyOn(p, 'sendEmail').mockResolvedValue(undefined as never)
    await adminMfaAction(session(admin), SID, { userId: t.id, action: 'turn-off', reason: REASON })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toMatchObject({ to: t.email })
    spy.mockRestore()
  })
})

describe('MFA-ADMIN-1.1: audit first, one transaction, narrow reads, password only', () => {
  const applied = async (id: string) => (await exec(sql`SELECT applied FROM mfa_admin_actions WHERE user_id = ${id} ORDER BY id`)).rows.map((r) => r.applied)
  it('a failed audit write aborts the action: nothing changes, no notice, the reason row is NOT marked applied', async () => {
    const t = await person(['sales'])
    const real = p.create.bind(p)
    const spy = vi.spyOn(p, 'create').mockImplementation(((a: { collection?: string }) => (a.collection === 'audit-log' ? Promise.reject(new Error('AUDIT_DOWN')) : real(a as never))) as never)
    const n = notices()
    const out = await act(admin, { userId: t.id, action: 'reset' }, n)
    spy.mockRestore()
    expect(out).toMatchObject({ ok: false, code: 'AUDIT_FAILED' })
    const u = await fresh(t.id)
    expect(u.mfa_enabled).toBe(true)
    expect(u.mfa_secret).toBeTruthy()
    expect(await pendingSession(p, t.headers)).not.toBeNull() // session still alive
    expect(n.sent).toHaveLength(0)
    expect(await applied(t.id)).toEqual([false])
    // and a good run marks its row applied
    expect(await act(admin, { userId: t.id, action: 'reset' })).toMatchObject({ ok: true })
    expect(await applied(t.id)).toEqual([false, true])
  })
  it('the change is ONE transaction: a failure part-way rolls everything back', async () => {
    const t = await person(['sales'])
    await rememberDevice(p, { id: t.id, roles: ['sales'] } as never)
    const d = (p.db as unknown as { drizzle: { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> } }).drizzle
    const real = d.transaction.bind(d)
    const spy = vi.spyOn(d, 'transaction').mockImplementation((fn) => real((tx) => fn(new Proxy(tx as object, { get: (target, k) => (k === 'execute' ? (q: unknown) => { if (JSON.stringify(q).includes('users_sessions')) throw new Error('BOOM'); return (target as { execute: (q: unknown) => Promise<unknown> }).execute(q) } : Reflect.get(target, k)) }))))
    const out = await act(admin, { userId: t.id, action: 'reset' })
    spy.mockRestore()
    expect(out).toMatchObject({ ok: false, code: 'CHANGE_FAILED' })
    const u = await fresh(t.id)
    expect(u.mfa_enabled).toBe(true) // the first statement was rolled back
    expect(u.mfa_secret).toBeTruthy()
    expect(Number((await exec(sql`SELECT count(*)::int AS n FROM mfa_trusted_devices WHERE user_id = ${t.id} AND revoked_at IS NULL`)).rows[0]!.n)).toBe(1)
    expect(await pendingSession(p, t.headers)).not.toBeNull()
    expect(await applied(t.id)).toEqual([false])
    expect(await auditOf(t.id, 'mfa-admin-aborted')).toHaveLength(1)
  })
  it('reads only the state fields: no hidden fields, a field select on every users read', async () => {
    const spy = vi.spyOn(p, 'find')
    const rows = await listPeople(session(admin))
    const call = spy.mock.calls.find((c) => (c[0] as { collection?: string }).collection === 'users')![0] as Record<string, unknown>
    expect(call.showHiddenFields).toBeUndefined()
    expect(Object.keys(call.select as object).sort()).toEqual(['email', 'mfa_enabled', 'mfa_exempt', 'name', 'roles'])
    spy.mockRestore()
    expect(Object.keys(rows[0]!).sort()).toEqual(['admin', 'canTurnOff', 'email', 'exempt', 'id', 'isSelf', 'mfa', 'name', 'roles'])
    const spy2 = vi.spyOn(p, 'findByID')
    const t = await person(['sales'])
    await act(admin, { userId: t.id, action: 'reset' })
    const mine = spy2.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((c) => c.collection === 'users' && c.id === t.id && c.select)
    spy2.mockRestore()
    expect(mine.length).toBeGreaterThanOrEqual(1)
    for (const c of mine) expect(c.showHiddenFields).toBeUndefined()
  })
  it('turned off means PASSWORD ONLY: no second factor of any kind (no code, no device, no emailed code) and nothing is created for it', async () => {
    const t = await person(['sales'])
    await act(admin, { userId: t.id, action: 'turn-off' })
    const login = await p.login({ collection: 'users', data: { email: t.email, password: PASSWORD } })
    const headers = new Headers({ authorization: `JWT ${String(login.token)}` }) // no device cookie, no code
    const pending = (await pendingSession(p, headers))!
    expect(pending.verified).toBe(true)
    expect((await p.auth({ headers })).user?.id).toBe(t.id as never)
    const u = await fresh(t.id)
    expect([u.mfa_enabled, u.mfa_secret ?? null, u.mfa_recovery ?? null, u.mfa_exempt]).toEqual([false, null, null, true])
    expect(Number((await exec(sql`SELECT count(*)::int AS n FROM mfa_email_codes WHERE user_id = ${t.id}`)).rows[0]!.n)).toBe(0)
    // the emailed-code and remembered-device paths do not apply: there is nothing to verify, and nothing remembers
    expect(await verifySecondFactorByEmail(p, u, pending.sid, '123456')).toMatchObject({ ok: false })
    expect(Number((await exec(sql`SELECT count(*)::int AS n FROM mfa_trusted_devices WHERE user_id = ${t.id} AND revoked_at IS NULL`)).rows[0]!.n)).toBe(0)
  })
})

describe('PEOPLE-FIX-1: effective state and the named result', () => {
  it('L05: a stale exempt flag on an admin shows the EFFECTIVE state (two-step on / not set up), never "Turned off"', async () => {
    const enrolled = await person(['client-admin'])
    const fresh2 = await person(['sales', 'client-admin'], { enrol: false })
    await exec(sql`UPDATE users SET mfa_exempt = true WHERE id IN (${enrolled.id}, ${fresh2.id})`)
    const rows = await listPeople(session(admin))
    const a = rows.find((r) => r.id === enrolled.id)!
    const b = rows.find((r) => r.id === fresh2.id)!
    expect(a).toMatchObject({ admin: true, mfa: 'on', exempt: false, canTurnOff: false })
    expect(b).toMatchObject({ admin: true, mfa: 'not-set-up', exempt: false, canTurnOff: false })
    expect(rows.filter((r) => r.admin).some((r) => r.mfa === 'off' || r.exempt)).toBe(false)
    // the actions agree with the display: turn-on is not offered (NOT_OFF), a reset works and clears the stale flag
    expect(await act(admin, { userId: enrolled.id, action: 'turn-on' })).toMatchObject({ ok: false, code: 'NOT_OFF' })
    expect(await act(admin, { userId: enrolled.id, action: 'reset' })).toMatchObject({ ok: true })
    expect((await fresh(enrolled.id)).mfa_exempt).toBe(false)
  })
  it('L04: the result names the person; a failed notice is a warning with the instruction', async () => {
    const t = await person(['sales'])
    const name = String((await fresh(t.id)).name)
    const ok = await act(admin, { userId: t.id, action: 'reset' })
    expect(ok).toMatchObject({ ok: true })
    expect((ok as { message: string; warn?: boolean }).message).toContain(`reset for ${name}`)
    expect((ok as { warn?: boolean }).warn).toBeUndefined()
    const t2 = await person(['sales'])
    const name2 = String((await fresh(t2.id)).name)
    const bad = await adminMfaAction(session(admin), SID, { userId: t2.id, action: 'turn-off', reason: REASON }, { notify: async () => { throw new Error('SMTP_DOWN') } })
    expect(bad).toMatchObject({ ok: true, warn: true })
    expect((bad as { message: string }).message).toContain(`turned off for ${name2}`)
    expect((bad as { message: string }).message).toContain('We could not email them. Tell them directly.')
  })
})
