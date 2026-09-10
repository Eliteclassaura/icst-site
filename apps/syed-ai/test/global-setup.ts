/**
 * Creates an isolated test database, runs the committed migrations against it, and points
 * DATABASE_URI at it for every test file. Requires a reachable Postgres (local or CI service).
 */
import { execSync } from 'node:child_process'
import pg from 'pg'

export default async function setup() {
  const base = process.env.DATABASE_URI || 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
  const admin = new URL(base)
  const testDb = `factory_test_${process.pid}`
  const client = new pg.Client({ connectionString: new URL('/postgres', admin).toString() })
  await client.connect()
  await client.query(`DROP DATABASE IF EXISTS ${testDb}`)
  await client.query(`CREATE DATABASE ${testDb}`)
  await client.end()
  const uri = new URL(`/${testDb}`, admin).toString()
  process.env.DATABASE_URI = uri
  process.env.PAYLOAD_SECRET ||= 'test-only-secret-not-for-production'
  process.env.NEXT_PUBLIC_SERVER_URL ||= 'http://localhost:3000'
  execSync('pnpm exec payload migrate', { stdio: 'pipe', env: { ...process.env, DATABASE_URI: uri } })
  return async () => {
    const c = new pg.Client({ connectionString: new URL('/postgres', admin).toString() })
    await c.connect()
    await c.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`)
    await c.end()
  }
}
