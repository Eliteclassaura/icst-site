import config from '@payload-config'
import { getPayload } from 'payload'
import { applyIdentityStep, type Exec } from './identity-step'
import { client } from './index'

/**
 * `pnpm identity-step` (payload run): after `payload migrate` on a client's fresh database, rewrite the identity the migrations baked
 * in. Top-level await on purpose: `payload run` exits as soon as the module has loaded, so a detached promise would never finish.
 */
const payload = await getPayload({ config })
const report = await applyIdentityStep((payload.db as unknown as Exec & { drizzle: Exec }).drizzle, client())
// eslint-disable-next-line no-console
console.log(JSON.stringify({ client: client().slug, ...report }))
