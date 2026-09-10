/**
 * Trusted client address (C8). Rate limits and dedupe keys are only as good as the address they key on,
 * and `x-forwarded-for` is caller-supplied: trusting it unconditionally lets anyone mint a fresh bucket
 * per request by changing one header. So the trust source is configuration, not a guess.
 *
 *   TRUSTED_PROXY=cloudflare  → `cf-connecting-ip` only (the edge overwrites it; XFF is ignored)
 *   TRUSTED_PROXY=xff         → the FIRST entry of `x-forwarded-for` (a proxy that overwrites the header)
 *   TRUSTED_PROXY=xff-last    → the LAST entry (a proxy that appends; the nearest hop is the trustworthy one)
 *   unset / none              → no header is trusted; every request keys on one shared bucket
 *
 * The `none` fallback is deliberately strict rather than permissive: an unconfigured deployment throttles
 * everyone together (visible, annoying, safe) instead of throttling nobody (invisible, comfortable, wrong).
 */
export type TrustedProxy = 'cloudflare' | 'xff' | 'xff-last' | 'none'

export function trustedProxyMode(env: NodeJS.ProcessEnv = process.env): TrustedProxy {
  const v = (env.TRUSTED_PROXY ?? '').trim().toLowerCase()
  if (v === 'cloudflare' || v === 'xff' || v === 'xff-last') return v
  return 'none'
}

/** The sentinel used when no header may be trusted. Not an address: a single shared bucket. */
export const UNTRUSTED_BUCKET = 'untrusted-shared-bucket'

type HeaderLike = { get(name: string): string | null }

export function clientIp(headers: HeaderLike, env: NodeJS.ProcessEnv = process.env): string {
  const mode = trustedProxyMode(env)
  if (mode === 'cloudflare') return clean(headers.get('cf-connecting-ip')) ?? UNTRUSTED_BUCKET
  if (mode === 'xff' || mode === 'xff-last') {
    const parts = (headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const pick = mode === 'xff' ? parts[0] : parts[parts.length - 1]
    return clean(pick) ?? UNTRUSTED_BUCKET
  }
  return UNTRUSTED_BUCKET
}

/** Rejects anything that is not a plausible address, so a header cannot smuggle a key-space separator. */
function clean(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  if (!/^[0-9a-fA-F:.]{3,45}$/.test(s)) return null
  return s
}
