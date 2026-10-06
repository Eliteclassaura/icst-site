/**
 * Patch L2 break-glass: clear one user's two-factor from the server, for when nobody who could reset it in the admin
 * can sign in (for example the only admin lost their phone and their recovery codes). Needs shell access to the app
 * container — that access is the authorisation. Audited as `mfa-reset` (by: break-glass).
 *
 *   H2O_BREAK_GLASS_EMAIL=<the user's email> pnpm exec payload run ops/mfa/break-glass-reset.ts
 *
 * The user enrols again at their next sign-in. Prints only a short user-id prefix.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { clearMfa } from '../../src/auth/mfa/service'

const email = process.env.H2O_BREAK_GLASS_EMAIL
if (!email) {
  console.error('break-glass-reset: set H2O_BREAK_GLASS_EMAIL')
  process.exit(2)
}
const payload = await getPayload({ config })
const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true, depth: 0 })
if (!found.docs[0]) {
  console.error('break-glass-reset: no such user')
  process.exit(3)
}
await clearMfa(payload, found.docs[0].id, 'break-glass', null)
console.log(`break-glass-reset: two-factor cleared for user ${String(found.docs[0].id).slice(0, 8)}…; they enrol again at their next sign-in`)
process.exit(0)
