import { generateKeyPairSync } from 'node:crypto'
import type { FetchLike } from '../google'

/** A recording stand-in for Google (no network): the token endpoint, values.append and the token-column read. */
export const KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
export const PRIVATE_PEM = KEY.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
export const PUBLIC_PEM = KEY.publicKey.export({ type: 'spki', format: 'pem' }).toString()
export const SA = { client_email: 'sheet-writer@synthetic-project.iam.gserviceaccount.com', private_key: PRIVATE_PEM }
export const SA_B64 = Buffer.from(JSON.stringify({ type: 'service_account', ...SA })).toString('base64')
export const SHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd'
export const ACCESS_TOKEN = 'ya29.synthetic-access-token-0001'

export type Call = { url: string; method: string; headers: Record<string, string>; body: string }
export function fakeGoogle() {
  const calls: Call[] = []
  const sheet: string[][] = []
  const g = { calls, sheet, mode: 'ok' as 'ok' | 'down' | 'net' | 'auth', appends: () => calls.filter((c) => c.method === 'POST' && c.url.includes(':append')), fetch: undefined as unknown as FetchLike }
  g.fetch = async (url, init) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>))
    calls.push({ url, method: String(init.method ?? 'GET'), headers, body: String(init.body ?? '') })
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      if (g.mode === 'net') throw new Error('ECONNRESET')
      if (g.mode === 'auth') return new Response('{"error":"invalid_grant"}', { status: 400 })
      return new Response(JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 3600, token_type: 'Bearer' }), { status: 200 })
    }
    if (g.mode === 'net') throw new Error('ECONNRESET')
    if (g.mode === 'down') return new Response('{"error":{"message":"backend error, customer@example.test"}}', { status: 503 })
    if (init.method === 'POST') {
      sheet.push((JSON.parse(String(init.body)) as { values: string[][] }).values[0]!)
      return new Response('{}', { status: 200 })
    }
    return new Response(JSON.stringify({ values: [sheet.map((r) => r[13] ?? '')] }), { status: 200 })
  }
  return g
}
