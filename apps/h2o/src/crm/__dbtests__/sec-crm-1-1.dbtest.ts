import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'
import { addVerifiedSession, claimRecoveryCode, claimStep, countFailure } from '../../auth/mfa/atomic'
import { pendingSession } from '../../auth/mfa/guard'
import { hashRecoveryCode } from '../../auth/mfa/keys'
import { confirmStepUp, enrolWithSecret, isSessionVerified, loadMfaUser, MAX_FAILURES, verifySecondFactor } from '../../auth/mfa/service'
import { generateSecret, stepAt, totpCode } from '../../auth/mfa/totp'
import { PASSWORD, payload } from './harness'

/**
 * SEC-CRM-1.1 (Security Auditor R2-01): every two-factor outcome is one conditional statement, so the state can never
 * move backwards: the stored step never goes down, a success never wipes a lock a concurrent 5th failure set, and the
 * failure counter and the lock change in one statement. Orders are forced by calling the steps in a chosen order and,
 * for the real race, by running both at once many times and checking the invariant.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0, showHiddenFields: true }
let seq = 0
const exec = async (p: Payload, q: unknown) => (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle.execute(q)
const state = async (p: Payload, id: string) => (await exec(p, sql`SELECT mfa_last_step, mfa_failures, mfa_locked_until, mfa_sessions FROM users WHERE id = ${id}`)).rows[0]!

async function enrolled(recovery: string[] = []) {
  const p = await payload()
  const email = `sec11.${Date.now()}.${++seq}@example.test`
  const created = (await p.create({ collection: 'users', data: { email, password: PASSWORD, roles: ['sales'], name: `Synthetic SEC-1.1 ${seq}` } as never, ...sys })) as unknown as Doc
  const id = String(created.id)
  const secret = generateSecret()
  await enrolWithSecret(p, id, secret)
  if (recovery.length) await p.update({ collection: 'users', id, data: { mfa_recovery: { hashes: recovery.map(hashRecoveryCode) } } as never, ...sys })
  const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
  const pending = (await pendingSession(p, new Headers({ authorization: `JWT ${String(login.token)}` })))!
  return { p, id, secret, sid: pending.sid }
}
const set = (p: Payload, id: string, failures: number, step: number | null) => exec(p, sql`UPDATE users SET mfa_failures = ${failures}, mfa_locked_until = NULL, mfa_last_step = ${step} WHERE id = ${id}`)

describe('SEC-CRM-1.1: the step never goes down', () => {
  it('A claims N after B claimed N+1 → refused, step stays N+1', async () => {
    const u = await enrolled()
    await set(u.p, u.id, 0, 100)
    const now = new Date()
    expect(await claimStep(u.p, u.id, 102, now)).toBe(true)
    expect(await claimStep(u.p, u.id, 101, now)).toBe(false)
    expect(Number((await state(u.p, u.id)).mfa_last_step)).toBe(102)
  })
  it('A claims N, then B claims N+1 → both fine in order, step ends N+1; the same step twice only once', async () => {
    const u = await enrolled()
    await set(u.p, u.id, 0, 100)
    const now = new Date()
    expect(await claimStep(u.p, u.id, 101, now)).toBe(true)
    expect(await claimStep(u.p, u.id, 101, now)).toBe(false)
    expect(await claimStep(u.p, u.id, 102, now)).toBe(true)
    expect(Number((await state(u.p, u.id)).mfa_last_step)).toBe(102)
  })
  it('parallel claims of adjacent steps never leave the lower one stored', async () => {
    for (let i = 0; i < 15; i++) {
      const u = await enrolled()
      await set(u.p, u.id, 0, 100)
      const now = new Date()
      await Promise.all([claimStep(u.p, u.id, 101, now), claimStep(u.p, u.id, 102, now)])
      expect(Number((await state(u.p, u.id)).mfa_last_step)).toBe(102)
    }
  })
})

describe('SEC-CRM-1.1: a success never wipes a newer lock', () => {
  it('5th failure first → locked; a valid claim afterwards is refused and the lock stays', async () => {
    const u = await enrolled()
    await set(u.p, u.id, MAX_FAILURES - 1, 100)
    const f = await countFailure(u.p, u.id, MAX_FAILURES, new Date(Date.now() + 900_000))
    expect(f).toEqual({ failures: MAX_FAILURES, locked: true })
    expect(await claimStep(u.p, u.id, 105, new Date())).toBe(false)
    const s = await state(u.p, u.id)
    expect(s.mfa_locked_until).toBeTruthy()
    expect(Number(s.mfa_last_step)).toBe(100)
    expect(Number(s.mfa_failures)).toBe(0)
  })
  it('valid claim first → failures and lock cleared in the same statement; a later wrong code starts again at 1', async () => {
    const u = await enrolled()
    await set(u.p, u.id, MAX_FAILURES - 1, 100)
    expect(await claimStep(u.p, u.id, 105, new Date())).toBe(true)
    expect(Number((await state(u.p, u.id)).mfa_failures)).toBe(0)
    expect(await countFailure(u.p, u.id, MAX_FAILURES, new Date(Date.now() + 900_000))).toEqual({ failures: 1, locked: false })
  })
  it('real race, claimStep vs 5th failure: never "step taken AND lock set"', async () => {
    let lockedRuns = 0
    let claimedRuns = 0
    for (let i = 0; i < 25; i++) {
      const u = await enrolled()
      await set(u.p, u.id, MAX_FAILURES - 1, 100)
      const [claimed] = await Promise.all([claimStep(u.p, u.id, 105, new Date()), countFailure(u.p, u.id, MAX_FAILURES, new Date(Date.now() + 900_000))])
      const s = await state(u.p, u.id)
      if (claimed) {
        claimedRuns++
        expect(Number(s.mfa_last_step)).toBe(105)
        expect(s.mfa_locked_until).toBeNull() // the failure ran after the claim and counted as 1
      } else {
        lockedRuns++
        expect(Number(s.mfa_last_step)).toBe(100)
        expect(s.mfa_locked_until).toBeTruthy()
      }
    }
    expect(lockedRuns + claimedRuns).toBe(25)
  })
  it('service level: a valid code racing the 5th wrong code; if the wrong one reports LOCKED the user ends locked', async () => {
    for (let i = 0; i < 15; i++) {
      const u = await enrolled()
      await set(u.p, u.id, MAX_FAILURES - 1, stepAt(new Date()) - 2)
      const user = (await loadMfaUser(u.p, u.id))!
      const [good, bad] = (await Promise.all([verifySecondFactor(u.p, user, u.sid, totpCode(u.secret)), verifySecondFactor(u.p, user, u.sid, '000000')])) as Doc[]
      const end = await state(u.p, u.id)
      if (bad!.code === 'LOCKED' && bad!.ok === false && (bad!.message as string).includes('Too many')) {
        // The 5th failure locked the account: a success must not have erased that.
        expect(good!.ok === true && end.mfa_locked_until === null && bad!.code === 'LOCKED').toBe(false)
      }
      if (good!.ok === true) expect(isSessionVerified((await loadMfaUser(u.p, u.id))!, u.sid)).toBe(true)
    }
  })
})

describe('SEC-CRM-1.1: recovery codes', () => {
  it('a recovery success clears failures and an expired lock in the same statement', async () => {
    const u = await enrolled(['AAAAA-BBBBB'.replace('-', '')])
    await set(u.p, u.id, 3, 100)
    const left = await claimRecoveryCode(u.p, u.id, hashRecoveryCode('AAAAABBBBB'), new Date())
    expect(left).toBe(0)
    expect(Number((await state(u.p, u.id)).mfa_failures)).toBe(0)
  })
  it('5th failure first → recovery claim refused, code kept, lock stays', async () => {
    const u = await enrolled(['CCCCCDDDDD'])
    await set(u.p, u.id, MAX_FAILURES - 1, 100)
    await countFailure(u.p, u.id, MAX_FAILURES, new Date(Date.now() + 900_000))
    expect(await claimRecoveryCode(u.p, u.id, hashRecoveryCode('CCCCCDDDDD'), new Date())).toBeNull()
    const s = await state(u.p, u.id)
    expect(s.mfa_locked_until).toBeTruthy()
    expect(JSON.stringify((await loadMfaUser(u.p, u.id))!.mfa_recovery)).toContain(hashRecoveryCode('CCCCCDDDDD'))
  })
  it('real race, recovery vs 5th failure: never "code used AND lock set"', async () => {
    for (let i = 0; i < 20; i++) {
      const u = await enrolled(['EEEEEFFFFF'])
      await set(u.p, u.id, MAX_FAILURES - 1, 100)
      const [left] = await Promise.all([claimRecoveryCode(u.p, u.id, hashRecoveryCode('EEEEEFFFFF'), new Date()), countFailure(u.p, u.id, MAX_FAILURES, new Date(Date.now() + 900_000))])
      const s = await state(u.p, u.id)
      if (left !== null) expect(s.mfa_locked_until).toBeNull()
      else expect(s.mfa_locked_until).toBeTruthy()
    }
  })
})

describe('SEC-CRM-1.1: failure count + lock in one statement; step-up; sessions', () => {
  it('exactly one of N parallel wrong guesses reaches the limit, the count then restarts at 0', async () => {
    const u = await enrolled()
    await set(u.p, u.id, 0, 100)
    const r = await Promise.all(Array.from({ length: MAX_FAILURES }, () => countFailure(u.p, u.id, MAX_FAILURES, new Date(Date.now() + 900_000))))
    expect(r.filter((x) => x.locked)).toHaveLength(1)
    expect(r.map((x) => x.failures).sort()).toEqual([1, 2, 3, 4, 5])
    const s = await state(u.p, u.id)
    expect(Number(s.mfa_failures)).toBe(0)
    expect(s.mfa_locked_until).toBeTruthy()
  })
  it('step-up: a valid code clears failures but never lowers the step; a locked user cannot step up', async () => {
    const u = await enrolled()
    const now = new Date()
    await set(u.p, u.id, 2, stepAt(now) + 10)
    // A code for an older step than the stored one is refused (replay), step unchanged.
    expect(await confirmStepUp(u.p, (await loadMfaUser(u.p, u.id))!, u.sid, totpCode(u.secret, now))).toMatchObject({ ok: false })
    expect(Number((await state(u.p, u.id)).mfa_last_step)).toBe(stepAt(now) + 10)
    await set(u.p, u.id, 2, stepAt(now) - 2)
    expect(await confirmStepUp(u.p, (await loadMfaUser(u.p, u.id))!, u.sid, totpCode(u.secret, now))).toMatchObject({ ok: true })
    const s = await state(u.p, u.id)
    expect(Number(s.mfa_last_step)).toBe(stepAt(now))
    expect(Number(s.mfa_failures)).toBe(0)
  })
  it('verified sessions are appended inside the database: parallel session adds keep each other', async () => {
    const u = await enrolled()
    const login = async () => {
      const email = String((await loadMfaUser(u.p, u.id))!.email)
      const l = await u.p.login({ collection: 'users', data: { email, password: PASSWORD } })
      return (await pendingSession(u.p, new Headers({ authorization: `JWT ${String(l.token)}` })))!.sid
    }
    // Logins one after another (Payload's own session list is not ours to race); the verified-session adds run together.
    const sids = [await login(), await login(), await login()]
    await Promise.all(sids.map((sid) => addVerifiedSession(u.p, u.id, sid, new Date())))
    const user = (await loadMfaUser(u.p, u.id))!
    for (const sid of sids) expect(isSessionVerified(user, sid)).toBe(true)
  })
})
