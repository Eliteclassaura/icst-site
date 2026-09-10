import type { Payload } from 'payload'

/**
 * Postgres-backed sliding-window limiter on the `rate-events` collection (R56: Payload 3 has no built-in
 * limiter). Keys are hashes, never raw IPs or emails. Limits mirror the legacy send.php constants.
 */
export const LIMITS = {
  requestsPerIpPerHour: 20,
  sendsPerIpPerHour: 5,
  sendsPerDayGlobal: 200,
  dedupeWindowSeconds: 900,
} as const

export type RateScope = 'request' | 'send' | 'global' | 'dedupe'

export async function countEvents(
  payload: Payload,
  scope: RateScope,
  key: string,
  sinceMs: number,
  now: Date,
) {
  const res = await payload.count({
    collection: 'rate-events',
    where: {
      and: [
        { scope: { equals: scope } },
        { key: { equals: key } },
        { at: { greater_than: new Date(now.getTime() - sinceMs).toISOString() } },
      ],
    },
    overrideAccess: true,
  })
  return res.totalDocs
}

export async function recordEvent(payload: Payload, scope: RateScope, key: string, now: Date) {
  await payload.create({
    collection: 'rate-events',
    data: { scope, key, at: now.toISOString() },
    overrideAccess: true,
  })
}

export type LimitCheck =
  { allowed: true } | { allowed: false; reason: 'ip-requests' | 'ip-sends' | 'global-sends' }

/** Called before any work: records the request and refuses when a window is full. */
export async function checkRequestLimits(payload: Payload, ipHash: string, now: Date): Promise<LimitCheck> {
  const hour = 3_600_000
  const day = 86_400_000
  const [reqs, sends, global] = await Promise.all([
    countEvents(payload, 'request', ipHash, hour, now),
    countEvents(payload, 'send', ipHash, hour, now),
    countEvents(payload, 'global', 'sends', day, now),
  ])
  await recordEvent(payload, 'request', ipHash, now)
  if (reqs >= LIMITS.requestsPerIpPerHour) return { allowed: false, reason: 'ip-requests' }
  if (sends >= LIMITS.sendsPerIpPerHour) return { allowed: false, reason: 'ip-sends' }
  if (global >= LIMITS.sendsPerDayGlobal) return { allowed: false, reason: 'global-sends' }
  return { allowed: true }
}

/** Same email + same brief within the window is the double-click / retry case: answer success, create nothing. */
export async function isDuplicate(payload: Payload, dedupeKey: string, now: Date): Promise<boolean> {
  const n = await countEvents(payload, 'dedupe', dedupeKey, LIMITS.dedupeWindowSeconds * 1000, now)
  return n > 0
}

export async function recordSend(payload: Payload, ipHash: string, dedupeKey: string, now: Date) {
  await Promise.all([
    recordEvent(payload, 'send', ipHash, now),
    recordEvent(payload, 'global', 'sends', now),
    recordEvent(payload, 'dedupe', dedupeKey, now),
  ])
}
