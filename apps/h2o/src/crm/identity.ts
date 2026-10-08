import type { Payload } from 'payload'
import { isUniqueViolation } from './activity'
import { recordActivity } from './activity'
import { ensureSystemTask } from './tasks'
import { addressQualityOf } from './address-quality'
import { companyKey, isConsumerDomain, nameKey, type EmailKey } from './normalize'
import { VERIFIED_DOMAIN_STATUSES } from './vocabulary'

/**
 * Conservative identity resolution (CRM-1 §22, E0.1 §03).
 *
 * Deterministic links only:
 *   - Contact: exact `email_match_key` (lowercase address; no alias folding).
 *   - Account: the email domain equals a VERIFIED_OWNED / VERIFIED_ALIAS domain on exactly one account,
 *     and the domain is not a consumer mailbox provider.
 *
 * Everything else — similar names, similar company strings, a candidate domain, two accounts claiming a
 * domain, an email that matches but a name that does not — keeps the records apart and opens a review.
 * Nothing here merges, and nothing here overwrites a fact already on a record.
 */

type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }

export type ContactMatch =
  | { kind: 'MATCHED_EXACT_EMAIL'; contactId: string; contact: Doc; nameConflict: boolean }
  | { kind: 'NO_MATCH' }

export async function matchContact(
  payload: Payload,
  key: EmailKey,
  submitted: { first_name?: string | null; last_name?: string | null },
): Promise<ContactMatch> {
  const res = await payload.find({
    collection: 'crm-contacts',
    where: { email_match_key: { equals: key.matchKey } },
    limit: 2,
    ...sys,
  })
  if (res.docs.length === 0) return { kind: 'NO_MATCH' }
  const contact = res.docs[0] as unknown as Doc
  const existingName = nameKey(contact.first_name, contact.last_name)
  const submittedName = nameKey(submitted.first_name, submitted.last_name)
  return {
    kind: 'MATCHED_EXACT_EMAIL',
    contactId: String(contact.id),
    contact,
    nameConflict: existingName !== null && submittedName !== null && existingName !== submittedName,
  }
}

/** Other contacts with the same normalised name but a different address — flagged, never merged. */
export async function sameNameOtherContacts(
  payload: Payload,
  first: string | null,
  last: string | null,
  excludeKey: string,
): Promise<string[]> {
  const key = nameKey(first, last)
  if (!key || !first || !last) return []
  const res = await payload.find({
    collection: 'crm-contacts',
    where: {
      and: [
        { first_name: { like: first } },
        { last_name: { like: last } },
        { email_match_key: { not_equals: excludeKey } },
      ],
    },
    limit: 20,
    ...sys,
  })
  return res.docs
    .filter((d) => nameKey((d as unknown as Doc).first_name, (d as unknown as Doc).last_name) === key)
    .map((d) => String(d.id))
}

export type AccountMatch =
  | { kind: 'MATCHED_VERIFIED_DOMAIN'; accountId: string }
  | { kind: 'AMBIGUOUS_REVIEW'; accountIds: string[] }
  | { kind: 'FREE_EMAIL_DOMAIN' }
  | { kind: 'NO_MATCH'; companyNameCandidates: string[] }

export async function matchAccount(
  payload: Payload,
  emailDomain: string,
  submittedCompany: string | null,
): Promise<AccountMatch> {
  // Free mail, ICS's own domains, disposable inboxes and provider typos never match an account (CT 2026-10-05).
  if (isConsumerDomain(emailDomain) || addressQualityOf(emailDomain)) return { kind: 'FREE_EMAIL_DOMAIN' }
  const res = await payload.find({
    collection: 'crm-accounts',
    where: { 'domains.domain': { equals: emailDomain } },
    limit: 10,
    ...sys,
  })
  const verified = res.docs.filter((a) =>
    (((a as unknown as Doc).domains ?? []) as Doc[]).some(
      (r) =>
        r.domain === emailDomain &&
        (VERIFIED_DOMAIN_STATUSES as readonly string[]).includes(String(r.domain_status)),
    ),
  )
  if (verified.length === 1) return { kind: 'MATCHED_VERIFIED_DOMAIN', accountId: String(verified[0]!.id) }
  if (verified.length > 1) return { kind: 'AMBIGUOUS_REVIEW', accountIds: verified.map((a) => String(a.id)) }
  // No verified domain. A company string that equals an account name is a *candidate*, never a link.
  const ck = companyKey(submittedCompany)
  if (!ck || !submittedCompany) return { kind: 'NO_MATCH', companyNameCandidates: [] }
  const byName = await payload.find({
    collection: 'crm-accounts',
    where: {
      or: [{ canonical_name: { like: submittedCompany } }, { 'aliases.alias': { like: submittedCompany } }],
    },
    limit: 10,
    ...sys,
  })
  const candidates = byName.docs
    .filter((a) => {
      const d = a as unknown as Doc
      return (
        companyKey(d.canonical_name) === ck ||
        ((d.aliases ?? []) as Doc[]).some((x) => companyKey(x.alias) === ck)
      )
    })
    .map((a) => String(a.id))
  return { kind: 'NO_MATCH', companyNameCandidates: candidates }
}

export type ReviewInput = {
  subject_type: 'CONTACT' | 'ACCOUNT' | 'SITE' | 'ASSET' | 'RFQ' | 'INTAKE_EVENT'
  reason:
    | 'EMAIL_MATCH_NAME_MISMATCH'
    | 'SAME_NAME_DIFFERENT_EMAIL'
    | 'VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS'
    | 'COMPANY_NAME_MATCH_UNVERIFIED'
    | 'CONTACT_ACCOUNT_CONFLICT'
    | 'POSSIBLE_DUPLICATE_SUBMISSION'
    | 'INTAKE_CONFLICTING_PAYLOAD'
    | 'GENERIC_SHARED_INBOX'
    | 'SUSPECT_ADDRESS_DOMAIN'
    | 'NAME_CONTAINED_LINK'
  subject_ids: string[]
  dedupe_key: string
  contact?: string | null
  account?: string | null
  rfq?: string | null
  intake_event?: string | null
}

/** Open (once) an identity review and its review task. Idempotent on `dedupe_key`. */
export async function openIdentityReview(
  payload: Payload,
  input: ReviewInput,
  /** Wave 1: an import opens reviews without creating review tasks (no automatic tasks from an import). */
  opts: { withTask?: boolean } = {},
): Promise<'OPENED' | 'ALREADY_OPEN'> {
  const existing = await payload.find({
    collection: 'crm-identity-reviews',
    where: { dedupe_key: { equals: input.dedupe_key } },
    limit: 1,
    ...sys,
  })
  if (existing.docs.length > 0) return 'ALREADY_OPEN'
  let reviewId: string
  try {
    const created = await payload.create({
      collection: 'crm-identity-reviews',
      data: {
        subject_type: input.subject_type,
        reason: input.reason,
        state: 'OPEN',
        subject_ids: input.subject_ids,
        dedupe_key: input.dedupe_key,
        contact: input.contact ?? null,
        account: input.account ?? null,
        rfq: input.rfq ?? null,
        intake_event: input.intake_event ?? null,
      } as never, // canonical_id is filled by the collection hook
      context: { crmServer: {} },
      ...sys,
    })
    reviewId = String(created.id)
  } catch (err) {
    if (isUniqueViolation(err)) return 'ALREADY_OPEN'
    throw err
  }
  const req = { payload, user: null }
  await recordActivity(req, {
    type: 'IDENTITY_REVIEW_OPENED',
    summary: `Identity review opened: ${input.reason}`,
    idempotency_key: `identity-review:${input.dedupe_key}`,
    contact: input.contact ?? null,
    account: input.account ?? null,
    rfq: input.rfq ?? null,
    detail: { reason: input.reason },
    actor_kind: 'SYSTEM',
  })
  if (opts.withTask === false) return 'OPENED'
  await ensureSystemTask(req, {
    kind: 'IDENTITY_REVIEW',
    title: `Identity review: ${input.reason}`,
    priority: 'NORMAL',
    idempotency_key: `identity-review-task:${input.dedupe_key}`,
    source_rule: 'CRM1_IDENTITY_REVIEW',
    identity_review: reviewId,
    rfq: input.rfq ?? null,
    contact: input.contact ?? null,
    account: input.account ?? null,
  })
  return 'OPENED'
}
