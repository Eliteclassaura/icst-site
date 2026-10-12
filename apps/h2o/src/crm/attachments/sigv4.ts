import { createHash, createHmac } from 'node:crypto'

/**
 * CRM-ATTACH-1: AWS Signature Version 4 for the S3 API (Cloudflare R2 speaks it too). In-house on `node:crypto`, so the
 * storage adapter adds no package. It signs one request at a time: the method, the path, the headers listed and the
 * payload hash. It does not read credentials from anywhere; the caller passes them in and they are never logged.
 */

export type SigV4Input = {
  method: string
  host: string
  /** The path, already encoded for the URL (for S3, each key segment is percent-encoded once). */
  path: string
  /** Extra headers to sign (lower-case names). `host` and the x-amz headers are added here. */
  headers?: Record<string, string>
  /** Hex SHA-256 of the body; S3 needs it (`x-amz-content-sha256`). Omit to sign without a payload hash (test vectors). */
  payloadHash?: string
  query?: Record<string, string>
  accessKeyId: string
  secretAccessKey: string
  region: string
  service: string
  now?: Date
}

const hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest()

/** RFC 3986 encoding, as SigV4 wants it (also encodes `!'()*`). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export function sha256Hex(body: Uint8Array | string): string {
  return createHash('sha256').update(body).digest('hex')
}

/** The headers to add to the request (Authorization, x-amz-date, and x-amz-content-sha256 when a payload hash is given). */
export function signV4(input: SigV4Input): Record<string, string> {
  const now = input.now ?? new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v
  headers.host = input.host
  headers['x-amz-date'] = amzDate
  if (input.payloadHash) headers['x-amz-content-sha256'] = input.payloadHash
  const names = Object.keys(headers).map((k) => k.toLowerCase()).sort()
  const canonicalHeaders = names.map((k) => `${k}:${String(headers[k] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('')
  const signedHeaders = names.join(';')
  const canonicalQuery = Object.entries(input.query ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join('&')
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.path || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash ?? hex(''),
  ].join('\n')
  const scope = `${date}/${input.region}/${input.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canonicalRequest)].join('\n')
  const kDate = hmac(`AWS4${input.secretAccessKey}`, date)
  const kRegion = hmac(kDate, input.region)
  const kService = hmac(kRegion, input.service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  const out: Record<string, string> = { ...headers }
  delete out.host
  out.authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return out
}

/** Encode an S3 object key for a URL path: each segment once, slashes kept. */
export const encodeKeyPath = (key: string) => key.split('/').map(enc).join('/')
