import { encryptSecret } from '../../auth/mfa/keys'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { CRM_SLUGS } from '../index'
import { GET, POST, PATCH, DELETE } from '../../app/(payload)/api/[...slug]/route'

/**
 * Shared DB-test harness. Everything written is synthetic: `example.test` addresses (RFC 2606 reserved),
 * invented company names, no real person, account, plant or tower.
 */

export const ROLES_UNDER_TEST = [
  'platform-admin',
  'client-admin',
  'sales',
  'viewer',
  'editor',
  'search-analyst',
] as const
export type RoleUnderTest = (typeof ROLES_UNDER_TEST)[number]
export const PASSWORD = 'synthetic-Password-1!'
export const userEmail = (role: RoleUnderTest) => `${role}.user@example.test`

let cached: Payload | null = null
export async function payload(): Promise<Payload> {
  if (!cached) cached = await getPayload({ config })
  return cached
}

const table = (slug: string) => slug.replace(/-/g, '_')

/** Empty every CRM table and CRM audit rows. Users are kept (created once). */
export async function resetCrm(): Promise<void> {
  const p = await payload()
  const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
  const tables = CRM_SLUGS.map((s) => `"${table(s)}"`).join(', ')
  await drizzle.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`))
  await drizzle.execute(sql.raw(`DELETE FROM "audit_log" WHERE "collection" LIKE 'crm-%'`))
  // Synthetic catalog rows created by CRM tests (a failed run must not leak into the next one).
  await drizzle.execute(sql.raw(`DELETE FROM "products" WHERE "slug" LIKE 'synthetic-%'`))
}

/** A known synthetic TOTP secret for harness users (test-only; the real flow is exercised in mfa.dbtest.ts). */
export const HARNESS_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const sidOf = (token: string): string => String((JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sid?: unknown }).sid ?? '')

/**
 * Patch L2: every login is a password-only session until it passes two-factor, and the guard lets such a session do
 * nothing. Harness users are enrolled with a known secret and each harness login is marked verified here — test
 * scaffolding only, never shipped (the app's only path is `verifySecondFactor`).
 */
export async function trustSession(id: string, token: string): Promise<void> {
  const p = await payload()
  const u = (await p.findByID({ collection: 'users', id, overrideAccess: true, showHiddenFields: true, depth: 0 })) as unknown as Record<string, unknown>
  const sessions = Array.isArray(u.mfa_sessions) ? (u.mfa_sessions as unknown[]) : []
  await p.update({
    collection: 'users',
    id,
    data: { mfa_enabled: true, mfa_secret: u.mfa_secret ?? encryptSecret(HARNESS_TOTP_SECRET), mfa_sessions: [...sessions, { sid: sidOf(token), at: new Date().toISOString() }] } as never,
    overrideAccess: true,
    showHiddenFields: true,
    depth: 0,
  })
}

export type TestUser = { id: string; role: RoleUnderTest; token: string; user: Record<string, unknown> }
const users = new Map<RoleUnderTest, TestUser>()

export async function user(role: RoleUnderTest): Promise<TestUser> {
  const hit = users.get(role)
  if (hit) return hit
  const p = await payload()
  const email = userEmail(role)
  const existing = await p.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  if (!existing.docs[0])
    await p.create({
      collection: 'users',
      data: { email, password: PASSWORD, roles: [role], name: `Synthetic ${role}` } as never,
      overrideAccess: true,
    })
  const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
  await trustSession(String(login.user!.id), String(login.token))
  const u: TestUser = {
    id: String(login.user!.id),
    role,
    token: String(login.token),
    user: login.user as unknown as Record<string, unknown>,
  }
  users.set(role, u)
  return u
}

/** An additional synthetic user (e.g. a second salesperson). */
export async function userWith(email: string, role: RoleUnderTest): Promise<TestUser> {
  const p = await payload()
  const existing = await p.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  if (!existing.docs[0])
    await p.create({
      collection: 'users',
      data: { email, password: PASSWORD, roles: [role], name: `Synthetic ${role} 2` } as never,
      overrideAccess: true,
    })
  const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
  await trustSession(String(login.user!.id), String(login.token))
  return {
    id: String(login.user!.id),
    role,
    token: String(login.token),
    user: login.user as unknown as Record<string, unknown>,
  }
}

/** Local API call as a user, with access control ON (the REST posture). */
export const as = (u: TestUser) => ({ overrideAccess: false as const, user: u.user })

const BASE = 'http://127.0.0.1:3200'
export type RestResponse = { status: number; body: Record<string, unknown> }

async function call(
  handler: (r: Request, ctx: { params: Promise<{ slug: string[] }> }) => Promise<Response>,
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<RestResponse> {
  const url = new URL(`/api/${path}`, BASE)
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token) headers.set('authorization', `JWT ${token}`)
  const req = new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const slug = url.pathname
    .replace(/^\/api\//, '')
    .split('/')
    .filter(Boolean)
  const res = await handler(req, { params: Promise.resolve({ slug }) })
  let json: Record<string, unknown>
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, body: json }
}

/** The app's real REST route handlers (`src/app/(payload)/api/[...slug]/route.ts`). */
export const rest = {
  get: (path: string, token: string | null) => call(GET as never, 'GET', path, token),
  post: (path: string, token: string | null, body: unknown) => call(POST as never, 'POST', path, token, body),
  patch: (path: string, token: string | null, body: unknown) =>
    call(PATCH as never, 'PATCH', path, token, body),
  delete: (path: string, token: string | null) => call(DELETE as never, 'DELETE', path, token),
}

/** Capture Payload logger output for PII checks. */
export function captureLogs(p: Payload): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const logger = p.logger as unknown as Record<string, (...a: unknown[]) => void>
  const originals: Record<string, (...a: unknown[]) => void> = {}
  for (const level of ['info', 'warn', 'error', 'debug']) {
    originals[level] = logger[level]!
    logger[level] = (...args: unknown[]) => {
      lines.push(JSON.stringify(args))
    }
  }
  return {
    lines,
    restore: () => {
      for (const level of Object.keys(originals)) logger[level] = originals[level]!
    },
  }
}

/** Fetch audit-log rows for one CRM document. */
export async function auditFor(collection: string, docId: string) {
  const p = await payload()
  const res = await p.find({
    collection: 'audit-log',
    where: { and: [{ collection: { equals: collection } }, { docId: { equals: docId } }] },
    limit: 100,
    overrideAccess: true,
    sort: 'createdAt',
  })
  return res.docs as unknown as Array<Record<string, unknown>>
}
