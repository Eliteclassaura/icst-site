/**
 * Patch L2, REHEARSAL ONLY: give Commander's synthetic admin a TOTP secret so rehearsal smoke tests can pass
 * two-factor like a person with an authenticator app. There is no bypass anywhere: this enrols, nothing more.
 *
 *   H2O_REHEARSAL=1 H2O_REHEARSAL_CREDENTIALS=/path/to/0600-file pnpm exec payload run ops/mfa/rehearsal-enrol.ts
 *
 * The credentials file is the existing 0600 file holding the synthetic admin's `email=` and `password=` lines. The
 * script generates a secret, enrols that user, and appends `totp_secret=…` to the same file (still 0600). It prints
 * neither the secret nor the email. It refuses unless H2O_REHEARSAL=1 and the database name contains "rehearsal",
 * so it cannot run against staging or production.
 */
import config from '@payload-config'
import { appendFileSync, readFileSync, statSync } from 'node:fs'
import { getPayload } from 'payload'
import { enrolWithSecret } from '../../src/auth/mfa/service'
import { generateSecret } from '../../src/auth/mfa/totp'

const fail = (m: string, code = 2): never => {
  console.error(`rehearsal-enrol: ${m}`)
  process.exit(code)
}
const dbName = (process.env.DATABASE_URI ?? '').replace(/\?.*$/, '').split('/').pop() ?? ''
if (process.env.H2O_REHEARSAL !== '1') fail('refused: set H2O_REHEARSAL=1 (rehearsal app only)')
if (!/rehearsal/i.test(dbName)) fail('refused: the database name must contain "rehearsal" (never staging or production)')
const file = process.env.H2O_REHEARSAL_CREDENTIALS ?? fail('set H2O_REHEARSAL_CREDENTIALS to the 0600 credentials file')
if ((statSync(file).mode & 0o077) !== 0) fail('the credentials file must be mode 0600')
const lines = readFileSync(file, 'utf8').split('\n')
if (lines.some((l) => l.startsWith('totp_secret='))) fail('the file already holds a totp_secret (nothing changed)', 0)
const email = lines.find((l) => l.startsWith('email='))?.slice(6).trim() ?? fail('no email= line in the credentials file')

const payload = await getPayload({ config })
const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true, depth: 0 })
const user = found.docs[0] ?? fail('no user with the email from the credentials file')
const secret = generateSecret()
await enrolWithSecret(payload, user.id, secret)
appendFileSync(file, `${lines[lines.length - 1] === '' ? '' : '\n'}totp_secret=${secret}\n`, { mode: 0o600 })
console.log(`rehearsal-enrol: enrolled user ${String(user.id).slice(0, 8)}…; totp_secret appended to the credentials file`)
process.exit(0)
