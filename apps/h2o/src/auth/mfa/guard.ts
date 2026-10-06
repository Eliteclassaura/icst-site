import { JWTAuthentication, type AuthStrategyFunction, type Payload } from 'payload'
import { isSessionVerified, loadMfaUser, type MfaUser } from './service'

/**
 * Patch L2 enforcement. Payload authenticates every request — admin UI, REST/GraphQL, and `payload.auth()` in CRM
 * pages, server actions and route handlers — through `payload.authStrategies`. `installMfaGuard` (called from
 * `onInit`) wraps the built-in `local-jwt` strategy: a password-valid session whose `sid` has not passed the second
 * factor authenticates as **nobody**. The only things such a session can do are the two-factor routes, which read the
 * pending session through `pendingSession()` (the unwrapped strategy) and nothing else.
 *
 * There is no bypass switch: staging and production behave the same. Rehearsals pass two-factor with a seeded secret
 * (ops/mfa), like a person with an authenticator app.
 */
type Strategy = { name: string; authenticate: AuthStrategyFunction }
let inner: AuthStrategyFunction = JWTAuthentication as unknown as AuthStrategyFunction
let installed = false

export function installMfaGuard(payload: Payload): void {
  const list = payload.authStrategies as unknown as Strategy[]
  const i = list.findIndex((s) => s.name === 'local-jwt')
  // Fail loudly: running without the guard would silently drop the second factor.
  if (i < 0) throw new Error('[h2o] two-factor guard: the local-jwt strategy was not found; refusing to start without it')
  if ((list[i] as Strategy & { mfaGuarded?: boolean }).mfaGuarded) return
  inner = list[i]!.authenticate
  const guarded: AuthStrategyFunction = async (args) => {
    const result = await inner(args)
    const user = result.user as (MfaUser & { _sid?: string; collection?: string }) | null
    if (!user || user.collection !== 'users') return result
    const full = await loadMfaUser(args.payload, user.id)
    if (full && isSessionVerified(full, user._sid)) return result
    return { ...result, user: null }
  }
  list[i] = Object.assign({ name: 'local-jwt', authenticate: guarded }, { mfaGuarded: true })
  installed = true
  payload.logger.info({ msg: 'two-factor guard installed' })
}

export const mfaGuardInstalled = (): boolean => installed

export type PendingSession = { user: MfaUser; sid: string; verified: boolean }

/**
 * The signed-in user behind a request even when their session has not passed two-factor yet (password valid, sid
 * live). Used only by the two-factor routes. `verified` says whether the second factor is already done.
 */
export async function pendingSession(payload: Payload, headers: Headers): Promise<PendingSession | null> {
  const result = await inner({ headers, payload, isGraphQL: false, canSetHeaders: false, strategyName: 'local-jwt' } as never)
  const user = result.user as (MfaUser & { _sid?: string; collection?: string }) | null
  if (!user || user.collection !== 'users' || !user._sid) return null
  const full = await loadMfaUser(payload, user.id)
  if (!full) return null
  return { user: full, sid: user._sid, verified: isSessionVerified(full, user._sid) }
}
