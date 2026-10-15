import type { Payload } from 'payload'

/**
 * First-admin bootstrap for a client's private host (run once by the operator, with the owner present). No account is seeded by the
 * migrations or the seed pack; this creates the ONE platform-admin the owner will use:
 *   - the owner's email (and name) come from the environment at run time (an address is not a secret);
 *   - the password is typed by the owner at a hidden terminal prompt, twice: it is never an argument, an environment variable, a file
 *     or a log line (see `bootstrap-admin.run.ts`), and goes straight to Payload, which stores only its hash;
 *   - no authenticator is enrolled here: the owner scans the QR at their first sign-in (the two-factor guard requires it for admins),
 *     so the authenticator is set by the owner in person on the private host;
 *   - it REFUSES if any admin (platform-admin or client-admin) already exists, so it can be run only once and never takes over an
 *     existing install; a second run changes nothing.
 * Order: migrate, identity-step, seed-pack, bootstrap-admin, then the fresh-database row scan (must report 0).
 */
export const ADMIN_ROLES = ['platform-admin', 'client-admin'] as const
export const MIN_PASSWORD_LENGTH = 14
export const MAX_PASSWORD_LENGTH = 128

export type BootstrapInput = { email: string; name: string }
export type BootstrapPlan = { ok: true; input: BootstrapInput } | { ok: false; problem: string }

/** Validates the environment (pure). Never reads or returns a password. */
export function planBootstrap(env: Record<string, string | undefined>): BootstrapPlan {
  const email = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase()
  if (!email) return { ok: false, problem: 'BOOTSTRAP_ADMIN_EMAIL is required (the owner\'s email address).' }
  if (email.length > 254 || !/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)) return { ok: false, problem: 'BOOTSTRAP_ADMIN_EMAIL is not a valid email address.' }
  const rawName = (env.BOOTSTRAP_ADMIN_NAME ?? '').trim()
  // the control-character check runs BEFORE whitespace is collapsed (a newline would otherwise become a space)
  // eslint-disable-next-line no-control-regex
  if (rawName.length > 200 || /[\u0000-\u001f\u007f]/.test(rawName)) return { ok: false, problem: 'BOOTSTRAP_ADMIN_NAME is too long or contains control characters.' }
  const name = rawName.replace(/\s+/g, ' ')
  if (name.length > 80) return { ok: false, problem: 'BOOTSTRAP_ADMIN_NAME is too long or contains control characters.' }
  return { ok: true, input: { email, name: name || 'Administrator' } }
}

/** The password rule: length only (the owner chooses it), a sane ceiling, and not the email. Returns the problem, or null. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password.length > MAX_PASSWORD_LENGTH) return `The password must be at most ${MAX_PASSWORD_LENGTH} characters.`
  if (password.toLowerCase().includes(email.split('@')[0]!) && email.split('@')[0]!.length >= 4) return 'The password must not contain the email name.'
  if (/^(.)\1+$/.test(password)) return 'The password must not be one repeated character.'
  return null
}

export type BootstrapOutcome = { ok: true; created: true; userId: string } | { ok: false; code: 'ADMIN_EXISTS' | 'BAD_PASSWORD' | 'CREATE_FAILED'; message: string }

/** Creates the single platform-admin, or refuses. The password is passed to Payload and not kept, returned or logged. */
export async function bootstrapAdmin(payload: Payload, input: BootstrapInput, password: string): Promise<BootstrapOutcome> {
  const bad = passwordProblem(password, input.email)
  if (bad) return { ok: false, code: 'BAD_PASSWORD', message: bad }
  const existing = await payload.find({ collection: 'users', where: { roles: { in: [...ADMIN_ROLES] } } as never, limit: 1, depth: 0, overrideAccess: true, pagination: false })
  if (existing.docs.length > 0) return { ok: false, code: 'ADMIN_EXISTS', message: 'An admin already exists on this install, so nothing was created. (This command runs once, on a fresh database.)' }
  try {
    const user = await payload.create({
      collection: 'users',
      data: { email: input.email, name: input.name, password, roles: ['platform-admin'] } as never,
      overrideAccess: true,
    })
    return { ok: true, created: true, userId: String((user as unknown as { id: string | number }).id) }
  } catch (e) {
    // the error name only: an error message could echo submitted data
    return { ok: false, code: 'CREATE_FAILED', message: `The admin could not be created (${(e as Error)?.name ?? 'error'}).` }
  }
}
