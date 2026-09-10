import 'dotenv/config'
import { getPayload } from 'payload'
import config from './payload.config'

const payload = await getPayload({ config })
const email = 'admin@example.test', password = 'change-me-locally'
const users = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1 })
if (!users.docs.length) { await payload.create({ collection: 'users', data: { email, password } }); payload.logger.info('seeded admin user') }

const pages = await payload.find({ collection: 'pages', where: { slug: { equals: 'home' } }, limit: 1 })
if (!pages.docs.length) {
  await payload.create({
    collection: 'pages', data: {
      title: 'C0 compatibility spike', slug: 'home', _status: 'published',
      seo: { title: 'C0 spike — server-rendered', description: 'Proves Payload + Next + Postgres render content in the initial HTML.' },
      body: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children: [
        { type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', textFormat: 0, children: [
          { type: 'text', text: 'This paragraph came from PostgreSQL through Payload and was rendered on the server.', format: 0, detail: 0, mode: 'normal', style: '', version: 1 } ] } ] } },
    },
  })
  payload.logger.info('seeded home page')
}

// Queue one mock email job (idempotent by key).
await payload.jobs.queue({ task: 'sendMockEmail', input: { to: 'owner@example.test', subject: 'C0 spike: seed complete', body: 'queued from seed', idempotencyKey: 'seed-1' } })
payload.logger.info('queued sendMockEmail job')
process.exit(0)
