import { promises as dns } from 'node:dns'
import { domainToASCII } from 'node:url'
import { DISPOSABLE_EMAIL_DOMAINS } from '../crm/address-quality'

/**
 * RFQ-EMAIL-CHECK-1 (lives in src/email, not src/crm: the CRM boundary test forbids network clients there): the native quote form refuses obviously bad email addresses on the SERVER, before anything is stored
 * or any alert / T1 is queued.
 *
 *   1. strict syntax  — one @, a local part ≤ 64, the whole address ≤ 254, a domain of valid labels with a letter TLD;
 *   2. disposable     — a small static list (crm/address-quality.ts), no network fetch;
 *   3. DNS            — the domain must have an MX record, or an A / AAAA record as the fallback (RFC 5321 implicit MX).
 *                       NXDOMAIN or "no data" → refuse. A timeout or any other DNS failure FAILS OPEN: the address is
 *                       accepted and the inquiry is flagged "email unverified", so a real lead is never lost to a DNS hiccup.
 *
 * There is NO SMTP probing, ever (it hurts sender reputation and is unreliable). Results are cached in memory (a lookup
 * that succeeded for an hour, an NXDOMAIN for ten minutes; a timeout or error is never cached).
 */
export type EmailCheck =
  | { status: 'OK' }
  | { status: 'UNVERIFIED'; reason: 'DNS_TIMEOUT' | 'DNS_ERROR' }
  | { status: 'REJECT'; key: 'err.email' | 'err.email_domain' | 'err.email_disposable' }

export type DnsLookup = {
  resolveMx: (host: string) => Promise<unknown[]>
  resolve4: (host: string) => Promise<unknown[]>
  resolve6: (host: string) => Promise<unknown[]>
}
const SYSTEM_DNS: DnsLookup = { resolveMx: (h) => dns.resolveMx(h), resolve4: (h) => dns.resolve4(h), resolve6: (h) => dns.resolve6(h) }

/** Tests (and nothing else) swap the resolver; `null` restores the system resolver. */
let injected: DnsLookup | null = null
export const setEmailDnsLookup = (l: DnsLookup | null) => {
  injected = l
}
/** Operator switch `H2O_EMAIL_DNS_CHECK=off` skips only the DNS step (syntax and the disposable list still apply). */
const dnsCheckOn = () => (process.env.H2O_EMAIL_DNS_CHECK ?? 'on').trim().toLowerCase() !== 'off'

export const DNS_TIMEOUT_MS = 2000
const OK_TTL_MS = 60 * 60_000
const NX_TTL_MS = 10 * 60_000
const CACHE_MAX = 500
const cache = new Map<string, { until: number; found: boolean }>()
export const clearEmailCheckCache = () => cache.clear()

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/

/** Strict syntax. Returns the lower-cased ASCII domain, or null. */
export function strictDomainOf(address: string): string | null {
  const v = address.trim()
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  if (v.length < 6 || v.length > 254 || /[\s\u0000-\u001F\u007F]/.test(v)) return null
  const at = v.indexOf('@')
  if (at < 1 || at !== v.lastIndexOf('@')) return null
  const local = v.slice(0, at)
  if (local.length > 64 || !LOCAL.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null
  // The RAW domain is checked first: nothing that could be read as a URL, path, port, query, fragment or escape ever reaches
  // the IDNA conversion (so "evil.com/foo" or "a.com#x" is refused here, not "cleaned").
  const rawDomain = v.slice(at + 1).replace(/\.$/, '')
  if (rawDomain === '' || /[\s/\\?#%@:,;<>()[\]"'`|^{}=+*!$&~]/.test(rawDomain)) return null
  const domain = domainToASCII(rawDomain.toLowerCase())
  if (!domain || domain.length > 253 || !/^[a-z0-9.-]+$/.test(domain)) return null
  const labels = domain.split('.')
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null
  if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1]!) && !/^xn--[a-z0-9-]{2,59}$/.test(labels[labels.length - 1]!)) return null
  return domain
}

/** DNS codes that mean "this name has no mail records" (as opposed to "we could not find out"). */
const NO_RECORDS = new Set(['ENOTFOUND', 'ENODATA'])

/**
 * true = has MX or an address record; false = it does not exist; throws for "could not tell". MX, A and AAAA are asked at
 * the same time under ONE deadline (`ms`): the first record found wins at once, and a resolver that hangs costs at most
 * `ms` in total, not `ms` per record type.
 */
async function hasMailRecords(domain: string, lookup: DnsLookup, ms: number): Promise<boolean> {
  const cached = cache.get(domain)
  if (cached && cached.until > Date.now()) return cached.found
  const remember = (found: boolean) => {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
    cache.set(domain, { until: Date.now() + (found ? OK_TTL_MS : NX_TTL_MS), found })
    return found
  }
  return new Promise<boolean>((resolve, reject) => {
    let pending = 3
    let failure: unknown = null
    let done = false
    const finish = (f: () => void) => {
      if (done) return
      done = true
      clearTimeout(timer)
      f()
    }
    const timer = setTimeout(() => finish(() => reject(Object.assign(new Error('DNS_TIMEOUT'), { code: 'ETIMEOUT_LOCAL' }))), ms)
    const settle = () => {
      if (--pending === 0) finish(() => (failure ? reject(failure) : resolve(remember(false))))
    }
    for (const f of [lookup.resolveMx, lookup.resolve4, lookup.resolve6])
      f(domain).then(
        (r) => (r.length > 0 ? finish(() => resolve(remember(true))) : settle()),
        (e) => {
          if (!NO_RECORDS.has((e as { code?: string }).code ?? '')) failure ??= e
          settle()
        },
      )
  })
}

export async function checkEmailAddress(raw: unknown, opts: { lookup?: DnsLookup; timeoutMs?: number } = {}): Promise<EmailCheck> {
  if (typeof raw !== 'string') return { status: 'REJECT', key: 'err.email' }
  const domain = strictDomainOf(raw)
  if (!domain) return { status: 'REJECT', key: 'err.email' }
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return { status: 'REJECT', key: 'err.email_disposable' }
  if (!dnsCheckOn()) return { status: 'OK' }
  try {
    return (await hasMailRecords(domain, opts.lookup ?? injected ?? SYSTEM_DNS, opts.timeoutMs ?? DNS_TIMEOUT_MS)) ? { status: 'OK' } : { status: 'REJECT', key: 'err.email_domain' }
  } catch (e) {
    return { status: 'UNVERIFIED', reason: (e as { code?: string }).code === 'ETIMEOUT_LOCAL' || (e as { code?: string }).code === 'ETIMEOUT' ? 'DNS_TIMEOUT' : 'DNS_ERROR' }
  }
}
