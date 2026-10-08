import { describe, expect, it } from 'vitest'
import { pendingSession } from '../../auth/mfa/guard'
import { enrolWithSecret, loadMfaUser, MAX_FAILURES, verifySecondFactor } from '../../auth/mfa/service'
import { generateSecret, totpCode } from '../../auth/mfa/totp'
import { payload } from './harness'

/**
 * MFA-UX-1 against the isolated synthetic database: the sign-in step says how many tries are left as the lock nears,
 * and how long the lock runs. The checks themselves (Patch L2) are unchanged: same count, same 15-minute lock.
 */
type Doc = Record<string, unknown>
const PASSWORD = 'synthetic-Password-1!'
const sys = { overrideAccess: true as const, depth: 0 }
let seq = 0

async function enrolledUser() {
  const p = await payload()
  const email = `mfaux.${Date.now()}.${++seq}@example.test`
  const created = (await p.create({ collection: 'users', data: { email, password: PASSWORD, roles: ['sales'], name: `Synthetic MFA-UX ${seq}` } as never, ...sys })) as unknown as Doc
  const secret = generateSecret()
  await enrolWithSecret(p, String(created.id), secret)
  const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
  const pending = (await pendingSession(p, new Headers({ authorization: `JWT ${String(login.token)}` })))!
  return { id: String(created.id), secret, sid: pending.sid }
}

describe('MFA-UX-1 sign-in messages', () => {
  it('wrong codes count down from 3 tries left, then lock for 15 minutes; the lock message says so', async () => {
    const p = await payload()
    const u = await enrolledUser()
    const out: Doc[] = []
    for (let i = 0; i < MAX_FAILURES; i++) out.push((await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, u.sid, '000000')) as Doc)
    expect(out.map((o) => o.attemptsLeft ?? null)).toEqual([4, 3, 2, 1, null])
    expect(out[0]!.message).toBe('That code is not right. Check the time on your phone and try again.')
    expect(out[1]!.message).toMatch(/ 3 tries left before a 15-minute pause\.$/)
    expect(out[3]!.message).toMatch(/ 1 try left before a 15-minute pause\.$/)
    expect(out[4]).toMatchObject({ ok: false, code: 'LOCKED', message: 'Too many wrong codes. Try again in 15 minutes.', retryAfterSeconds: 900 })
    // Locked: even the right code is refused, and the message gives the time left.
    const locked = (await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, u.sid, totpCode(u.secret))) as Doc
    expect(locked).toMatchObject({ ok: false, code: 'LOCKED', message: 'Too many wrong codes. Try again in 15 minutes.' })
    expect(Number(locked.retryAfterSeconds)).toBeGreaterThan(840)
  })

  it('a right code resets the count: the next wrong code starts again with no countdown', async () => {
    const p = await payload()
    const u = await enrolledUser()
    for (let i = 0; i < 3; i++) await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, u.sid, '000000')
    expect(await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, u.sid, totpCode(u.secret))).toMatchObject({ ok: true })
    const next = (await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, u.sid, '000000')) as Doc
    expect(next).toMatchObject({ ok: false, code: 'MISMATCH', attemptsLeft: 4 })
    expect(next.message).not.toMatch(/tries left|try left/)
  })
})
