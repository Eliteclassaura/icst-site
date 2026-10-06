import { beforeAll, describe, expect, it } from 'vitest'
import { mfaGuardInstalled, pendingSession } from '../../auth/mfa/guard'
import { beginEnrolment, confirmEnrolment, enrolWithSecret, loadMfaUser, MAX_FAILURES, verifySecondFactor } from '../../auth/mfa/service'
import { generateSecret, totpCode } from '../../auth/mfa/totp'
import { payload, rest, user, userEmail, type TestUser } from './harness'

/**
 * CRM Patch L2 against the isolated synthetic database: two-factor for every user, enforced server-side.
 * A fresh synthetic user is created per scenario and signed in WITHOUT the harness's session trust, so these tests
 * exercise the real path: password-only session → refused everywhere → second factor → allowed.
 */
type Doc = Record<string, unknown>
const PASSWORD = 'synthetic-Password-1!'
const sys = { overrideAccess: true as const, depth: 0 }
let admin: TestUser
let seq = 0

async function freshUser(role: 'sales' | 'editor' = 'sales') {
  const p = await payload()
  const email = `mfa.${Date.now()}.${++seq}@example.test`
  const created = (await p.create({ collection: 'users', data: { email, password: PASSWORD, roles: [role], name: `Synthetic MFA ${seq}` } as never, ...sys })) as unknown as Doc
  return { id: String(created.id), email }
}
async function signIn(email: string) {
  const p = await payload()
  const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
  const token = String(login.token)
  const headers = new Headers({ authorization: `JWT ${token}` })
  const pending = (await pendingSession(p, headers))!
  return { token, headers, pending }
}
const me = async (token: string) => (await rest.get('users/me', token)).body.user ?? null

beforeAll(async () => {
  admin = await user('platform-admin')
})

describe('L2 enforcement', () => {
  it('the guard is installed; a password-only session authenticates as nobody (REST, payload.auth, CRM data)', async () => {
    expect(mfaGuardInstalled()).toBe(true)
    const u = await freshUser()
    const s = await signIn(u.email)
    expect(s.pending).toMatchObject({ sid: expect.any(String), verified: false })
    expect(await me(s.token)).toBeNull()
    expect((await (await payload()).auth({ headers: s.headers })).user).toBeNull()
    expect((await rest.get('crm-rfqs?limit=1', s.token)).status).toBeGreaterThanOrEqual(401)
    expect((await rest.patch(`users/${u.id}`, s.token, { name: 'Changed' })).status).toBeGreaterThanOrEqual(401)
  })

  it('first sign-in enrols: setup key → first code → 10 recovery codes → this session works; secrets stay sealed', async () => {
    const u = await freshUser()
    const s = await signIn(u.email)
    const p = await payload()
    const setup = await beginEnrolment(p, s.pending.user)
    if (!('secret' in setup)) throw new Error('expected a setup key')
    // A reload within 30 minutes shows the same key.
    const again = await beginEnrolment(p, (await loadMfaUser(p, u.id))!)
    expect('secret' in again && again.secret).toBe(setup.secret)
    expect((await confirmEnrolment(p, (await loadMfaUser(p, u.id))!, s.pending.sid, '000000')).ok).toBe(false)
    const out = await confirmEnrolment(p, (await loadMfaUser(p, u.id))!, s.pending.sid, totpCode(setup.secret))
    expect(out).toMatchObject({ ok: true })
    expect(out.ok && out.recoveryCodes).toHaveLength(10)
    expect(await me(s.token)).toMatchObject({ id: u.id })
    const raw = (await loadMfaUser(p, u.id))!
    expect(String(raw.mfa_secret)).toMatch(/^v1\./)
    expect(String(raw.mfa_secret)).not.toContain(setup.secret)
    expect(JSON.stringify(raw.mfa_recovery)).not.toContain((out.ok && out.recoveryCodes?.[0]) || 'x')
    // Hidden from every API response, even an admin's.
    const viaRest = (await rest.get(`users/${u.id}`, admin.token)).body
    for (const k of ['mfa_secret', 'mfa_pending_secret', 'mfa_recovery', 'mfa_sessions', 'mfa_last_step']) expect(viaRest).not.toHaveProperty(k)
    expect(viaRest).toMatchObject({ mfa_enabled: true })
  })

  it('later sign-ins need a fresh code; a used code is refused (replay); a second session is separate', async () => {
    const u = await freshUser()
    const p = await payload()
    const secret = generateSecret()
    await enrolWithSecret(p, u.id, secret)
    const a = await signIn(u.email)
    const b = await signIn(u.email)
    const t0 = new Date()
    expect(await verifySecondFactor(p, a.pending.user, a.pending.sid, totpCode(secret, t0), t0)).toMatchObject({ ok: true })
    expect(await me(a.token)).toMatchObject({ id: u.id })
    expect(await me(b.token)).toBeNull()
    const reused = await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, b.pending.sid, totpCode(secret, t0), t0)
    expect(reused).toMatchObject({ ok: false, code: 'REPLAY' })
    const t1 = new Date(t0.getTime() + 30_000)
    expect(await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, b.pending.sid, totpCode(secret, t1), t1)).toMatchObject({ ok: true })
    expect(await me(b.token)).toMatchObject({ id: u.id })
  })

  it('a recovery code works exactly once', async () => {
    const u = await freshUser()
    const s1 = await signIn(u.email)
    const p = await payload()
    const setup = await beginEnrolment(p, s1.pending.user)
    if (!('secret' in setup)) throw new Error('expected a setup key')
    const out = await confirmEnrolment(p, (await loadMfaUser(p, u.id))!, s1.pending.sid, totpCode(setup.secret))
    const code = (out.ok && out.recoveryCodes?.[3]) || ''
    const s2 = await signIn(u.email)
    expect(await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, s2.pending.sid, code.toUpperCase())).toMatchObject({ ok: true, recoveryRemaining: 9 })
    const s3 = await signIn(u.email)
    expect(await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, s3.pending.sid, code)).toMatchObject({ ok: false, code: 'MISMATCH' })
  })

  it(`${MAX_FAILURES} wrong codes lock the second factor for 15 minutes; failures are audited without values`, async () => {
    const u = await freshUser()
    const p = await payload()
    const secret = generateSecret()
    await enrolWithSecret(p, u.id, secret)
    const s = await signIn(u.email)
    let last: Doc = {}
    for (let i = 0; i < MAX_FAILURES; i++) last = (await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, s.pending.sid, '000000')) as Doc
    expect(last).toMatchObject({ ok: false, code: 'LOCKED' })
    expect(await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, s.pending.sid, totpCode(secret))).toMatchObject({ ok: false, code: 'LOCKED' })
    const audit = (await p.find({ collection: 'audit-log', where: { and: [{ docId: { equals: u.id } }, { action: { like: 'mfa-' } }] }, ...sys, limit: 20 })).docs as unknown as Doc[]
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['mfa-failed', 'mfa-locked']))
    expect(JSON.stringify(audit)).not.toContain('000000')
    expect(audit.every((a) => a.actorEmail == null && a.ip == null)).toBe(true)
  })
})

describe('L2 reset and scripted sign-in', () => {
  it('an admin reset clears the enrolment (audited); a non-admin cannot reset or forge two-factor state', async () => {
    const u = await freshUser()
    const p = await payload()
    await enrolWithSecret(p, u.id, generateSecret())
    const s = await signIn(u.email)
    // Self-service tampering is ignored (field access), even with a valid session.
    await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, s.pending.sid, 'x'.repeat(6))
    await rest.patch(`users/${u.id}`, s.token, { mfa_reset: true, mfa_enabled: false, mfa_sessions: [] })
    expect((await loadMfaUser(p, u.id))!.mfa_enabled).toBe(true)
    await p.update({ collection: 'users', id: u.id, data: { mfa_reset: true } as never, user: admin.user as never, overrideAccess: false, depth: 0 })
    const after = (await loadMfaUser(p, u.id))!
    expect(after).toMatchObject({ mfa_enabled: false, mfa_secret: null, mfa_reset: false })
    const audit = await p.find({ collection: 'audit-log', where: { and: [{ docId: { equals: u.id } }, { action: { equals: 'mfa-reset' } }] }, ...sys })
    expect(audit.totalDocs).toBe(1)
    expect((audit.docs[0] as unknown as Doc).actor).toBe(admin.id)
  })

  it('POST /api/mfa/verify completes a scripted sign-in (rehearsal path) and never echoes the code', async () => {
    const u = await freshUser('editor')
    const p = await payload()
    const secret = generateSecret()
    await enrolWithSecret(p, u.id, secret)
    const s = await signIn(u.email)
    expect((await rest.post('mfa/verify', null, { code: totpCode(secret) })).status).toBe(401)
    const wrong = await rest.post('mfa/verify', s.token, { code: '000000' })
    expect(wrong.status).toBe(401)
    expect(JSON.stringify(wrong.body)).not.toContain('000000')
    const ok = await rest.post('mfa/verify', s.token, { code: totpCode(secret) })
    expect(ok).toMatchObject({ status: 200, body: { ok: true } })
    expect(await me(s.token)).toMatchObject({ id: u.id })
  })

  it('harness users (and so every other DB test) still sign in through the guard', async () => {
    expect(await me(admin.token)).toMatchObject({ email: userEmail('platform-admin') })
  })
})
