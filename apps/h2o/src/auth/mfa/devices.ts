import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { emailCodeEligible } from './eligibility'
import { mfaKey } from './keys'

/**
 * MFA-2: "remember this device". A signed cookie bound to the user id, plus a server-side record (token stored hashed).
 * Admins never get one, and verifying re-checks eligibility, so a device remembered before a promotion stops working.
 * A remembered device is NEVER accepted as step-up (see service.ts confirmStepUp: it takes only a fresh code).
 */
export const DEVICE_COOKIE = 'h2o_crm_device'
export const DEVICE_COOKIE_PATH = '/crm/mfa'
export const DEVICE_TTL_MS = 30 * 24 * 3600_000

type Exec = { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const sign = (body: string) => createHmac('sha256', mfaKey('device')).update(body).digest('base64url')

export function cookieOptions(now = new Date()) {
  // Scoped to the two-factor pages (/crm/mfa and below): public pages and the rest of the CRM never receive it.
  return { httpOnly: true, secure: true, sameSite: 'lax' as const, path: DEVICE_COOKIE_PATH, expires: new Date(now.getTime() + DEVICE_TTL_MS) }
}

/** `<userId>.<deviceId>.<token>.<sig>`: the signature covers the first three parts. */
export function packCookie(userId: string, deviceId: string, token: string): string {
  const body = `${userId}.${deviceId}.${token}`
  return `${body}.${sign(body)}`
}

export function unpackCookie(v: string | undefined | null): { userId: string; deviceId: string; token: string } | null {
  if (!v) return null
  const p = v.split('.')
  if (p.length !== 4) return null
  const [userId, deviceId, token, sig] = p as [string, string, string, string]
  const want = Buffer.from(sign(`${userId}.${deviceId}.${token}`))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  return { userId, deviceId, token }
}

/** A short, plain name for a device from its User-Agent ("Chrome on Mac"); never the raw header, never an address. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = typeof userAgent === 'string' ? userAgent.slice(0, 400) : ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux|X11/.test(ua) ? 'Linux' : 'an unknown device'
  return `${browser} on ${os}`
}

export async function rememberDevice(payload: Payload, u: { id: string | number; role?: unknown; roles?: unknown }, opts: { now?: Date; userAgent?: string | null } = {}): Promise<string | null> {
  if (!emailCodeEligible(u)) return null
  const now = opts.now ?? new Date()
  const userId = String(u.id)
  const deviceId = randomUUID()
  const token = randomBytes(32).toString('base64url')
  await db(payload).execute(
    sql`INSERT INTO mfa_trusted_devices (id, user_id, label, token_hash, created_at, last_used_at, expires_at) VALUES (${deviceId}::uuid, ${userId}, ${deviceLabel(opts.userAgent)}, ${sha(token)}, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, ${new Date(now.getTime() + DEVICE_TTL_MS).toISOString()}::timestamptz)`,
  )
  return packCookie(userId, deviceId, token)
}

/** True when the cookie is genuine, belongs to this user, is unrevoked and unexpired, and the user is still eligible. */
export async function isRememberedDevice(payload: Payload, u: { id: string | number; role?: unknown; roles?: unknown }, cookie: string | undefined | null, now = new Date()): Promise<boolean> {
  if (!emailCodeEligible(u)) return false
  const c = unpackCookie(cookie)
  if (!c || c.userId !== String(u.id) || !/^[0-9a-f-]{36}$/.test(c.deviceId)) return false
  const r = await db(payload).execute(sql`
    UPDATE mfa_trusted_devices SET last_used_at = ${now.toISOString()}::timestamptz
     WHERE id = ${c.deviceId}::uuid AND user_id = ${c.userId} AND token_hash = ${sha(c.token)} AND revoked_at IS NULL AND expires_at > ${now.toISOString()}::timestamptz
 RETURNING id`)
  return r.rows.length === 1
}

/** Revoke every device of a user (password change, admin reset, promotion to an admin role, admin "clear devices"). */
export async function revokeAllDevices(payload: Payload, userId: string | number, now = new Date()): Promise<number> {
  const r = await db(payload).execute(sql`UPDATE mfa_trusted_devices SET revoked_at = ${now.toISOString()}::timestamptz WHERE user_id = ${String(userId)} AND revoked_at IS NULL RETURNING id`)
  return r.rows.length
}

/** "Sign out other devices": revoke all but the one presented. */
export async function revokeOtherDevices(payload: Payload, userId: string | number, currentCookie: string | undefined | null, now = new Date()): Promise<number> {
  const c = unpackCookie(currentCookie)
  const keep = c && c.userId === String(userId) && /^[0-9a-f-]{36}$/.test(c.deviceId) ? c.deviceId : '00000000-0000-0000-0000-000000000000'
  const r = await db(payload).execute(sql`UPDATE mfa_trusted_devices SET revoked_at = ${now.toISOString()}::timestamptz WHERE user_id = ${String(userId)} AND id <> ${keep}::uuid AND revoked_at IS NULL RETURNING id`)
  return r.rows.length
}

export type DeviceRow = { id: string; label: string; createdAt: string; lastUsedAt: string | null; expiresAt: string; current: boolean }

/** The user's remembered devices that still work (unrevoked, unexpired), newest first. `current` marks the cookie's device. */
export async function listDevices(payload: Payload, userId: string | number, currentCookie: string | undefined | null, now = new Date()): Promise<DeviceRow[]> {
  const c = unpackCookie(currentCookie)
  const r = await db(payload).execute(sql`SELECT id, label, created_at, last_used_at, expires_at FROM mfa_trusted_devices WHERE user_id = ${String(userId)} AND revoked_at IS NULL AND expires_at > ${now.toISOString()}::timestamptz ORDER BY created_at DESC LIMIT 50`)
  return r.rows.map((x) => ({
    id: String(x.id),
    label: String(x.label ?? 'Device'),
    createdAt: new Date(String(x.created_at)).toISOString(),
    lastUsedAt: x.last_used_at ? new Date(String(x.last_used_at)).toISOString() : null,
    expiresAt: new Date(String(x.expires_at)).toISOString(),
    current: Boolean(c && c.userId === String(userId) && c.deviceId === String(x.id)),
  }))
}

/** Revoke ONE of the user's own devices (the user id comes from the session, never the request). */
export async function revokeDevice(payload: Payload, userId: string | number, deviceId: string, now = new Date()): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(deviceId)) return false
  const r = await db(payload).execute(sql`UPDATE mfa_trusted_devices SET revoked_at = ${now.toISOString()}::timestamptz WHERE id = ${deviceId}::uuid AND user_id = ${String(userId)} AND revoked_at IS NULL RETURNING id`)
  return r.rows.length === 1
}
