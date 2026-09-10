import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Liveness (C8). Answers 200 while the process is running and able to serve a request; it deliberately
 * checks **nothing else**, so a database blip restarts nothing. Readiness is `/api/health`.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  )
}
