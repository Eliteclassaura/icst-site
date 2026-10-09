/**
 * ENGINE-SCOPE-1b — enrollment identity (ER-02 / ER-10, review Q4). An enrollment is identified by FOUR separate things,
 * never one merged key:
 *   purpose  what the sequence is for (RFQ response, quote follow-up, relationship, cohort, publication);
 *   scope    what it is about (an inquiry, a deal, an account, a list, a publication slot);
 *   cycle    which time round it is for that purpose and scope (1, then 2 after a genuine new event);
 *   content version  the sequence version it started on (kept on the row; not part of the identity).
 * The unique `coalesce_key` is `sequence:contact:purpose:scopeKind:scopeRef:cycle`. A replay (the same request, a retried
 * webhook, a double click) has the same event reference and dedupes; a NEW genuine event of the same scope, after the
 * earlier enrollment has ended, is the next cycle. Pure functions only; the write is in `ers/create.ts`.
 */
export const ENROLLMENT_PURPOSE = ['RFQ_RESPONSE', 'QUOTE_FOLLOWUP', 'RELATIONSHIP', 'COHORT', 'PUBLICATION'] as const
export type EnrollmentPurpose = (typeof ENROLLMENT_PURPOSE)[number]
export const SCOPE_KIND = ['RFQ', 'DEAL', 'ACCOUNT', 'LIST', 'PUBLICATION_SLOT'] as const
export type ScopeKind = (typeof SCOPE_KIND)[number]

/** An inquiry anchors a response and a quote follow-up (CT ruling). Relationship, cohort and publication programs need none. */
export const purposeNeedsRfq = (p: string): boolean => p === 'RFQ_RESPONSE' || p === 'QUOTE_FOLLOWUP'

export type Identity = { sequenceId: string; contactId: string; purpose: EnrollmentPurpose; scopeKind: ScopeKind; scopeRef: string }

/** Everything except the cycle: the thing a replay and a re-entry are compared on. */
export const identityBase = (i: Identity): string => [i.sequenceId, i.contactId, i.purpose, i.scopeKind, i.scopeRef].join(':')
export const coalesceKey = (i: Identity, cycle: number): string => `${identityBase(i)}:${cycle}`

/** The scope an inquiry-based enrollment has today (every enrollment before this change is this). */
export const rfqIdentity = (sequenceId: string, contactId: string, rfqId: string): Identity => ({
  sequenceId,
  contactId,
  purpose: 'RFQ_RESPONSE',
  scopeKind: 'RFQ',
  scopeRef: rfqId,
})

/** The scope a monthly publication slot has: one enrollment per subscriber per slot. */
export const slotIdentity = (sequenceId: string, contactId: string, program: string, slot: number, publicationId: string): Identity => ({
  sequenceId,
  contactId,
  purpose: 'PUBLICATION',
  scopeKind: 'PUBLICATION_SLOT',
  scopeRef: `${program}:${slot}:${publicationId}`,
})
