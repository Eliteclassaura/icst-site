// Separate worker process: polls the Payload jobs queue. The web process has autoRun: [].
import 'dotenv/config'
import { getPayload } from 'payload'
import config from './payload.config'

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS || 2000)
const ONCE = process.argv.includes('--once')

const payload = await getPayload({ config })
payload.logger.info('worker started')
let running = true
const stop = () => {
  running = false
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
while (running) {
  const res = await payload.jobs.run({ limit: 10 })
  const n = Object.keys(res.jobStatus ?? {}).length
  if (n) payload.logger.info({ ran: n, statuses: res.jobStatus }, 'jobs processed')
  if (ONCE) break
  await new Promise((r) => setTimeout(r, INTERVAL))
}
payload.logger.info('worker stopped')
process.exit(0)
