import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, hashRecoveryCode, mfaCookieValid, mfaCookieValue, MFA_COOKIE } from '../keys'
import { safeNext } from '../next'
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateSecret,
  hotp,
  normaliseRecoveryCode,
  otpauthUri,
  stepAt,
  totpCode,
  verifyTotp,
} from '../totp'

/** Patch L2 two-factor — pure logic. Enforcement end to end: src/crm/__dbtests__/mfa.dbtest.ts. */
beforeAll(() => {
  process.env.PAYLOAD_SECRET ??= 'unit-test-only-synthetic-secret-0000000000'
})

describe('TOTP (RFC 6238 / RFC 4226)', () => {
  // RFC 4226 Appendix D and RFC 6238 Appendix B (SHA-1 seed "12345678901234567890"), last 6 digits.
  const seed = Buffer.from('12345678901234567890')
  it('matches the published HOTP and TOTP test vectors', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => hotp(seed, c))).toEqual([
      '755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489',
    ])
    const b32 = base32Encode(seed)
    expect(totpCode(b32, new Date(59_000))).toBe('287082')
    expect(totpCode(b32, new Date(1_111_111_109_000))).toBe('081804')
    expect(totpCode(b32, new Date(1_234_567_890_000))).toBe('005924')
    expect(totpCode(b32, new Date(2_000_000_000_000))).toBe('279037')
  })
  it('base32 round-trips; secrets are 160-bit; junk is refused', () => {
    const s = generateSecret()
    expect(s).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Encode(base32Decode(s)!)).toBe(s)
    expect(base32Decode('not base32!')).toBeNull()
  })
  it('accepts ±1 step of drift, refuses a replay and anything that is not 6 digits', () => {
    const s = generateSecret()
    const at = new Date('2026-10-05T12:00:10Z')
    const now = stepAt(at)
    expect(verifyTotp(s, totpCode(s, at), at, null)).toEqual({ ok: true, step: now })
    expect(verifyTotp(s, totpCode(s, new Date(at.getTime() - 30_000)), at, null)).toEqual({ ok: true, step: now - 1 })
    expect(verifyTotp(s, totpCode(s, new Date(at.getTime() + 30_000)), at, null)).toEqual({ ok: true, step: now + 1 })
    expect(verifyTotp(s, totpCode(s, new Date(at.getTime() - 90_000)), at, null)).toMatchObject({ ok: false, reason: 'MISMATCH' })
    expect(verifyTotp(s, totpCode(s, at), at, now)).toMatchObject({ ok: false, reason: 'REPLAY' })
    expect(verifyTotp(s, '12345', at, null)).toMatchObject({ ok: false, reason: 'FORMAT' })
    expect(verifyTotp(s, 'abcdef', at, null)).toMatchObject({ ok: false, reason: 'FORMAT' })
  })
  it('otpauth URI carries the standard parameters', () => {
    expect(otpauthUri('ABCDEFGHIJKLMNOP', 'pat@example.test')).toBe(
      'otpauth://totp/ICS%20CRM%3Apat%40example.test?secret=ABCDEFGHIJKLMNOP&issuer=ICS%20CRM&algorithm=SHA1&digits=6&period=30',
    )
  })
  it('recovery codes: 10 distinct "xxxxx-xxxxx"; input is normalised; hashes never equal the code', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/)
    expect(normaliseRecoveryCode(' ABCDE FGHIJ ')).toBe('abcde-fghij')
    expect(normaliseRecoveryCode('123456')).toBeNull()
    expect(hashRecoveryCode(codes[0]!)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashRecoveryCode(codes[0]!)).not.toContain(codes[0]!.replace('-', ''))
  })
})

describe('key handling', () => {
  it('secrets are sealed with AES-256-GCM: round-trip, fresh IV each time, tampering refused', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP')
    const b = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(a).not.toBe(b)
    expect(a).not.toContain('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(a)).toBe('JBSWY3DPEHPK3PXP')
    const parts = a.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(decryptSecret(parts.join('.'))).toBeNull()
    expect(decryptSecret('v0.x.y.z')).toBeNull()
    expect(decryptSecret(null)).toBeNull()
  })
  it('the routing cookie is bound to one session id', () => {
    const v = mfaCookieValue('sid-0001-aaaa')
    expect(mfaCookieValid(v, 'sid-0001-aaaa')).toBe(true)
    expect(mfaCookieValid(v, 'sid-0002-bbbb')).toBe(false)
    expect(mfaCookieValid(undefined, 'sid-0001-aaaa')).toBe(false)
    expect(mfaCookieValid(`${v}x`, 'sid-0001-aaaa')).toBe(false)
  })
  it('after two-factor, only admin or CRM paths are followed', () => {
    expect(safeNext('/crm/rfqs/')).toBe('/crm/rfqs/')
    expect(safeNext('/admin/collections/users/')).toBe('/admin/collections/users/')
    for (const bad of ['https://evil.example', '//evil.example', '/crm/../admin', '/crm/mfa/', '/site/', 42, null]) expect(safeNext(bad)).toBe('/crm/')
  })
})

describe('proxy routing (UX only; enforcement is the server guard)', () => {
  const token = (sid: string) => `x.${Buffer.from(JSON.stringify({ sid })).toString('base64url')}.y`
  const req = (path: string, cookies: Record<string, string>) =>
    new NextRequest(new URL(path, 'http://localhost:3210'), { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } })
  it('sends a password-only session from the admin and the CRM to /crm/mfa/, keeping where it was going', async () => {
    const { mfaRoute } = await import('../../../proxy')
    const sid = '0f3a6e1c-1d2b-4c5d-8e9f-0a1b2c3d4e5f'
    const r = mfaRoute(req('/crm/rfqs/', { 'payload-token': token(sid) }))
    expect(r?.status).toBe(303)
    expect(r?.headers.get('location')).toBe('http://localhost:3210/crm/mfa/?next=%2Fcrm%2Frfqs%2F')
    expect(mfaRoute(req('/admin/', { 'payload-token': token(sid) }))?.headers.get('location')).toContain('/crm/mfa/?next=%2Fadmin%2F')
    // Verified session, signed-out visitor, the login page and the two-factor page itself pass through.
    expect(mfaRoute(req('/crm/rfqs/', { 'payload-token': token(sid), [MFA_COOKIE]: mfaCookieValue(sid) }))).toBeNull()
    expect(mfaRoute(req('/crm/rfqs/', {}))).toBeNull()
    expect(mfaRoute(req('/admin/login/', { 'payload-token': token(sid) }))).toBeNull()
    expect(mfaRoute(req('/crm/mfa/', { 'payload-token': token(sid) }))).toBeNull()
    expect(mfaRoute(req('/cooling-tower/', { 'payload-token': token(sid) }))).toBeNull()
    // A cookie minted for another session does not count.
    expect(mfaRoute(req('/crm/', { 'payload-token': token(sid), [MFA_COOKIE]: mfaCookieValue('0f3a6e1c-0000-0000-0000-000000000000') }))?.status).toBe(303)
  })
})
