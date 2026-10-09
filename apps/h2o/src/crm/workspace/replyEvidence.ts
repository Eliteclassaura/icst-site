import type { Where } from 'payload'
import { asUser, type CrmSession } from './session'

/**
 * OPP-2: which inquiries have a human reply on record. A finished first-response task is not evidence on its own
 * (someone can tick it off). Evidence is either an outbound email the system recorded as sent, or a call, meeting or
 * email a person logged on the inquiry. A queued, failed or not-sent reply does not count, and neither does an
 * acknowledgement the system sent by itself. Reads only; this module never touches a send path.
 */
export const HUMAN_CONTACT_TYPES = ['CALL', 'MEETING', 'EMAIL_REFERENCE'] as const

type Doc = Record<string, unknown>
const relOf = (v: unknown): string | null => (v ? String(typeof v === 'object' ? (v as Doc).id : v) : null)

/** Every distinct inquiry id the query matches, paging through all results (a non-admin read is capped per page). */
async function inquiriesMatching(s: CrmSession, collection: 'crm-email-messages' | 'crm-activities', where: Where): Promise<Set<string>> {
  const out = new Set<string>()
  for (let page = 1; page < 200; page++) {
    const res = await s.payload.find({ collection, where, page, limit: 100, depth: 0, select: { rfq: true } as never, ...asUser(s) })
    for (const d of res.docs as unknown as Doc[]) {
      const r = relOf(d.rfq)
      if (r) out.add(r)
    }
    if (!res.hasNextPage) break
  }
  return out
}

export async function repliedRfqIds(s: CrmSession, rfqIds: string[]): Promise<Set<string>> {
  if (rfqIds.length === 0) return new Set()
  const [sent, logged] = await Promise.all([
    inquiriesMatching(s, 'crm-email-messages', { and: [{ rfq: { in: rfqIds } }, { direction: { equals: 'OUTBOUND' } }, { status: { equals: 'SENT' } }] }),
    inquiriesMatching(s, 'crm-activities', { and: [{ rfq: { in: rfqIds } }, { type: { in: [...HUMAN_CONTACT_TYPES] } }] }),
  ])
  return new Set([...sent, ...logged])
}
