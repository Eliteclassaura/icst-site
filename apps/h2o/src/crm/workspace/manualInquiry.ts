import { isUniqueViolation } from '../activity'
import { matchAccount, matchContact, openIdentityReview, sameNameOtherContacts, type ReviewInput } from '../identity'
import { emailKey } from '../normalize'
import { createFollowUp, fromError, type Outcome } from './mutations'
import { asUser, type CrmSession } from './session'
import { email as emailField, isUuid, line, oneOf, phone as phoneField, relationshipId, text, type FieldErrors } from './validate'

/**
 * Manual New Inquiry (UI-1 MVP). Staff record an inquiry received by phone, email or in person, without
 * waiting for native public forms.
 *
 *   - Provenance: `source_system = MANUAL_ENTRY`, entered by the signed-in user; receipt fields are set by
 *     the server. Customer-supplied values live in `submitted.*`; the staff classification is `motion`.
 *   - No product ids and no plant/account relationships are fabricated: the RFQ has no items, and links are
 *     made only by the accepted CRM-1 deterministic rules (exact email → contact; verified domain → account).
 *   - Control Tower amendment B: when identity is ambiguous the inquiry is saved UNLINKED. Where the CRM-1
 *     model already has a review reason for the ambiguity, an identity review is opened (no parallel system).
 *   - Double submit: a one-time form token becomes the RFQ `submission_key` (unique). A second submission
 *     of the same form returns the RFQ created by the first.
 *   - Nothing is sent to the customer.
 */

const MOTIONS = ['NEW_TOWER', 'REBUILD_REPLACEMENT', 'REPAIR', 'UPGRADE_RETROFIT', 'MAINTENANCE_INSPECTION', 'PARTS', 'OTHER_APPROVED'] as const
type Doc = Record<string, unknown>

export type ManualInquiryInput = {
  token: unknown
  firstName?: unknown
  lastName?: unknown
  company?: unknown
  email?: unknown
  phone?: unknown
  message?: unknown
  motion?: unknown
  assigneeId?: unknown
  followUpTitle?: unknown
  followUpDue?: unknown
}

export type ManualNotice = keyof typeof MANUAL_NOTICE_TEXT
export type ManualInquiryResult = Outcome & { notices?: ManualNotice[] }

/** Fixed notices shown after a manual create. Only these codes are ever rendered (no text from the URL). */
export const MANUAL_NOTICE_TEXT = {
  IDENTITY_NOT_RUN: 'Identity matching could not run. The inquiry is saved unlinked.',
  NO_EMAIL_NO_CONTACT: 'Saved without a contact record: CRM contacts are identified by email.',
  CONTACT_LINKED: 'Linked to the existing contact with this email address.',
  EMAIL_NAME_MISMATCH: 'An existing contact uses this email with a different name. Nothing is merged or linked; flagged for identity review.',
  SAME_NAME: 'Another contact has the same name with a different email. Nothing is merged; flagged for identity review.',
  CONTACT_ACCOUNT_CONFLICT: 'The contact and the email domain point to different accounts. Saved unlinked; flagged for identity review.',
  ACCOUNT_LINKED_DOMAIN: 'Linked to the account that owns this verified email domain.',
  DOMAIN_AMBIGUOUS: 'This email domain is verified on more than one account. Saved unlinked; flagged for identity review.',
  ACCOUNT_LINKED_CONTACT: 'Linked to the account already verified for this contact.',
  COMPANY_SIMILAR: 'A similar company name exists. Not linked automatically; flagged for identity review.',
  FOLLOW_UP_NOT_CREATED: 'The follow-up could not be created. Add it from the inquiry.',
  NOTHING_SENT: 'Nothing is sent to the customer.',
} as const

export const MANUAL_KEY_PREFIX = 'MANUAL_ENTRY:'

export function validateManualInquiry(input: ManualInquiryInput) {
  const fields: FieldErrors = {}
  const em = emailField(input.email)
  const ph = phoneField(input.phone)
  if (!em.ok) fields.email = 'Enter a complete email address, or leave it empty.'
  if (!ph.ok) fields.phone = 'Enter a complete phone number (7–15 digits), or leave it empty.'
  const email = em.ok ? em.value : null
  const phone = ph.ok ? ph.value : null
  if (em.ok && ph.ok && !email && !phone) {
    fields.email = 'Add an email address or a phone number.'
    fields.phone = 'Add a phone number or an email address.'
  }
  const message = text(input.message, 5000)
  if (!message) fields.message = 'Describe what the customer asked for.'
  const motion = input.motion ? oneOf(input.motion, MOTIONS) : null
  if (input.motion && !motion) fields.motion = 'Choose a listed interest.'
  const assignee = relationshipId(input.assigneeId)
  if (!assignee.ok) fields.assigneeId = 'Choose a valid owner.'
  const followUpTitle = line(input.followUpTitle, 160)
  const followUpDue = typeof input.followUpDue === 'string' && input.followUpDue ? input.followUpDue : null
  if (followUpTitle && !followUpDue) fields.followUpDue = 'Choose a due date for the follow-up.'
  if (followUpDue && !followUpTitle) fields.followUpTitle = 'Give the follow-up a title.'
  return {
    fields,
    values: {
      token: isUuid(input.token) ? String(input.token).toLowerCase() : null,
      firstName: line(input.firstName, 80),
      lastName: line(input.lastName, 80),
      company: line(input.company, 160),
      email,
      phone,
      message,
      motion,
      assigneeId: assignee.ok ? assignee.id : null,
      followUpTitle,
      followUpDue,
    },
  }
}

async function existingByKey(s: CrmSession, key: string): Promise<string | null> {
  // Trusted lookup: `submission_key` is admin-read-only, but the idempotency check must see it.
  const hit = await s.payload.find({
    collection: 'crm-rfqs',
    where: { submission_key: { equals: key } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  return hit.docs[0] ? String(hit.docs[0].id) : null
}

export async function createManualInquiry(s: CrmSession, input: ManualInquiryInput, now: Date = new Date()): Promise<ManualInquiryResult> {
  const { fields, values: v } = validateManualInquiry(input)
  if (!v.token) return { ok: false, code: 'INVALID_TOKEN', message: 'This form expired. Reload the page and enter the inquiry again.' }
  if (Object.keys(fields).length) return { ok: false, code: 'VALIDATION', message: 'Add a way to reach the customer and describe the request.', fields }

  const key = `${MANUAL_KEY_PREFIX}${v.token}`
  const already = await existingByKey(s, key)
  if (already) return { ok: true, id: already, message: 'This inquiry was already created.' }

  let rfqId: string
  try {
    const created = await s.payload.create({
      collection: 'crm-rfqs',
      data: {
        source_system: 'MANUAL_ENTRY',
        status: 'RECEIVED',
        motion: v.motion,
        assignee: v.assigneeId,
        submitted: {
          first_name: v.firstName,
          last_name: v.lastName,
          email: v.email,
          phone: v.phone,
          company: v.company,
          message: v.message,
        },
      } as never,
      // Receipt fields are server-decided; the person creating the record is still the actor (audit).
      context: {
        crmServer: {
          submission_key: key,
          client_submission_id: v.token,
          received_at: now.toISOString(),
          contact_match_state: 'NOT_ATTEMPTED',
          account_match_state: 'NOT_ATTEMPTED',
        },
      },
      depth: 0,
      ...asUser(s),
    })
    rfqId = String(created.id)
  } catch (err) {
    if (isUniqueViolation(err)) {
      const again = await existingByKey(s, key)
      if (again) return { ok: true, id: again, message: 'This inquiry was already created.' }
    }
    return fromError(err)
  }

  const notices: ManualNotice[] = []
  try {
    notices.push(...(await linkIdentity(s, rfqId, v)))
  } catch {
    notices.push('IDENTITY_NOT_RUN')
  }

  if (v.followUpTitle && v.followUpDue) {
    const fu = await createFollowUp(s, { rfqId, title: v.followUpTitle, due: v.followUpDue, assigneeId: v.assigneeId ?? undefined })
    if (!fu.ok) notices.push('FOLLOW_UP_NOT_CREATED')
  }
  notices.push('NOTHING_SENT')
  return { ok: true, id: rfqId, message: 'Inquiry created.', notices }
}

/**
 * CRM-1 deterministic identity rules, applied as trusted server code after the RFQ exists (the same
 * order as the Typeform ingest: persist first, then link). Returns person-readable notices.
 */
async function linkIdentity(
  s: CrmSession,
  rfqId: string,
  v: ReturnType<typeof validateManualInquiry>['values'],
): Promise<ManualNotice[]> {
  const p = s.payload
  const sys = { overrideAccess: true as const, depth: 0 }
  const notices: ManualNotice[] = []
  const link: Doc = {}
  const reviews: ReviewInput[] = []
  const key = v.email ? emailKey(v.email) : null

  if (!key) {
    link.contact_match_state = 'NO_VALID_EMAIL'
    link.account_match_state = 'NOT_ATTEMPTED'
    notices.push('NO_EMAIL_NO_CONTACT')
  } else {
    const account = await matchAccount(p, key.domain, v.company)
    const cm = await matchContact(p, key, { first_name: v.firstName, last_name: v.lastName })
    let contactId: string | null = null
    let contactAccount: string | null = null
    let contactConfidence = 'UNKNOWN'
    if (cm.kind === 'MATCHED_EXACT_EMAIL' && !cm.nameConflict) {
      contactId = cm.contactId
      contactAccount = cm.contact.account ? String(cm.contact.account) : null
      contactConfidence = String(cm.contact.account_link_confidence ?? 'UNKNOWN')
      link.contact = contactId
      link.contact_match_state = 'MATCHED_EXACT_EMAIL'
      notices.push('CONTACT_LINKED')
    } else if (cm.kind === 'MATCHED_EXACT_EMAIL') {
      // Amendment B: same email, different name → ambiguous → stays unlinked, flagged for review.
      link.contact_match_state = 'NOT_ATTEMPTED'
      reviews.push({
        subject_type: 'CONTACT',
        reason: 'EMAIL_MATCH_NAME_MISMATCH',
        subject_ids: [cm.contactId, rfqId],
        dedupe_key: `email-name-mismatch:${rfqId}`,
        contact: cm.contactId,
        rfq: rfqId,
      })
      notices.push('EMAIL_NAME_MISMATCH')
    } else {
      const created = await p
        .create({
          collection: 'crm-contacts',
          data: {
            email: key.canonical,
            email_original: key.original,
            first_name: v.firstName,
            last_name: v.lastName,
            display_name: [v.firstName, v.lastName].filter(Boolean).join(' ') || null,
            phones: v.phone ? [{ number_raw: v.phone, kind: 'UNKNOWN' }] : [],
            company_name_original: v.company,
            account: account.kind === 'MATCHED_VERIFIED_DOMAIN' ? account.accountId : null,
            account_link_confidence: account.kind === 'MATCHED_VERIFIED_DOMAIN' ? 'HIGH_CONFIDENCE' : 'UNKNOWN',
            relationship_evidence: 'RFQ_REQUEST',
            marketing_eligibility: 'UNKNOWN',
            provenance: { source_system: 'MANUAL_ENTRY', verification_state: 'UNVERIFIED' },
          } as never,
          context: { crmServer: {} },
          ...sys,
        })
        .catch(async (err) => {
          if (!isUniqueViolation(err)) throw err
          const again = await p.find({ collection: 'crm-contacts', where: { email_match_key: { equals: key.matchKey } }, limit: 1, ...sys })
          return again.docs[0]!
        })
      contactId = String(created.id)
      contactAccount = account.kind === 'MATCHED_VERIFIED_DOMAIN' ? account.accountId : null
      link.contact = contactId
      link.contact_match_state = 'CREATED_NEW_CONTACT'
      const sameName = await sameNameOtherContacts(p, v.firstName, v.lastName, key.matchKey)
      if (sameName.length > 0) {
        reviews.push({
          subject_type: 'CONTACT',
          reason: 'SAME_NAME_DIFFERENT_EMAIL',
          subject_ids: [contactId, ...sameName],
          dedupe_key: `same-name:${contactId}`,
          contact: contactId,
          rfq: rfqId,
        })
        notices.push('SAME_NAME')
      }
    }

    if (account.kind === 'MATCHED_VERIFIED_DOMAIN') {
      if (contactAccount && contactAccount !== account.accountId) {
        link.account_match_state = 'CONTACT_ACCOUNT_CONFLICT_REVIEW'
        reviews.push({
          subject_type: 'CONTACT',
          reason: 'CONTACT_ACCOUNT_CONFLICT',
          subject_ids: [String(contactId), contactAccount, account.accountId],
          dedupe_key: `contact-account-conflict:${rfqId}`,
          contact: contactId,
          account: account.accountId,
          rfq: rfqId,
        })
        notices.push('CONTACT_ACCOUNT_CONFLICT')
      } else {
        link.account = account.accountId
        link.account_match_state = 'MATCHED_VERIFIED_DOMAIN'
        notices.push('ACCOUNT_LINKED_DOMAIN')
      }
    } else if (account.kind === 'AMBIGUOUS_REVIEW') {
      link.account_match_state = 'AMBIGUOUS_REVIEW'
      reviews.push({
        subject_type: 'ACCOUNT',
        reason: 'VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS',
        subject_ids: account.accountIds,
        dedupe_key: `domain-ambiguous:${key.domain}`,
        rfq: rfqId,
      })
      notices.push('DOMAIN_AMBIGUOUS')
    } else {
      link.account_match_state = account.kind === 'FREE_EMAIL_DOMAIN' ? 'FREE_EMAIL_DOMAIN' : 'NO_MATCH'
      if (contactAccount && ['VERIFIED', 'HIGH_CONFIDENCE'].includes(contactConfidence)) {
        link.account = contactAccount
        notices.push('ACCOUNT_LINKED_CONTACT')
      }
      if (account.kind === 'NO_MATCH' && account.companyNameCandidates.length > 0) {
        reviews.push({
          subject_type: 'ACCOUNT',
          reason: 'COMPANY_NAME_MATCH_UNVERIFIED',
          subject_ids: [rfqId, ...account.companyNameCandidates],
          dedupe_key: `company-name:${rfqId}`,
          rfq: rfqId,
        })
        notices.push('COMPANY_SIMILAR')
      }
    }
  }

  for (const r of reviews) await openIdentityReview(p, r)
  if (reviews.length > 0) link.status = 'NEEDS_REVIEW'
  await p.update({ collection: 'crm-rfqs', id: rfqId, data: link as never, context: { crmServer: {} }, ...sys })
  return notices
}
