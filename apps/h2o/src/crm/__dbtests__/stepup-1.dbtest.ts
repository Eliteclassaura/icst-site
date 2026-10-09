import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'
import { clearStepUpOnLogout } from '../../auth/mfa/fields'
import { pendingSession } from '../../auth/mfa/guard'
import { verifyAccountPassword } from '../../auth/mfa/password'
import { confirmStepUp, enrolWithSecret, loadMfaUser, STEP_UP_MS, stepUpSecondsLeft } from '../../auth/mfa/service'
import { generateSecret } from '../../auth/mfa/totp'
import { stepUp } from '../../email/sending-settings'
import { setEngineSwitch } from '../ers/switch'
import { runImport } from '../library/service'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { PASSWORD, payload, resetCrm, user, type TestUser } from './harness'

/**
 * STEP-UP-1 (owner 2026-10-09): the step-up asks for the user's PASSWORD (not the authenticator code), lasts 30 minutes in
 * this session, counts wrong passwords towards the sign-in lock and audits them. Synthetic data only.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser
let A: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
const exec = async (q: unknown) => (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle.execute(q)
const SID = 'sid-stepup-1'
let seq = 0

async function makeUser(passwordless = false) {
  const email = `stepup1.${Date.now()}.${++seq}@example.test`
  const created = (await p.create({ collection: 'users', data: { email, password: PASSWORD, roles: ['platform-admin'], name: `Synthetic STEP-UP-1 ${seq}` } as never, ...sys })) as unknown as Doc
  const id = String(created.id)
  await enrolWithSecret(p, id, generateSecret())
  if (passwordless) await exec(sql`UPDATE users SET hash = NULL, salt = NULL WHERE id = ${id}`)
  const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } }).catch(() => null)
  const pending = login ? await pendingSession(p, new Headers({ authorization: `JWT ${String(login.token)}` })) : null
  return { id, email, sid: pending?.sid ?? SID }
}
const audit = async (id: string, action: string) =>
  (await p.find({ collection: 'audit-log', where: { and: [{ collection: { equals: 'users' } }, { docId: { equals: id } }] }, limit: 200, ...sys })).docs.filter((d) => JSON.stringify(d).includes(action))

beforeAll(async () => {
  p = await payload()
  await resetCrm()
  admin = await user('platform-admin')
  A = crmSessionFor(p, admin.user)!
})

describe('STEP-UP-1 the password', () => {
  it('verifyAccountPassword agrees with Payload: right, wrong, and after Payload changes the password', async () => {
    expect(await verifyAccountPassword(p, admin.id, PASSWORD)).toBe(true)
    expect(await verifyAccountPassword(p, admin.id, PASSWORD + 'x')).toBe(false)
    expect(await verifyAccountPassword(p, admin.id, '')).toBe(false)
    const u = await makeUser()
    await p.update({ collection: 'users', id: u.id, data: { password: 'a-New-Synthetic-Password-2!' } as never, ...sys })
    expect(await verifyAccountPassword(p, u.id, 'a-New-Synthetic-Password-2!')).toBe(true)
    expect(await verifyAccountPassword(p, u.id, PASSWORD)).toBe(false)
  })

  it('the right password grants the step-up for 30 minutes in this session, and no longer', async () => {
    const u = await makeUser()
    const t0 = new Date()
    expect(STEP_UP_MS).toBe(30 * 60 * 1000)
    expect(await confirmStepUp(p, (await loadMfaUser(p, u.id))!, u.sid, PASSWORD, t0)).toMatchObject({ ok: true })
    const mu = (await loadMfaUser(p, u.id))!
    expect(stepUpSecondsLeft(mu, u.sid, new Date(t0.getTime() + 29 * 60_000))).toBeGreaterThan(0)
    expect(stepUpSecondsLeft(mu, u.sid, new Date(t0.getTime() + 31 * 60_000))).toBe(0)
    expect(stepUpSecondsLeft(mu, 'another-session', t0)).toBe(0)
    expect((await audit(u.id, 'mfa-stepup')).length).toBeGreaterThan(0)
  })

  it('a wrong password is refused, counted towards the sign-in lock, audited, and gives no hint', async () => {
    const u = await makeUser()
    const out = await confirmStepUp(p, (await loadMfaUser(p, u.id))!, u.sid, 'a-wrong-password')
    expect(out).toMatchObject({ ok: false, code: 'MISMATCH' })
    expect(String((out as { message: string }).message)).toBe('That password is not right.')
    expect(Number((await exec(sql`SELECT mfa_failures AS f FROM users WHERE id = ${u.id}`)).rows[0]!.f)).toBe(1)
    expect(stepUpSecondsLeft((await loadMfaUser(p, u.id))!, u.sid)).toBe(0)
    expect((await audit(u.id, 'mfa-failed')).length).toBeGreaterThan(0)
    for (let i = 0; i < 4; i++) await confirmStepUp(p, (await loadMfaUser(p, u.id))!, u.sid, 'a-wrong-password')
    const locked = await confirmStepUp(p, (await loadMfaUser(p, u.id))!, u.sid, PASSWORD)
    expect(locked).toMatchObject({ ok: false, code: 'LOCKED' })
    expect((await audit(u.id, 'mfa-locked')).length).toBeGreaterThan(0)
  })

  it('an authenticator code is not a step-up: it is just a wrong password', async () => {
    const u = await makeUser()
    expect(await confirmStepUp(p, (await loadMfaUser(p, u.id))!, u.sid, '123456')).toMatchObject({ ok: false, code: 'MISMATCH' })
  })

  it('an account with no password fails closed (no authenticator fallback)', async () => {
    const u = await makeUser(true)
    expect(await confirmStepUp(p, (await loadMfaUser(p, u.id))!, u.sid, PASSWORD)).toMatchObject({ ok: false, code: 'NOT_ENROLLED' })
    expect(stepUpSecondsLeft((await loadMfaUser(p, u.id))!, u.sid)).toBe(0)
  })

  it('sign-out clears it, and a new session id never inherits it', async () => {
    const u = await makeUser()
    await confirmStepUp(p, (await loadMfaUser(p, u.id))!, u.sid, PASSWORD)
    expect(stepUpSecondsLeft((await loadMfaUser(p, u.id))!, u.sid)).toBeGreaterThan(0)
    expect(stepUpSecondsLeft((await loadMfaUser(p, u.id))!, 'the-next-sign-in')).toBe(0)
    await clearStepUpOnLogout({ req: { payload: p, user: { id: u.id } } } as never)
    expect(stepUpSecondsLeft((await loadMfaUser(p, u.id))!, u.sid)).toBe(0)
  })
})

describe('STEP-UP-1 the gates (what still needs the password)', () => {
  it('stepUp(): none → STEP_UP_REQUIRED; the password given now passes and is remembered; a wrong one is refused', async () => {
    const s = crmSessionFor(p, (await p.findByID({ collection: 'users', id: admin.id, depth: 0, overrideAccess: true })))!
    await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null, mfa_failures: 0, mfa_locked_until: null } as never, ...sys })
    expect(await stepUp(s, SID, undefined)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await stepUp(s, SID, 'nope')).toMatchObject({ ok: false, code: 'STEP_UP_MISMATCH' })
    expect(await stepUp(s, SID, PASSWORD)).toBeNull()
    expect(await stepUp(s, SID, undefined)).toBeNull()
    expect(await stepUp(s, 'a-different-session', undefined)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
  })

  it('library import (real), the engine ON and every gate answer STEP_UP_REQUIRED until the password; the engine OFF and a dry run never do', async () => {
    await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null, mfa_failures: 0, mfa_locked_until: null } as never, ...sys })
    expect(await runImport(A, SID, true)).toMatchObject({ ok: true })
    expect(await runImport(A, SID, false)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await setEngineSwitch(A, SID, { on: true })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await setEngineSwitch(A, SID, { on: false })).toMatchObject({ ok: true })
    expect(await setEngineSwitch(A, SID, { on: true, password: 'wrong' })).toMatchObject({ ok: false, code: 'STEP_UP_MISMATCH' })
    expect(await setEngineSwitch(A, SID, { on: true, password: PASSWORD })).toMatchObject({ ok: true })
    await setEngineSwitch(A, SID, { on: false })
  })
})
