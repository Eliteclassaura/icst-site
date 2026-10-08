import { createSign } from 'node:crypto'
import type { ServiceAccount, SheetsConfig } from './config'
import { TOKEN_COLUMN } from './row'

/**
 * SHEET-SYNC-1: the only code that talks to Google, with node:crypto and fetch (no SDK). Two hosts are allowed and
 * nothing else: oauth2.googleapis.com (a service-account JWT is exchanged for a token) and sheets.googleapis.com
 * (values.append and a read of the token column). Every URL is checked against that list before it is requested;
 * redirects are refused. Nothing from a response body is kept or logged: failures come back as short codes.
 */
export const ALLOWED_HOSTS = ['oauth2.googleapis.com', 'sheets.googleapis.com'] as const
export const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
export const REQUEST_TIMEOUT_MS = 10_000

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>
export class SheetsError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'SheetsError'
  }
}

export function assertAllowed(url: string): void {
  const ok = (() => {
    try {
      const u = new URL(url)
      return u.protocol === 'https:' && (ALLOWED_HOSTS as readonly string[]).includes(u.hostname)
    } catch {
      return false
    }
  })()
  if (!ok) throw new SheetsError('SHEETS_URL_REFUSED')
}

async function call(f: FetchLike, url: string, init: RequestInit): Promise<Response> {
  assertAllowed(url)
  try {
    return await f(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    throw new SheetsError('GOOGLE_NETWORK')
  }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function signJwt(sa: ServiceAccount, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }))
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key)
  return `${head}.${claims}.${b64url(sig)}`
}

let cached: { key: string; token: string; until: number } | null = null
export const resetTokenCache = () => {
  cached = null
}

export async function accessToken(cfg: SheetsConfig, f: FetchLike, now: Date): Promise<string> {
  if (!cfg.sa) throw new SheetsError('SHEETS_KEY_INVALID')
  const key = cfg.sa.client_email
  if (cached && cached.key === key && cached.until > now.getTime() + 60_000) return cached.token
  let jwt: string
  try {
    jwt = signJwt(cfg.sa, now)
  } catch {
    throw new SheetsError('SHEETS_KEY_INVALID')
  }
  const res = await call(f, TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString() })
  if (!res.ok) throw new SheetsError(`GOOGLE_TOKEN_${res.status}`)
  const j = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null
  if (!j || typeof j.access_token !== 'string' || !j.access_token) throw new SheetsError('GOOGLE_TOKEN_BAD_RESPONSE')
  const ttl = typeof j.expires_in === 'number' ? j.expires_in : 3600
  cached = { key, token: j.access_token, until: now.getTime() + ttl * 1000 }
  return j.access_token
}

/** A1 range for a tab: single quotes doubled, the whole name quoted. */
const range = (tab: string, a1: string) => `'${tab.replace(/'/g, "''")}'!${a1}`

/** Append one row. RAW: the cells are stored as the text we send (nothing is interpreted as a formula). */
export async function appendRow(cfg: SheetsConfig, f: FetchLike, now: Date, row: string[]): Promise<void> {
  const token = await accessToken(cfg, f, now)
  const url = `${SHEETS_BASE}/${cfg.spreadsheetId}/values/${encodeURIComponent(range(cfg.tab, 'A:O'))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
  const res = await call(f, url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ values: [row] }) })
  if (!res.ok) throw new SheetsError(`GOOGLE_SHEETS_${res.status}`)
}

/** Is this token (the RFQ number) already in the token column? Used before a retry, so a row appended just before a crash is not appended twice. */
export async function tokenPresent(cfg: SheetsConfig, f: FetchLike, now: Date, tokenValue: string): Promise<boolean> {
  const token = await accessToken(cfg, f, now)
  const url = `${SHEETS_BASE}/${cfg.spreadsheetId}/values/${encodeURIComponent(range(cfg.tab, `${TOKEN_COLUMN}:${TOKEN_COLUMN}`))}?majorDimension=COLUMNS`
  const res = await call(f, url, { method: 'GET', headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new SheetsError(`GOOGLE_SHEETS_${res.status}`)
  const j = (await res.json().catch(() => null)) as { values?: unknown } | null
  const col = Array.isArray(j?.values) && Array.isArray(j.values[0]) ? (j.values[0] as unknown[]) : []
  return col.includes(tokenValue)
}
