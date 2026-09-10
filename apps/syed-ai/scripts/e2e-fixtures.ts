/**
 * Fixtures for e2e that the seed must not create: a `proposed` redirect that must never be served
 * (ADR-028 §6). Idempotent. Run after `seed`, before Playwright.
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const payload = await getPayload({ config })
const from = '/e2e-proposed/'
const existing = await payload.find({
  collection: 'redirects',
  where: { from: { equals: from } },
  limit: 1,
  overrideAccess: true,
})
if (!existing.docs[0])
  await payload.create({
    collection: 'redirects',
    data: {
      from,
      to: '/',
      statusCode: '308',
      status: 'proposed',
      source: 'automation',
      reason: 'e2e fixture: must not be served',
      runId: '01J00000000000000000000000',
    },
    overrideAccess: true,
  })
payload.logger.info('e2e fixtures ready')
process.exit(0)
