import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { ROLES, type Role } from '@factory/agency-core/cms'

let payload: Payload | undefined
export async function getTestPayload(): Promise<Payload> {
  payload ??= await getPayload({ config })
  return payload
}

export type TestUser = { id: string; email: string; roles: Role[]; collection: 'users' }
const cache = new Map<Role, TestUser>()

/** One user per role, created with access checks bypassed (this is the fixture, not the thing under test). */
export async function userWithRole(role: Role): Promise<TestUser> {
  const hit = cache.get(role)
  if (hit) return hit
  const p = await getTestPayload()
  const email = `${role}@test.local`
  const existing = await p.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  const doc =
    existing.docs[0] ??
    (await p.create({
      collection: 'users',
      data: { email, password: 'test-password-1234', roles: [role] },
      overrideAccess: true,
    }))
  const u = { id: String(doc.id), email, roles: [role], collection: 'users' as const }
  cache.set(role, u)
  return u
}

export async function allRoleUsers(): Promise<Record<Role, TestUser>> {
  const out = {} as Record<Role, TestUser>
  for (const r of ROLES) out[r] = await userWithRole(r)
  return out
}

/** Run a local-API call with access control ENFORCED for the given user (or anonymous). */
export function asUser<T>(
  user: TestUser | null,
  fn: (opts: { user: TestUser | null; overrideAccess: false }) => Promise<T>,
): Promise<T> {
  return fn({ user, overrideAccess: false })
}

export async function expectForbidden(p: Promise<unknown>): Promise<void> {
  let threw = false
  try {
    await p
  } catch (e) {
    threw = true
    const status = (e as { status?: number }).status
    // 404 is acceptable — and preferable — for a hidden document: it does not confirm existence.
    if (status !== undefined && ![401, 403, 404].includes(status)) throw e
  }
  if (!threw) throw new Error('expected a 401/403/404 but the operation succeeded')
}
