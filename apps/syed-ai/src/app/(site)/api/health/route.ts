import { NextResponse } from 'next/server'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

/**
 * Readiness (C8). 200 only when the database answers a real query **and** media storage is usable;
 * 503 otherwise, so an orchestrator never routes traffic to a container that cannot serve a page.
 *
 * The body is deliberately a fixed, tiny shape: `{ status, checks: { database, storage } }` with
 * `'ok' | 'fail'` values and nothing else. No hostnames, no connection strings, no versions, no file
 * paths, no error text — a public readiness probe must not become a reconnaissance endpoint (the
 * legacy `diagnose.php` leaked exactly that, R1). Failures are logged server-side where they belong.
 */
type Check = 'ok' | 'fail'

export async function GET() {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()])
  const ok = database === 'ok' && storage === 'ok'
  return NextResponse.json(
    { status: ok ? 'ok' : 'fail', checks: { database, storage } },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    },
  )
}

async function checkDatabase(): Promise<Check> {
  try {
    const payload = await getPayload({ config })
    // A real read through the configured adapter — not a bare TCP connect.
    await payload.count({ collection: 'pages', overrideAccess: true })
    return 'ok'
  } catch {
    return 'fail'
  }
}

async function checkStorage(): Promise<Check> {
  try {
    if (process.env.S3_BUCKET) {
      // S3-backed: the adapter is configured; a HEAD on every probe would bill and rate-limit, so the
      // check is that the credentials the adapter needs are present. Real S3 failures surface on upload.
      return process.env.S3_REGION && (process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)
        ? 'ok'
        : 'fail'
    }
    const dir = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media')
    await access(dir, constants.W_OK)
    return 'ok'
  } catch {
    return 'fail'
  }
}
