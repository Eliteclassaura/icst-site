import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { cookieOptions, DEVICE_COOKIE_PATH, DEVICE_TTL_MS, deviceLabel, isRememberedDevice, listDevices, packCookie, rememberDevice, revokeAllDevices, revokeDevice, revokeOtherDevices, unpackCookie } from '../../auth/mfa/devices'
import { CODE_TTL_MS, hashCode, issueEmailCode, purgeMfaRows, RESEND_COOLDOWN_MS, SEND_LIMIT, SEND_WINDOW_MS, verifyEmailCode } from '../../auth/mfa/email-code'
import { deliverSignInCode, renderSignInCode } from '../../auth/mfa/email-code-mail'
import { pendingSession } from '../../auth/mfa/guard'
import { clearMfa, confirmStepUp, enrolWithSecret, isSessionVerified, loadMfaUser, stepUpSecondsLeft, verifySecondFactorByEmail, verifySessionByDevice } from '../../auth/mfa/service'
import { generateSecret } from '../../auth/mfa/totp'
import { makeSendEmail } from '../../email/adapter'
import { kindAllowed, readEmailConfig } from '../../email/config'
import type { MailMessage, MailTransport } from '../../email/transport'
import { PASSWORD, payload, user } from './harness'

/**
 * MFA-2 against the isolated synthetic database. Email codes and remembered devices are for every NON-admin role
 * (sales, editor, search-analyst, viewer); admins stay on the authenticator app. No mail is sent here: codes come back
 * from `issueEmailCode`, and delivery is checked with a spy on Payload's sendEmail.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
let seq = 0

async function makeUser(roles: string[], enrol = true) {
  const p = await payload()
  const email = `mfa2.${Date.now()}.${++seq}@example.test`
  const created = (await p.create({ collection: 'users', data: { email, password: PASSWORD, roles, name: `Synthetic MFA-2 ${seq}` } as never, ...sys })) as unknown as Doc
  const id = String(created.id)
  const secret = generateSecret()
  if (enrol) await enrolWithSecret(p, id, secret)
  const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
  const pending = (await pendingSession(p, new Headers({ authorization: `JWT ${String(login.token)}` })))!
  return { p, id, email, secret, sid: pending.sid }
}
type M = Awaited<ReturnType<typeof makeUser>>
const fresh = async (p: Payload, id: string) => (await loadMfaUser(p, id))!
const exec = async (p: Payload, q: unknown) => (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle.execute(q)
const T0 = new Date('2026-10-08T12:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms)
const issue = async (u: M, now?: Date, sid = u.sid) => issueEmailCode(u.p, await fresh(u.p, u.id), { sid, now })
const verify = async (u: M, code: string, now?: Date, sid = u.sid) => verifyEmailCode(u.p, await fresh(u.p, u.id), code, { sid, now })
const must = async (u: M, now?: Date) => {
  const r = await issue(u, now)
  if (!r.ok) throw new Error(`send refused: ${r.reason}`)
  return r
}
const failures = async (u: M) => Number((await exec(u.p, sql`SELECT COALESCE(mfa_failures,0) AS f FROM users WHERE id = ${u.id}`)).rows[0]!.f)
const count = async (u: M, table: 'mfa_email_codes' | 'mfa_trusted_devices') => Number((await exec(u.p, sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = '${u.id}'`))).rows[0]!.n)

describe('MFA-2 email code', () => {
  it('signs a non-admin in once, and the session is then verified', async () => {
    const u = await makeUser(['sales'])
    const sent = await must(u)
    expect(sent.code).toMatch(/^\d{6}$/)
    expect(await verifySecondFactorByEmail(u.p, await fresh(u.p, u.id), u.sid, sent.code)).toMatchObject({ ok: true })
    expect(isSessionVerified(await fresh(u.p, u.id), u.sid)).toBe(true)
  })

  it('is open to EVERY non-admin role, and only those', async () => {
    for (const role of ['sales', 'editor', 'search-analyst', 'viewer']) {
      const u = await makeUser([role])
      expect(await issue(u), role).toMatchObject({ ok: true })
    }
    for (const roles of [['platform-admin'], ['client-admin'], ['editor', 'client-admin']]) {
      const u = await makeUser(roles)
      expect(await issue(u), roles.join()).toMatchObject({ ok: false, reason: 'INELIGIBLE' })
    }
  })

  it('stores only a hash, bound to the login attempt, never the code', async () => {
    const u = await makeUser(['sales'])
    const sent = await must(u)
    const rows = (await exec(u.p, sql`SELECT code_hash, sid, purpose FROM mfa_email_codes WHERE user_id = ${u.id}`)).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code_hash: hashCode(u.id, u.sid, 'signin', sent.code), sid: u.sid, purpose: 'signin' })
    expect(JSON.stringify(rows)).not.toContain(sent.code)
  })

  it('works once: the same code is refused the second time; two parallel tries → exactly one succeeds', async () => {
    const u = await makeUser(['sales'])
    const sent = await must(u)
    expect(await verify(u, sent.code)).toMatchObject({ ok: true })
    expect(await verify(u, sent.code)).toMatchObject({ ok: false, reason: 'MISMATCH' })
    const v = await makeUser(['sales'])
    const s2 = await must(v)
    const user = await fresh(v.p, v.id)
    const r = await Promise.all([verifyEmailCode(v.p, user, s2.code, { sid: v.sid }), verifyEmailCode(v.p, user, s2.code, { sid: v.sid })])
    expect(r.filter((x) => x.ok)).toHaveLength(1)
  })

  it('expires after 10 minutes (and is fine just before)', async () => {
    const u = await makeUser(['sales'])
    const sent = await must(u, T0)
    expect(sent.expiresAt.getTime() - T0.getTime()).toBe(CODE_TTL_MS)
    expect(await verify(u, sent.code, at(CODE_TTL_MS + 1000))).toMatchObject({ ok: false, reason: 'MISMATCH' })
    const sent2 = await must(u, at(20 * 60_000))
    expect(await verify(u, sent2.code, at(20 * 60_000 + CODE_TTL_MS - 1000))).toMatchObject({ ok: true })
  })

  it('is bound to the login attempt: the code only works in the session it was sent to (and counts as a miss elsewhere)', async () => {
    const u = await makeUser(['sales'])
    const sent = await must(u)
    expect(await verify(u, sent.code, undefined, 'another-login-attempt')).toMatchObject({ ok: false, reason: 'MISMATCH' })
    expect(await failures(u)).toBe(1)
    expect(await verify(u, sent.code)).toMatchObject({ ok: true })
    // The digest is bound too: a row copied to another session id does not match.
    const w = await makeUser(['sales'])
    const s2 = await must(w)
    await exec(w.p, sql`UPDATE mfa_email_codes SET sid = 'moved' WHERE user_id = ${w.id}`)
    expect(await verify(w, s2.code, undefined, 'moved')).toMatchObject({ ok: false })
  })

  it('a resend retires the older code and leaves the failure count alone', async () => {
    const u = await makeUser(['sales'])
    const a = await must(u, T0)
    await verify(u, a.code === '000000' ? '111111' : '000000', at(1000))
    await verify(u, a.code === '000000' ? '111111' : '000000', at(2000))
    expect(await failures(u)).toBe(2)
    const b = await must(u, at(RESEND_COOLDOWN_MS + 5000))
    expect(await failures(u)).toBe(2)
    expect(await verify(u, a.code, at(RESEND_COOLDOWN_MS + 6000))).toMatchObject({ ok: false })
    expect(await failures(u)).toBe(3)
    expect(await verify(u, b.code, at(RESEND_COOLDOWN_MS + 7000))).toMatchObject({ ok: true })
    expect(await failures(u)).toBe(0) // reset only because the claim succeeded
  })

  it('the failure reset is part of the claim: a refused code or a locked user never resets', async () => {
    const u = await makeUser(['sales'])
    const sent = await must(u)
    await exec(u.p, sql`UPDATE users SET mfa_failures = 3 WHERE id = ${u.id}`)
    expect(await verify(u, sent.code, undefined, 'wrong-session')).toMatchObject({ ok: false })
    expect(await failures(u)).toBe(4)
    await exec(u.p, sql`UPDATE users SET mfa_failures = 0, mfa_locked_until = now() + interval '10 minutes' WHERE id = ${u.id}`)
    expect(await verify(u, sent.code)).toMatchObject({ ok: false, reason: 'LOCKED' })
    expect((await exec(u.p, sql`SELECT mfa_locked_until FROM users WHERE id = ${u.id}`)).rows[0]!.mfa_locked_until).toBeTruthy()
    expect((await exec(u.p, sql`SELECT used_at FROM mfa_email_codes WHERE user_id = ${u.id}`)).rows[0]!.used_at).toBeNull()
  })

  it('locks after 5 wrong codes for 15 minutes; even the right code is then refused; parallel wrong guesses all count', async () => {
    const u = await makeUser(['sales'])
    const sent = await must(u)
    const wrong = sent.code === '000000' ? '111111' : '000000'
    const out: Doc[] = []
    for (let i = 0; i < 5; i++) out.push((await verify(u, wrong)) as Doc)
    expect(out.map((o) => o.attemptsLeft ?? null)).toEqual([4, 3, 2, 1, null])
    expect(out[4]).toMatchObject({ ok: false, reason: 'LOCKED', retryAfterSeconds: 900 })
    expect(await verify(u, sent.code)).toMatchObject({ ok: false, reason: 'LOCKED' })
    expect(await verifySecondFactorByEmail(u.p, await fresh(u.p, u.id), u.sid, sent.code)).toMatchObject({ ok: false, code: 'LOCKED' })
    expect(await issue(u, at(60_000 * 5))).toMatchObject({ ok: false, reason: 'LOCKED' })
    const v = await makeUser(['sales'])
    const s2 = await must(v)
    const user = await fresh(v.p, v.id)
    await Promise.all(Array.from({ length: 5 }, () => verifyEmailCode(v.p, user, s2.code === '000000' ? '111111' : '000000', { sid: v.sid })))
    expect((await fresh(v.p, v.id)).mfa_locked_until).toBeTruthy()
  })

  it('sends at most 3 per 15 minutes, one per 30 seconds, even in parallel; resets afterwards', async () => {
    const u = await makeUser(['sales'])
    const user = await fresh(u.p, u.id)
    const burst = await Promise.all(Array.from({ length: 6 }, () => issueEmailCode(u.p, user, { sid: u.sid, now: T0 })))
    expect(burst.filter((r) => r.ok)).toHaveLength(1) // the cooldown lets one through
    expect(burst.filter((r) => !r.ok && r.reason === 'COOLDOWN')).toHaveLength(5)
    const early = await issue(u, at(10_000))
    expect(early).toMatchObject({ ok: false, reason: 'COOLDOWN', retryAfterSeconds: 20 })
    expect(await issue(u, at(RESEND_COOLDOWN_MS + 1000))).toMatchObject({ ok: true })
    expect(await issue(u, at(2 * RESEND_COOLDOWN_MS + 2000))).toMatchObject({ ok: true })
    expect(SEND_LIMIT).toBe(3)
    expect(await issue(u, at(3 * RESEND_COOLDOWN_MS + 3000))).toMatchObject({ ok: false, reason: 'RATE_LIMITED' })
    expect(await issue(u, at(SEND_WINDOW_MS + 1000))).toMatchObject({ ok: true })
  })

  it('issuing is one statement: a refused send changes nothing (the earlier code still works)', async () => {
    const u = await makeUser(['sales'])
    const a = await must(u, T0)
    expect(await issue(u, at(5000))).toMatchObject({ ok: false, reason: 'COOLDOWN' })
    expect(await count(u, 'mfa_email_codes')).toBe(1)
    expect(await verify(u, a.code, at(6000))).toMatchObject({ ok: true })
  })

  it('needs two-factor to be set up first', async () => {
    const u = await makeUser(['sales'], false)
    expect(await verifySecondFactorByEmail(u.p, await fresh(u.p, u.id), u.sid, '123456')).toMatchObject({ ok: false, code: 'NOT_ENROLLED' })
  })

  it('the message has the code, no link, no phone number, no postal address', () => {
    const m = renderSignInCode('123456')
    const all = `${m.subject}\n${m.text}\n${m.html}`
    expect(m.subject).not.toMatch(/\d/)
    expect(m.text).toContain('123456')
    expect(all).not.toMatch(/https?:|www\./i)
    expect(all).not.toMatch(/\+?\d[\d\s().-]{8,}\d/)
    expect(all).not.toMatch(/\b(street|st\.|avenue|road|suite|po box|bangkok|thailand|japan)\b/i)
  })

  it('goes out with NO Reply-To, so a reply quoting a live code never lands in the sales mailbox', async () => {
    const p = await payload()
    const spy = vi.spyOn(p, 'sendEmail').mockResolvedValue(undefined as never)
    try {
      await deliverSignInCode(p, 'someone@example.test', '123456')
      const sent = spy.mock.calls[0]![0] as Doc
      expect(sent.to).toBe('someone@example.test')
      expect('replyTo' in sent).toBe(false)
      expect(JSON.stringify(sent)).not.toMatch(/reply/i)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('MFA-2.1: the sign-in code sends under the default (launch) configuration', () => {
  const live = { H2O_EMAIL_MODE: 'live', H2O_EMAIL_FROM: 'ICS Sales Team <sales@example.test>', H2O_SMTP_HOST: 'mail.example.test', H2O_SMTP_PORT: '587', H2O_SMTP_USER: 'u', H2O_SMTP_PASS: 'p', H2O_SMTP_TLS_SERVERNAME: 'mail.example.test' }
  it('MFA_CODE is in the launch kind set, and a code goes out through the real adapter with the default allowed kinds', async () => {
    const env = { ...live } as Record<string, string | undefined> // no H2O_EMAIL_ALLOWED_KINDS: the launch set applies
    const cfg = readEmailConfig(env)
    expect(cfg.errors).toEqual([])
    expect(kindAllowed('MFA_CODE', cfg)).toBe(true)
    const sent: MailMessage[] = []
    const transport: MailTransport = { send: async (m) => (sent.push(m), { messageId: null, accepted: 1 }), close: () => undefined }
    const p = await payload()
    const send = makeSendEmail(p, cfg, transport)
    const m = renderSignInCode('123456')
    const out = await send({ to: 'someone@example.test', subject: m.subject, text: m.text, html: m.html })
    expect(out).toMatchObject({ sent: 1, suppressed: 0 })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe('someone@example.test')
    expect(sent[0]!.text).toContain('123456')
    expect(sent[0]!.replyTo ?? null).toBeNull()
  })
  it('CRM-B-4C-FIX: a sign-in code sent the way the app sends it goes through the REAL adapter with a recording transport, H2O_EMAIL_ALLOWED_KINDS unset → exactly one message', async () => {
    const was = process.env.H2O_EMAIL_ALLOWED_KINDS
    delete process.env.H2O_EMAIL_ALLOWED_KINDS
    const cfg = readEmailConfig({ ...live } as Record<string, string | undefined>)
    const sent: MailMessage[] = []
    const transport: MailTransport = { send: async (m) => (sent.push(m), { messageId: null, accepted: 1 }), close: () => undefined }
    const p = await payload()
    const adapterSend = makeSendEmail(p, cfg, transport)
    const spy = vi.spyOn(p, 'sendEmail').mockImplementation(adapterSend as never) // payload.sendEmail IS the adapter in the app
    try {
      await deliverSignInCode(p, 'someone@example.test', '654321')
    } finally {
      spy.mockRestore()
      if (was !== undefined) process.env.H2O_EMAIL_ALLOWED_KINDS = was
    }
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe('someone@example.test')
    expect(sent[0]!.text).toContain('654321')
    expect(sent[0]!.subject).toBe('Your sign-in code')
    expect(sent[0]!.replyTo ?? null).toBeNull()
  })
  it('an operator list that leaves MFA_CODE out turns it off in kindAllowed (the explicit list wins)', () => {
    expect(kindAllowed('MFA_CODE', readEmailConfig({ ...live, H2O_EMAIL_ALLOWED_KINDS: 'RFQ_SALES_ALERT' }))).toBe(false)
  })
})

describe('MFA-2 admins stay on the authenticator app', () => {
  for (const roles of [['platform-admin'], ['client-admin'], ['sales', 'client-admin'], ['viewer', 'platform-admin']]) {
    it(`refuses ${roles.join(' + ')}: no code, no device, even with a code planted in the table`, async () => {
      const u = await makeUser(roles)
      const user = await fresh(u.p, u.id)
      expect(await issue(u)).toMatchObject({ ok: false, reason: 'INELIGIBLE' })
      await exec(u.p, sql`INSERT INTO mfa_email_codes (user_id, sid, purpose, code_hash, expires_at) VALUES (${u.id}, ${u.sid}, 'signin', ${hashCode(u.id, u.sid, 'signin', '424242')}, now() + interval '5 minutes')`)
      expect(await verify(u, '424242')).toMatchObject({ ok: false, reason: 'INELIGIBLE' })
      expect(await verifySecondFactorByEmail(u.p, user, u.sid, '424242')).toMatchObject({ ok: false })
      expect(isSessionVerified(await fresh(u.p, u.id), u.sid)).toBe(false)
      expect(await rememberDevice(u.p, user)).toBeNull()
      expect(await count(u, 'mfa_trusted_devices')).toBe(0)
    })
  }

  it('a user cannot opt in by writing a field: unknown fields are dropped and the role check still refuses', async () => {
    const u = await makeUser(['client-admin'])
    await u.p.update({ collection: 'users', id: u.id, data: { mfa_email_enabled: true, mfa_remember: true } as never, ...sys }).catch(() => undefined)
    expect(await issue(u)).toMatchObject({ ok: false, reason: 'INELIGIBLE' })
  })

  it('a device remembered before a promotion to admin stops working and is revoked', async () => {
    const u = await makeUser(['sales'])
    const cookie = (await rememberDevice(u.p, await fresh(u.p, u.id)))!
    expect(await isRememberedDevice(u.p, await fresh(u.p, u.id), cookie)).toBe(true)
    await u.p.update({ collection: 'users', id: u.id, data: { roles: ['sales', 'client-admin'] } as never, ...sys })
    expect(await isRememberedDevice(u.p, await fresh(u.p, u.id), cookie)).toBe(false)
    expect((await exec(u.p, sql`SELECT count(*)::int AS n FROM mfa_trusted_devices WHERE user_id = ${u.id} AND revoked_at IS NULL`)).rows[0]!.n).toBe(0)
  })
})

describe('MFA-2 remembered devices', () => {
  it('remembers a non-admin for 30 days, bound to the user; a copied cookie does not work for anyone else', async () => {
    const a = await makeUser(['sales'])
    const b = await makeUser(['viewer'])
    const cookie = (await rememberDevice(a.p, await fresh(a.p, a.id), { now: T0 }))!
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), cookie, at(60_000))).toBe(true)
    expect(await isRememberedDevice(b.p, await fresh(b.p, b.id), cookie, at(60_000))).toBe(false)
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), cookie, at(DEVICE_TTL_MS + 1000))).toBe(false)
  })

  it('the cookie is httpOnly, Secure, SameSite=Lax and scoped to the two-factor pages only', () => {
    const o = cookieOptions(T0)
    expect(o).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/crm/mfa' })
    expect(DEVICE_COOKIE_PATH).toBe('/crm/mfa')
    expect(o.expires.getTime() - T0.getTime()).toBe(DEVICE_TTL_MS)
  })

  it('refuses a tampered or forged cookie', async () => {
    const a = await makeUser(['sales'])
    const cookie = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    const c = unpackCookie(cookie)!
    expect(unpackCookie(`${cookie}x`)).toBeNull()
    expect(unpackCookie(cookie.replace(c.token, `${c.token}A`))).toBeNull()
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), packCookie(a.id, c.deviceId, 'not-the-token'))).toBe(false)
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), undefined)).toBe(false)
  })

  it('the server stores only a digest of the token, and a plain label of the device', async () => {
    const a = await makeUser(['sales'])
    const c = unpackCookie((await rememberDevice(a.p, await fresh(a.p, a.id), { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' }))!)!
    const rows = (await exec(a.p, sql`SELECT token_hash, label FROM mfa_trusted_devices WHERE user_id = ${a.id}`)).rows
    expect(JSON.stringify(rows)).not.toContain(c.token)
    expect(rows[0]!.label).toBe('Chrome on Mac')
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')).toBe('Safari on iPhone or iPad')
    expect(deviceLabel(undefined)).toBe('Browser on an unknown device')
  })

  it('a remembered device verifies the sign-in session', async () => {
    const a = await makeUser(['sales'])
    const cookie = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), cookie)).toBe(true)
    await verifySessionByDevice(a.p, await fresh(a.p, a.id), a.sid)
    expect(isSessionVerified(await fresh(a.p, a.id), a.sid)).toBe(true)
  })

  it('lists devices with the current one marked; one can be forgotten, never another user’s', async () => {
    const a = await makeUser(['sales'])
    const b = await makeUser(['sales'])
    const one = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    const two = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    const other = unpackCookie((await rememberDevice(b.p, await fresh(b.p, b.id)))!)!
    const list = await listDevices(a.p, a.id, one)
    expect(list).toHaveLength(2)
    expect(list.filter((d) => d.current).map((d) => d.id)).toEqual([unpackCookie(one)!.deviceId])
    expect(await revokeDevice(a.p, a.id, other.deviceId)).toBe(false) // not a's device
    expect(await isRememberedDevice(b.p, await fresh(b.p, b.id), packCookie(b.id, other.deviceId, other.token))).toBe(true)
    expect(await revokeDevice(a.p, a.id, unpackCookie(two)!.deviceId)).toBe(true)
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), two)).toBe(false)
    expect(await listDevices(a.p, a.id, one)).toHaveLength(1)
    expect(await revokeDevice(a.p, a.id, 'not-a-uuid')).toBe(false)
  })

  it('an admin can clear a user’s devices, and the user can sign out the others', async () => {
    const a = await makeUser(['sales'])
    const keep = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    const other = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    expect(await revokeOtherDevices(a.p, a.id, keep)).toBe(1)
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), keep)).toBe(true)
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), other)).toBe(false)
    const admin = await user('platform-admin')
    await a.p.update({ collection: 'users', id: a.id, data: { mfa_devices_clear: true } as never, overrideAccess: false, user: { ...admin.user, collection: 'users' } as never, depth: 0 })
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), keep)).toBe(false)
  })

  it('a non-admin cannot use the admin "clear devices" tick on someone else', async () => {
    const a = await makeUser(['sales'])
    const s = await user('sales')
    await rememberDevice(a.p, await fresh(a.p, a.id))
    await a.p.update({ collection: 'users', id: a.id, data: { mfa_devices_clear: true } as never, overrideAccess: false, user: { ...s.user, collection: 'users' } as never, depth: 0 }).catch(() => undefined)
    expect((await exec(a.p, sql`SELECT count(*)::int AS n FROM mfa_trusted_devices WHERE user_id = ${a.id} AND revoked_at IS NULL`)).rows[0]!.n).toBe(1)
  })

  it('a password change, Payload’s own password reset and an admin two-factor reset each revoke every device', async () => {
    const a = await makeUser(['sales'])
    const c1 = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    await a.p.update({ collection: 'users', id: a.id, data: { password: 'another-Synthetic-Password-2!' } as never, ...sys })
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), c1)).toBe(false)
    const c2 = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    await exec(a.p, sql`UPDATE users SET reset_password_token = 'mfa2-synthetic-token', reset_password_expiration = now() + interval '1 hour' WHERE id = ${a.id}`)
    const keys = ['H2O_EMAIL_MODE', 'H2O_EMAIL_FROM', 'H2O_EMAIL_ALLOWLIST'] as const
    const was = keys.map((k) => process.env[k])
    process.env.H2O_EMAIL_MODE = 'allowlist'
    process.env.H2O_EMAIL_FROM = 'Synthetic <nobody@example.test>'
    process.env.H2O_EMAIL_ALLOWLIST = 'nobody@example.test'
    try {
      await a.p.resetPassword({ collection: 'users', data: { token: 'mfa2-synthetic-token', password: 'yet-another-Synthetic-3!' }, overrideAccess: true })
    } finally {
      keys.forEach((k, i) => (was[i] === undefined ? delete process.env[k] : (process.env[k] = was[i])))
    }
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), c2)).toBe(false)
    const c3 = (await rememberDevice(a.p, await fresh(a.p, a.id)))!
    await clearMfa(a.p, a.id, 'admin', null)
    expect(await isRememberedDevice(a.p, await fresh(a.p, a.id), c3)).toBe(false)
    expect(await revokeAllDevices(a.p, a.id)).toBe(0)
  })
})

describe('MFA-2 housekeeping', () => {
  it('purges old expired/used codes, long-expired and long-revoked devices, and rows of users that no longer exist', async () => {
    const u = await makeUser(['sales'])
    await exec(u.p, sql`INSERT INTO mfa_email_codes (user_id, sid, purpose, code_hash, expires_at) VALUES (${u.id}, 's', 'signin', 'old', now() - interval '3 days'), (${u.id}, 's', 'signin', 'live', now() + interval '5 minutes'), ('00000000-0000-0000-0000-00000000dead', 's', 'signin', 'orphan', now() + interval '5 minutes')`)
    await exec(u.p, sql`INSERT INTO mfa_trusted_devices (id, user_id, token_hash, expires_at, revoked_at) VALUES (gen_random_uuid(), ${u.id}, 'a', now() + interval '10 days', now() - interval '40 days'), (gen_random_uuid(), ${u.id}, 'b', now() - interval '20 days', NULL), (gen_random_uuid(), ${u.id}, 'c', now() + interval '10 days', NULL), (gen_random_uuid(), '00000000-0000-0000-0000-00000000dead', 'd', now() + interval '10 days', NULL)`)
    const out = await purgeMfaRows(u.p)
    expect(out).toEqual({ codes: 2, devices: 3 })
    expect(await count(u, 'mfa_email_codes')).toBe(1)
    expect(await count(u, 'mfa_trusted_devices')).toBe(1)
  })

  it('deleting a user deletes their codes and devices', async () => {
    const u = await makeUser(['sales'])
    await must(u)
    await rememberDevice(u.p, await fresh(u.p, u.id))
    expect(await count(u, 'mfa_email_codes')).toBe(1)
    await u.p.delete({ collection: 'users', id: u.id, ...sys })
    expect(await count(u, 'mfa_email_codes')).toBe(0)
    expect(await count(u, 'mfa_trusted_devices')).toBe(0)
  })
})

describe('MFA-2 step-up never accepts these', () => {
  it('an email code is not a step-up code', async () => {
    const u = await makeUser(['sales'])
    const sent = await must(u, T0)
    await verifySecondFactorByEmail(u.p, await fresh(u.p, u.id), u.sid, sent.code)
    const again = await must(u, at(RESEND_COOLDOWN_MS + 1000))
    expect(await confirmStepUp(u.p, await fresh(u.p, u.id), u.sid, again.code)).toMatchObject({ ok: false })
    expect(stepUpSecondsLeft(await fresh(u.p, u.id), u.sid)).toBe(0)
  })

  it('a session verified by a remembered device has no step-up', async () => {
    const u = await makeUser(['sales'])
    await verifySessionByDevice(u.p, await fresh(u.p, u.id), u.sid)
    expect(isSessionVerified(await fresh(u.p, u.id), u.sid)).toBe(true)
    expect(stepUpSecondsLeft(await fresh(u.p, u.id), u.sid)).toBe(0)
  })
})
