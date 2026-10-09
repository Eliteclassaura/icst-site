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
// The config no longer defaults an origin (deployable manifests must state it); tests use a local one.
process.env.NEXT_PUBLIC_SERVER_URL ||= 'http://localhost:3200'
delete process.env.H2O_CRM_DATA_LABEL
// RFQ-EMAIL-CHECK-1: no DNS lookups from tests (the fixtures use reserved example domains); the email-check tests switch it on with a mock resolver.
process.env.H2O_EMAIL_DNS_CHECK = 'off'

// Content bridge DB tests: isolated, throwaway snapshot / search / upload directories for this run.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const bridgeTmp = mkdtempSync(join(tmpdir(), 'h2o-bridge-dbtest-'))
process.env.CONTENT_SNAPSHOT_DIR ||= join(bridgeTmp, 'snapshot')
process.env.SEARCH_INDEX_DIR ||= join(bridgeTmp, 'search')
process.env.MEDIA_DIR ||= join(bridgeTmp, 'media')

// TEST-CLOCK-FIX-1: `H2O_TEST_NOW=<ISO instant>` starts the whole run at that instant; Date then ticks on in real time.
// Only Date is faked (timers, sockets and the database are untouched). Used to prove the suite at any hour of the week;
// unset, nothing changes. A test that installs its own fake timers replaces this for its duration.
import { vi } from 'vitest'
if (process.env.H2O_TEST_NOW) {
  const start = Date.parse(process.env.H2O_TEST_NOW)
  if (Number.isNaN(start)) throw new Error('[crm-db-tests] H2O_TEST_NOW is not a date.')
  vi.useFakeTimers({ toFake: ['Date'], now: start, shouldAdvanceTime: true })
}
