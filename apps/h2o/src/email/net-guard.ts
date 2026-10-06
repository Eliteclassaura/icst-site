import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Patch C: where the CRM may open a mail connection to (SSRF guard). An admin types a host name into the sending
 * profile; without a guard, "verify connection" would let a CRM account probe the private network.
 *
 *   - The host must be a DNS name (no IP literal, no "localhost", no single-label name) unless it is listed in
 *     H2O_SMTP_INTERNAL_HOSTS (exact names, comma-separated — e.g. the internal Stalwart service).
 *   - Every address it resolves to must be public (no loopback, private, link-local, CGNAT, multicast, reserved,
 *     unique-local, or IPv4-mapped forms of those). Internal hosts are the only way to reach a private address.
 *   - The connection then goes to the address that was checked, with TLS verified against the configured name, so a
 *     second DNS answer cannot redirect it (no rebinding window).
 * Ports are limited to submission (587 STARTTLS, 465 TLS) and IMAP over TLS (993) by the callers.
 */

export type GuardResult = { ok: true; address: string; internal: boolean } | { ok: false; code: string }

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export const internalHosts = (env: Record<string, string | undefined> = process.env): Set<string> =>
  new Set(
    (env.H2O_SMTP_INTERNAL_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  )

/** Pure: the host as typed, normalised, or null when it is not an acceptable name. */
export function normaliseHost(raw: unknown, env: Record<string, string | undefined> = process.env): string | null {
  if (typeof raw !== 'string') return null
  const h = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!h || h.length > 253) return null
  if (internalHosts(env).has(h)) return h
  if (isIP(h) || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return null
  return HOSTNAME.test(h) ? h : null
}

const v4 = (a: string): number[] => a.split('.').map(Number)

/** Pure: is this resolved address publicly routable? */
export function isPublicAddress(addr: string): boolean {
  const kind = isIP(addr)
  if (kind === 4) {
    const [a, b, c] = v4(addr) as [number, number, number, number]
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    if (a === 198 && b === 51 && c === 100) return false
    if (a === 203 && b === 0 && c === 113) return false
    return true
  }
  if (kind === 6) {
    const s = addr.toLowerCase()
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
    if (mapped) return isPublicAddress(mapped[1]!)
    if (s === '::' || s === '::1') return false
    const first = parseInt(s.split(':')[0] || '0', 16)
    if ((first & 0xfe00) === 0xfc00) return false // unique local fc00::/7
    if ((first & 0xffc0) === 0xfe80) return false // link local fe80::/10
    if ((first & 0xff00) === 0xff00) return false // multicast
    if (s.startsWith('2001:db8') || s.startsWith('64:ff9b') || s.startsWith('100::')) return false
    return true
  }
  return false
}

export type Resolver = (host: string) => Promise<Array<{ address: string }>>
const systemResolver: Resolver = (host) => lookup(host, { all: true, verbatim: true })

/** Resolve and check a host; the address to connect to, or a code. Never logs the host. */
export async function guardHost(raw: unknown, opts: { env?: Record<string, string | undefined>; resolve?: Resolver } = {}): Promise<GuardResult> {
  const env = opts.env ?? process.env
  const host = normaliseHost(raw, env)
  if (!host) return { ok: false, code: 'HOST_NOT_ALLOWED' }
  const internal = internalHosts(env).has(host)
  let addrs: Array<{ address: string }>
  try {
    addrs = await (opts.resolve ?? systemResolver)(host)
  } catch {
    return { ok: false, code: 'HOST_NOT_FOUND' }
  }
  if (addrs.length === 0) return { ok: false, code: 'HOST_NOT_FOUND' }
  if (!internal && addrs.some((a) => !isPublicAddress(a.address))) return { ok: false, code: 'HOST_PRIVATE_ADDRESS' }
  return { ok: true, address: addrs[0]!.address, internal }
}
