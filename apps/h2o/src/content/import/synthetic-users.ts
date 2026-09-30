/**
 * Synthetic users for runtime evidence (example.test only; synthetic password from the environment).
 * Run: node node_modules/payload/bin.js run <this file>   (against a disposable synthetic database only)
 */
import config from '@payload-config'
import { getPayload } from 'payload'

const password = process.env.H2O_SYNTHETIC_PASSWORD
if (!password) throw new Error('H2O_SYNTHETIC_PASSWORD required')
if (!/synthetic|test/i.test(process.env.DATABASE_URI ?? '') || !/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URI ?? '')) throw new Error('refusing: not a local synthetic database')
async function main() {
const payload = await getPayload({ config })
const users: Array<[string, string, string]> = [
  ['admin.synthetic@example.test', 'platform-admin', 'Dana Admin'],
  ['editor.synthetic@example.test', 'editor', 'Eli Editor'],
  ['seo.synthetic@example.test', 'search-analyst', 'Sam SEO'],
  ['sales.synthetic@example.test', 'sales', 'Riley Sales'],
  ['sales2.synthetic@example.test', 'sales', 'Morgan Sales'],
  ['viewer.synthetic@example.test', 'viewer', 'Vic Viewer'],
]
for (const [email, role, name] of users) {
  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
  if (found.docs[0]) continue
  await payload.create({ collection: 'users', data: { email, password, roles: [role], name } as never, overrideAccess: true })
}
process.stdout.write(`${JSON.stringify({ users: users.length })}\n`)
process.exit(0)
}
await main()
