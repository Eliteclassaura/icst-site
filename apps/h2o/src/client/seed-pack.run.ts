import config from '@payload-config'
import { getPayload } from 'payload'
import { client } from './index'
import { applySeedPack } from './seed-pack'

/** `pnpm seed-pack` (payload run): after `payload migrate` and `pnpm identity-step`. Top-level await: `payload run` exits when the module has loaded. */
const payload = await getPayload({ config })
const report = await applySeedPack(payload, client())
// eslint-disable-next-line no-console
console.log(JSON.stringify({ client: client().slug, ...report }))
