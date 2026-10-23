import { afterEach, describe, expect, it } from 'vitest'
import { GET as live } from '../app/api/live/route'
import { MIGRATION_STATE_TIMEOUT_MS, migrationState } from '../migration-state'

const saved = process.env.DATABASE_URI
afterEach(() => {
  process.env.DATABASE_URI = saved
})

describe('health routes', () => {
  it('liveness answers 200 with no database and no-store, noindex headers', async () => {
    const res = live()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(await res.text()).toBe('ok')
  })

  it('migration state is `unknown` (never a thrown error, never a leaked message) when the database cannot be reached', async () => {
    process.env.DATABASE_URI = 'postgres://nobody:nothing@127.0.0.1:1/none'
    const started = Date.now()
    expect(await migrationState(MIGRATION_STATE_TIMEOUT_MS)).toBe('unknown')
    expect(Date.now() - started).toBeLessThan(MIGRATION_STATE_TIMEOUT_MS + 1500)
  })

  it('the default deadline is one second', () => {
    expect(MIGRATION_STATE_TIMEOUT_MS).toBe(1000)
  })
})
