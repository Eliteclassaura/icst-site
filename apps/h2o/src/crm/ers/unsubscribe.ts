import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'
import { relId } from '../guards'
import { activeFromLedger, type LedgerRow } from '../suppression'

/**
 * Revenue Engine slice 1: one-click unsubscribe (RFC 8058; the floor — always honoured, whatever the toggles say).
 *
 * Every sequence email carries a link (and, when the toggle is on, the List-Unsubscribe / List-Unsubscribe-Post
 * headers) with an opaque token "<enrollment id>.<hmac>". The token names no address and cannot be forged: the HMAC key
 * is derived from PAYLOAD_SECRET for this purpose only. A valid token, by one-click POST or by the confirmation page,
 * records an UNSUBSCRIBED suppression for the contact's address (marketing scope: transactional mail about an open
 * request still works), which stops every live enrollment for that address (ledger hook, crm/ers/engine.ts).
 * Idempotent: a second click finds the same suppression (source event = the enrollment).
 */
let key: { root: string; k: Buffer } | null = null
function macKey(): Buffer {
  const root = process.env.PAYLOAD_SECRET ?? ''
  if (!root) throw new Error('[h2o] unsubscribe links need PAYLOAD_SECRET. The value itself is never logged.')
  if (!key || key.root !== root) key = { root, k: Buffer.from(hkdfSync('sha256', root, 'h2o-ers-v1', 'h2o-ers-unsubscribe', 32)) }
  return key.k
}
const mac = (id: string) => createHmac('sha256', macKey()).update(`unsubscribe:${id}`).digest('base64url').slice(0, 32)

const ID = /^[0-9a-f-]{36}$/i
export const unsubscribeToken = (enrollmentId: string): string => `${enrollmentId}.${mac(enrollmentId)}`

export function verifyUnsubscribeToken(token: unknown): string | null {
  if (typeof token !== 'string' || token.length > 100) return null
  const [id, sig] = token.split('.')
  if (!id || !sig || !ID.test(id)) return null
  const want = Buffer.from(mac(id))
  const got = Buffer.from(sig)
  return got.length === want.length && timingSafeEqual(got, want) ? id : null
}

export const unsubscribeUrl = (enrollmentId: string, base = process.env.NEXT_PUBLIC_SERVER_URL ?? ''): string =>
  `${base.replace(/\/+$/, '')}/api/ers/unsubscribe/?t=${encodeURIComponent(unsubscribeToken(enrollmentId))}`

export type UnsubscribeOutcome = 'UNSUBSCRIBED' | 'ALREADY' | 'INVALID'

/** Record the unsubscribe (persisted before the caller answers 200). */
export async function unsubscribeByToken(payload: Payload, token: unknown, method: 'ONE_CLICK' | 'PAGE'): Promise<UnsubscribeOutcome> {
  const id = verifyUnsubscribeToken(token)
  if (!id) return 'INVALID'
  const enrollment = (await payload.findByID({ collection: 'crm-enrollments', id, depth: 0, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null
  if (!enrollment) return 'INVALID'
  const contactId = relId(enrollment.contact)
  if (!contactId) return 'INVALID'
  const contact = (await payload.findByID({ collection: 'crm-contacts', id: contactId, depth: 0, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null
  const matchKey = typeof contact?.email_match_key === 'string' ? contact.email_match_key : null
  if (!matchKey) return 'INVALID'
  // SEC-CRM-1: "already unsubscribed" means an UNSUBSCRIBED suppression is ACTIVE now for this address — not merely
  // that one was recorded once (an admin may have cleared it since). A new click after a clear records a new row.
  const ledger = (
    await payload.find({ collection: 'crm-suppressions', where: { email_match_key: { equals: matchKey } }, limit: 1000, pagination: false, depth: 0, overrideAccess: true })
  ).docs as unknown as LedgerRow[]
  if (activeFromLedger(ledger).some((r) => r.reason === 'UNSUBSCRIBED')) return 'ALREADY'
  const used = new Set(ledger.map((r) => r.source_event_id).filter(Boolean))
  const eventId = used.has(`unsubscribe:${id}`) ? `unsubscribe:${id}:${used.size}` : `unsubscribe:${id}`
  await payload.create({
    collection: 'crm-suppressions',
    data: { contact: contactId, action: 'APPLY', reason: 'UNSUBSCRIBED', source: 'RFC8058_ENDPOINT', source_event_id: eventId, evidence_ref: method } as never,
    depth: 0,
    overrideAccess: true,
    context: { crmServer: {} },
  })
  return 'UNSUBSCRIBED'
}
