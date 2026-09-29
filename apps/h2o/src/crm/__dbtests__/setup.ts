/**
 * DB-backed CRM test setup — isolation guard.
 *
 * These tests write rows. They run only against a database that is provably local and synthetic:
 *
 *   - `H2O_CRM_TEST_DATABASE_URI` must be set explicitly (the app's own DATABASE_URI is never used);
 *   - its host must be loopback (127.0.0.1, localhost or ::1);
 *   - its database name must contain `synthetic` or `test`.
 *
 * Anything else throws before Payload is imported, so no configuration mistake can point this suite at a
 * staging or production database. The Payload secret is a throwaway test value.
 */
const uri = process.env.H2O_CRM_TEST_DATABASE_URI ?? ''
let parsed: URL
try {
  parsed = new URL(uri)
} catch {
  throw new Error('[crm-db-tests] H2O_CRM_TEST_DATABASE_URI is missing or not a URL. Refusing to run.')
}
const host = parsed.hostname.replace(/^\[|\]$/g, '')
const db = parsed.pathname.replace(/^\//, '')
if (!['127.0.0.1', 'localhost', '::1'].includes(host))
  throw new Error('[crm-db-tests] database host is not loopback. Refusing to run.')
if (!/synthetic|test/i.test(db))
  throw new Error('[crm-db-tests] database name must contain "synthetic" or "test". Refusing to run.')

process.env.DATABASE_URI = uri
process.env.PAYLOAD_SECRET = 'test-crm-db-suite-throwaway-secret-000000000000'
Object.assign(process.env, { NODE_ENV: 'test' })
process.env.PAYLOAD_GRAPHQL = ''
delete process.env.H2O_CRM_DATA_LABEL
