import type { Payload } from 'payload'
import { isUniqueViolation, recordActivity } from '../../activity'
import { matchAccount, matchContact, openIdentityReview, sameNameOtherContacts } from '../../identity'
import { emailKey } from '../../normalize'
import { activeFromLedger, type LedgerRow } from '../../suppression'
import { claimForProcessing, LEASE_MS, recordReplay } from './claim'
import { sha256Hex, verifyTypeformSignature } from './verify'
import { parseTypeformDelivery, type ParsedDelivery } from './parse'
import type { IntakeConfig } from './config'

/**
 * Typeform → CRM intake (CRM-1 §21, §42; E0.1 §10 persistence-first).
 *
 *   verify signature on raw bytes ──✗──▶ 401, nothing stored
 *        │✓
 *   parse JSON ──✗──▶ store QUARANTINED_MALFORMED (keyed by body hash), 200
 *        │
 *   envelope / form id ──✗──▶ store QUARANTINED_UNSUPPORTED, 200
 *        │
 *   (TYPEFORM, event_id) seen?
 *        ├─ same body hash ──▶ no-op (reprocess only if the earlier attempt failed), 200
 *        └─ different hash ──▶ record conflict, open review, never apply, 200
 *        │ new
 *   store intake event (RECEIVED)                       ◀── persisted before anything else
 *        │
 *   RFQ for (form_id, response token) exists? ──▶ link, DUPLICATE_OF_EXISTING_SUBMISSION, 200
 *        │ no
 *   create RFQ (no links yet)                           ◀── RFQ persisted before matching
 *        │
 *   items · contact match/create · account match · reviews · tasks
 *        │
 *   mark PROCESSED / PROCESSED_WITH_REVIEW, 200
 *
 * Any failure after the intake event is stored marks it FAILED_RETRYABLE and returns 500, so Typeform
 * retries; every later step is idempotent, so a retry completes the work without duplicating it.
 *
 * Nothing here sends a notification. Logs carry codes and non-personal identifiers only.
 */

export type IngestInput = {
  rawBody: string | Uint8Array
  signature: string | null | undefined
  config: IntakeConfig
  receivedAt?: Date
}

export type IngestOutcome =
  | 'REJECTED_SIGNATURE'
  | 'QUARANTINED_MALFORMED'
  | 'QUARANTINED_UNSUPPORTED'
  | 'DUPLICATE_DELIVERY_NOOP'
  | 'CONFLICTING_REPLAY_QUARANTINED'
  | 'DUPLICATE_SUBMISSION_LINKED'
  | 'PROCESSED'
  | 'PROCESSED_WITH_REVIEW'
  | 'FAILED_RETRYABLE'

export type IngestResult = {
  status: number
  outcome: IngestOutcome
  code?: string
  intakeEventId?: string
  rfqId?: string
  rfqNumber?: string
}

type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const server = (extra: Doc = {}) => ({ crmServer: { ...extra } })

/** The only logging this module does: an allowlisted, non-personal record. */
export function intakeLog(
  payload: Payload,
  level: 'info' | 'warn' | 'error',
  entry: {
    code: string
    event_id?: string | null
    form_id?: string | null
    outcome?: string
    status?: number
    payload_sha256?: string
  },
): void {
  const safe: Doc = { scope: 'crm.intake.typeform', code: entry.code }
  for (const k of ['event_id', 'form_id', 'outcome', 'status', 'payload_sha256'] as const)
    if (entry[k] !== undefined) safe[k] = entry[k]
  payload.logger[level](safe)
}

async function storeQuarantine(
  payload: Payload,
  input: {
    eventId: string
    hash: string
    state: 'QUARANTINED_MALFORMED' | 'QUARANTINED_UNSUPPORTED'
    code: string
    formId?: string | null
    eventType?: string | null
    raw: unknown
    receivedAt: Date
  },
): Promise<string> {
  const existing = await payload.find({
    collection: 'crm-intake-events',
    where: {
      and: [{ source_system: { equals: 'TYPEFORM' } }, { source_event_id: { equals: input.eventId } }],
    },
    limit: 1,
    ...sys,
  })
  if (existing.docs[0]) return String(existing.docs[0].id)
  try {
    const doc = await payload.create({
      collection: 'crm-intake-events',
      data: {
        source_system: 'TYPEFORM',
        source_event_id: input.eventId,
        source_event_type: input.eventType ?? null,
        source_form_id: input.formId ?? null,
        signature_state: 'VERIFIED',
        raw_payload_hash: input.hash,
        raw_payload: input.raw as never,
        received_at: input.receivedAt.toISOString(),
        processing_state: input.state,
        failure_code: input.code,
        replay_count: 0,
      } as never,
      context: server(),
      ...sys,
    })
    return String(doc.id)
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const again = await payload.find({
      collection: 'crm-intake-events',
      where: {
        and: [{ source_system: { equals: 'TYPEFORM' } }, { source_event_id: { equals: input.eventId } }],
      },
      limit: 1,
      ...sys,
    })
    return String(again.docs[0]!.id)
  }
}

export async function ingestTypeformDelivery(payload: Payload, input: IngestInput): Promise<IngestResult> {
  const receivedAt = input.receivedAt ?? new Date()
  const { config } = input

  // 1. Authenticity first, on the exact bytes. Nothing is stored for an unverified body.
  const sig = verifyTypeformSignature(input.rawBody, input.signature, config.secret)
  if (!sig.ok) {
    intakeLog(payload, 'warn', { code: sig.reason, status: 401, outcome: 'REJECTED_SIGNATURE' })
    return { status: 401, outcome: 'REJECTED_SIGNATURE', code: sig.reason }
  }
  const hash = sha256Hex(input.rawBody)
  const text = typeof input.rawBody === 'string' ? input.rawBody : Buffer.from(input.rawBody).toString('utf8')

  // 2. Parse. A signed body that is not JSON is kept as evidence, keyed by its hash.
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    const id = await storeQuarantine(payload, {
      eventId: `sha256:${hash}`,
      hash,
      state: 'QUARANTINED_MALFORMED',
      code: 'NOT_JSON',
      raw: { unparsed_body_sha256: hash },
      receivedAt,
    })
    intakeLog(payload, 'warn', {
      code: 'NOT_JSON',
      payload_sha256: hash,
      outcome: 'QUARANTINED_MALFORMED',
      status: 200,
    })
    return { status: 200, outcome: 'QUARANTINED_MALFORMED', code: 'NOT_JSON', intakeEventId: id }
  }
  const parsed = parseTypeformDelivery(json, config.fieldMap)
  if (!parsed.ok) {
    const eventId = parsed.eventId ?? `sha256:${hash}`
    const state =
      parsed.code === 'UNSUPPORTED_EVENT_TYPE' ? 'QUARANTINED_UNSUPPORTED' : 'QUARANTINED_MALFORMED'
    const id = await storeQuarantine(payload, {
      eventId,
      hash,
      state,
      code: parsed.code,
      raw: json,
      receivedAt,
    })
    intakeLog(payload, 'warn', { code: parsed.code, event_id: parsed.eventId, outcome: state, status: 200 })
    return { status: 200, outcome: state, code: parsed.code, intakeEventId: id }
  }
  const d = parsed.value
  if (d.formId !== config.formId) {
    const id = await storeQuarantine(payload, {
      eventId: d.eventId,
      hash,
      state: 'QUARANTINED_UNSUPPORTED',
      code: 'FORM_ID_NOT_CONFIGURED',
      formId: d.formId,
      eventType: d.eventType,
      raw: json,
      receivedAt,
    })
    intakeLog(payload, 'warn', {
      code: 'FORM_ID_NOT_CONFIGURED',
      event_id: d.eventId,
      form_id: d.formId,
      outcome: 'QUARANTINED_UNSUPPORTED',
      status: 200,
    })
    return {
      status: 200,
      outcome: 'QUARANTINED_UNSUPPORTED',
      code: 'FORM_ID_NOT_CONFIGURED',
      intakeEventId: id,
    }
  }

  // 3. Transport idempotency on the source event identity.
  const prior = await payload.find({
    collection: 'crm-intake-events',
    where: { and: [{ source_system: { equals: 'TYPEFORM' } }, { source_event_id: { equals: d.eventId } }] },
    limit: 1,
    ...sys,
  })
  let intake = prior.docs[0] as unknown as Doc | undefined
  if (intake) {
    if (intake.raw_payload_hash !== hash) {
      await payload.update({
        collection: 'crm-intake-events',
        id: String(intake.id),
        data: {
          conflicting_deliveries: [
            ...((intake.conflicting_deliveries ?? []) as Doc[]).map((r) => ({
              raw_payload_hash: r.raw_payload_hash,
              received_at: r.received_at,
            })),
            { raw_payload_hash: hash, received_at: receivedAt.toISOString() },
          ],
        } as never,
        context: server(),
        ...sys,
      })
      await openIdentityReview(payload, {
        subject_type: 'INTAKE_EVENT',
        reason: 'INTAKE_CONFLICTING_PAYLOAD',
        subject_ids: [String(intake.id)],
        dedupe_key: `intake-conflict:${d.eventId}`,
        intake_event: String(intake.id),
        rfq: intake.rfq ? String(intake.rfq) : null,
      })
      intakeLog(payload, 'warn', {
        code: 'CONFLICTING_REPLAY',
        event_id: d.eventId,
        outcome: 'CONFLICTING_REPLAY_QUARANTINED',
        status: 200,
      })
      return { status: 200, outcome: 'CONFLICTING_REPLAY_QUARANTINED', intakeEventId: String(intake.id) }
    }
    await recordReplay(payload, String(intake.id), receivedAt)
    // Finished (or quarantined) events are a no-op. An unfinished one is completed only by whoever wins the
    // atomic claim — a concurrent duplicate, or a retry while the first attempt is still running, is not.
    const unfinished =
      intake.processing_state === 'FAILED_RETRYABLE' || intake.processing_state === 'PROCESSING'
    if (!unfinished || !(await claimForProcessing(payload, String(intake.id), receivedAt))) {
      intakeLog(payload, 'info', {
        code: 'DUPLICATE_DELIVERY',
        event_id: d.eventId,
        outcome: 'DUPLICATE_DELIVERY_NOOP',
        status: 200,
      })
      return {
        status: 200,
        outcome: 'DUPLICATE_DELIVERY_NOOP',
        intakeEventId: String(intake.id),
        rfqId: intake.rfq ? String(intake.rfq) : undefined,
      }
    }
    // An earlier attempt stopped part-way and this delivery holds the claim: complete it idempotently.
  } else {
    try {
      intake = (await payload.create({
        collection: 'crm-intake-events',
        data: {
          source_system: 'TYPEFORM',
          source_event_id: d.eventId,
          source_event_type: d.eventType,
          source_form_id: d.formId,
          source_response_token: d.responseToken,
          signature_state: 'VERIFIED',
          raw_payload_hash: hash,
          raw_payload: json as never,
          received_at: receivedAt.toISOString(),
          // The creator holds the processing claim from the moment the row exists.
          processing_state: 'PROCESSING',
          processing_lease_until: new Date(receivedAt.getTime() + LEASE_MS).toISOString(),
          replay_count: 0,
        } as never,
        context: server(),
        ...sys,
      })) as unknown as Doc
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      // A concurrent delivery of the same event won the insert. Treat this one as the duplicate it is.
      intakeLog(payload, 'info', {
        code: 'DUPLICATE_DELIVERY_RACE',
        event_id: d.eventId,
        outcome: 'DUPLICATE_DELIVERY_NOOP',
        status: 200,
      })
      return { status: 200, outcome: 'DUPLICATE_DELIVERY_NOOP' }
    }
  }
  const intakeId = String(intake.id)

  try {
    const result = await processIntake(payload, intakeId, d, hash, receivedAt)
    intakeLog(payload, 'info', {
      code: 'INTAKE_DONE',
      event_id: d.eventId,
      outcome: result.outcome,
      status: 200,
    })
    return { status: 200, ...result, intakeEventId: intakeId }
  } catch (err) {
    await payload
      .update({
        collection: 'crm-intake-events',
        id: intakeId,
        data: {
          processing_state: 'FAILED_RETRYABLE',
          failure_code: (err as { name?: string })?.name ?? 'ERROR',
        } as never,
        context: server(),
        ...sys,
      })
      .catch(() => undefined)
    intakeLog(payload, 'error', {
      code: 'INTAKE_PROCESSING_FAILED',
      event_id: d.eventId,
      outcome: 'FAILED_RETRYABLE',
      status: 500,
    })
    return {
      status: 500,
      outcome: 'FAILED_RETRYABLE',
      code: 'INTAKE_PROCESSING_FAILED',
      intakeEventId: intakeId,
    }
  }
}

/** Content fingerprint: flags a possible repeat inquiry for review. It never suppresses an RFQ. */
export const contentFingerprint = (d: ParsedDelivery): string | null => {
  const key = d.mapped.email ? emailKey(d.mapped.email)?.matchKey : null
  if (!key) return null
  return sha256Hex(
    [
      key,
      (d.mapped.message ?? '').replace(/\s+/g, ' ').trim().toLowerCase(),
      d.context.product_slug ?? '',
    ].join('|'),
  )
}

async function processIntake(
  payload: Payload,
  intakeId: string,
  d: ParsedDelivery,
  hash: string,
  receivedAt: Date,
): Promise<Pick<IngestResult, 'outcome' | 'rfqId' | 'rfqNumber'>> {
  const submissionKey = `${d.formId}:${d.responseToken}`
  const reviewReasons: string[] = []
  let suppressionScopes: string[] = []

  // 4. Business uniqueness: one RFQ per submitted response, whatever the transport did.
  const existingRfq = await payload.find({
    collection: 'crm-rfqs',
    where: { submission_key: { equals: submissionKey } },
    limit: 1,
    ...sys,
  })
  let rfq = existingRfq.docs[0] as unknown as Doc | undefined
  if (rfq && String(rfq.intake_event) !== intakeId) {
    await payload.update({
      collection: 'crm-intake-events',
      id: intakeId,
      data: {
        processing_state: 'DUPLICATE_OF_EXISTING_SUBMISSION',
        rfq: String(rfq.id),
        processed_at: new Date().toISOString(),
      } as never,
      context: server(),
      ...sys,
    })
    return {
      outcome: 'DUPLICATE_SUBMISSION_LINKED',
      rfqId: String(rfq.id),
      rfqNumber: String(rfq.rfq_number),
    }
  }

  const fingerprint = contentFingerprint(d)
  // 5. Persist the RFQ before any matching, linking or task creation.
  if (!rfq) {
    try {
      rfq = (await payload.create({
        collection: 'crm-rfqs',
        data: {
          source_system: 'TYPEFORM',
          status: 'RECEIVED',
          submitted: {
            first_name: d.mapped.first_name,
            last_name: d.mapped.last_name ?? null,
            email: d.mapped.email,
            phone: d.mapped.phone,
            company: d.mapped.company,
            country_code: d.mapped.country_code,
            message: d.mapped.message,
            other_answers: Object.keys(d.mapped.other).length ? d.mapped.other : null,
          },
        } as never,
        context: server({
          received_at: receivedAt.toISOString(),
          submitted_at: d.submittedAt,
          source_form_id: d.formId,
          source_event_id: d.eventId,
          client_submission_id: d.responseToken,
          submission_key: submissionKey,
          raw_payload_hash: hash,
          content_fingerprint: fingerprint,
          intake_event: intakeId,
          contact_match_state: 'NOT_ATTEMPTED',
          account_match_state: 'NOT_ATTEMPTED',
          attribution: {
            page_path: d.context.page_path ?? null,
            cta_placement: d.context.cta_placement ?? null,
            utm_source: d.context.utm_source ?? null,
            utm_medium: d.context.utm_medium ?? null,
            utm_campaign: d.context.utm_campaign ?? null,
            utm_term: d.context.utm_term ?? null,
            utm_content: d.context.utm_content ?? null,
          },
        }),
        ...sys,
      })) as unknown as Doc
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const again = await payload.find({
        collection: 'crm-rfqs',
        where: { submission_key: { equals: submissionKey } },
        limit: 1,
        ...sys,
      })
      rfq = again.docs[0] as unknown as Doc
    }
    await payload.update({
      collection: 'crm-intake-events',
      id: intakeId,
      data: { rfq: String(rfq.id) } as never,
      context: server(),
      ...sys,
    })
  }
  const rfqId = String(rfq.id)
  await recordActivity(
    { payload },
    {
      type: 'INTAKE_RECEIVED',
      event_name: 'ics.rfq.submitted',
      summary: 'Typeform submission received and verified',
      idempotency_key: `intake-received:${intakeId}`,
      rfq: rfqId,
      detail: { source_event_id: d.eventId },
      actor_kind: 'INTEGRATION',
    },
  )

  // 6. Item (only when the page supplied product context or the form mapped item facts).
  const hasItemFacts =
    d.context.product_slug ||
    d.context.product_id ||
    d.mapped.requested_quantity !== null ||
    d.mapped.requested_scope
  if (hasItemFacts) {
    const items = await payload.find({
      collection: 'crm-rfq-items',
      where: { rfq: { equals: rfqId } },
      limit: 1,
      ...sys,
    })
    if (items.docs.length === 0) {
      let productId: string | null = null
      if (d.context.product_slug) {
        const exact = await payload.find({
          collection: 'products',
          where: { slug: { equals: d.context.product_slug } },
          limit: 2,
          ...sys,
          select: { slug: true },
        })
        if (exact.docs.length === 1) productId = String(exact.docs[0]!.id)
      }
      await payload
        .create({
          collection: 'crm-rfq-items',
          data: {
            rfq: rfqId,
            line_no: 1,
            product_id_source: d.context.product_id ?? null,
            product_slug_source: d.context.product_slug ?? null,
            product_path_source: d.context.product_path ?? null,
            product_title_source: d.context.product_title ?? null,
            product: productId,
            requested_quantity: d.mapped.requested_quantity,
            requested_scope: d.mapped.requested_scope,
            provenance: {
              source_system: 'TYPEFORM',
              source_event_id: d.eventId,
              verification_state: 'UNVERIFIED',
            },
          } as never,
          context: server(),
          ...sys,
        })
        .catch((err) => {
          // A concurrent processor created line 1 first; (rfq, line_no) is unique, so this is the same item.
          if (!isUniqueViolation(err)) throw err
        })
    }
  }
  if (d.contextRejected.length > 0) reviewReasons.push('CONTEXT_REJECTED')

  // 7. Identity — only if not already done by an earlier attempt.
  if (rfq.contact_match_state === 'NOT_ATTEMPTED') {
    const link: Doc = {}
    if (!d.fieldMapPresent) {
      link.contact_match_state = 'FIELD_MAPPING_MISSING'
      link.account_match_state = 'NOT_ATTEMPTED'
      reviewReasons.push('FIELD_MAPPING_MISSING')
    } else {
      const key = d.mapped.email ? emailKey(d.mapped.email) : null
      if (!key) {
        link.contact_match_state = 'NO_VALID_EMAIL'
        link.account_match_state = 'NOT_ATTEMPTED'
        reviewReasons.push('NO_VALID_EMAIL')
      } else {
        const account = await matchAccount(payload, key.domain, d.mapped.company)
        const cm = await matchContact(payload, key, d.mapped)
        let contactId: string | null
        let contactAccount: string | null
        let contactConfidence = 'UNKNOWN'
        if (cm.kind === 'MATCHED_EXACT_EMAIL' && cm.nameConflict) {
          // Ambiguous identity (Control Tower amendment B, now applied to intake as to manual inquiries): the
          // address is known but the name is not the stored one. The RFQ stays UNLINKED from the contact and a
          // person decides; nothing is overwritten and nothing is merged. Do-not-contact is still honoured by
          // the submitted address (workspace queries look it up when no contact is linked).
          contactId = null
          contactAccount = null
          link.contact_match_state = 'NOT_ATTEMPTED'
          reviewReasons.push('EMAIL_MATCH_NAME_MISMATCH')
          await openIdentityReview(payload, {
            subject_type: 'CONTACT',
            reason: 'EMAIL_MATCH_NAME_MISMATCH',
            subject_ids: [cm.contactId, rfqId],
            dedupe_key: `email-name-mismatch:${rfqId}`,
            contact: cm.contactId,
            rfq: rfqId,
          })
        } else if (cm.kind === 'MATCHED_EXACT_EMAIL') {
          contactId = cm.contactId
          contactAccount = cm.contact.account ? String(cm.contact.account) : null
          contactConfidence = String(cm.contact.account_link_confidence ?? 'UNKNOWN')
          link.contact_match_state = 'MATCHED_EXACT_EMAIL'
        } else {
          const created = await payload
            .create({
              collection: 'crm-contacts',
              data: {
                email: key.canonical,
                email_original: key.original,
                first_name: d.mapped.first_name,
                last_name: d.mapped.last_name,
                display_name: d.mapped.full_name,
                phones: d.mapped.phone ? [{ number_raw: d.mapped.phone, kind: 'UNKNOWN' }] : [],
                company_name_original: d.mapped.company,
                country_code: d.mapped.country_code,
                account: account.kind === 'MATCHED_VERIFIED_DOMAIN' ? account.accountId : null,
                account_link_confidence:
                  account.kind === 'MATCHED_VERIFIED_DOMAIN' ? 'HIGH_CONFIDENCE' : 'UNKNOWN',
                relationship_evidence: 'RFQ_REQUEST',
                marketing_eligibility: 'UNKNOWN',
                provenance: {
                  source_system: 'TYPEFORM',
                  source_event_id: d.eventId,
                  source_record_id: d.responseToken,
                  first_seen_at: receivedAt.toISOString(),
                  verification_state: 'UNVERIFIED',
                },
              } as never,
              context: server(),
              ...sys,
            })
            .catch(async (err) => {
              // Created concurrently by another delivery: use it, do not create a second.
              if (!isUniqueViolation(err)) throw err
              const again = await payload.find({
                collection: 'crm-contacts',
                where: { email_match_key: { equals: key.matchKey } },
                limit: 1,
                ...sys,
              })
              return again.docs[0]!
            })
          contactId = String(created.id)
          contactAccount = account.kind === 'MATCHED_VERIFIED_DOMAIN' ? account.accountId : null
          link.contact_match_state = 'CREATED_NEW_CONTACT'
          const sameName = await sameNameOtherContacts(
            payload,
            d.mapped.first_name,
            d.mapped.last_name,
            key.matchKey,
          )
          if (sameName.length > 0) {
            reviewReasons.push('SAME_NAME_DIFFERENT_EMAIL')
            await openIdentityReview(payload, {
              subject_type: 'CONTACT',
              reason: 'SAME_NAME_DIFFERENT_EMAIL',
              subject_ids: [contactId, ...sameName],
              dedupe_key: `same-name:${contactId}`,
              contact: contactId,
              rfq: rfqId,
            })
          }
        }
        if (contactId) link.contact = contactId
        // Do-not-contact is honoured, never altered: intake records that a suppression is active (no address,
        // no reason text) so the record shows it; it never clears one or changes marketing eligibility.
        const suppressions = activeFromLedger(
          (
            await payload.find({
              collection: 'crm-suppressions',
              where: { email_match_key: { equals: key.matchKey } },
              limit: 1000,
              pagination: false,
              ...sys,
            })
          ).docs as unknown as LedgerRow[],
        )
        suppressionScopes = [...new Set(suppressions.map((x) => String(x.scope)))].sort()

        // Account for the RFQ: a deterministic domain match, or the contact's existing strong link.
        if (account.kind === 'MATCHED_VERIFIED_DOMAIN') {
          if (contactId && contactAccount && contactAccount !== account.accountId) {
            link.account_match_state = 'CONTACT_ACCOUNT_CONFLICT_REVIEW'
            reviewReasons.push('CONTACT_ACCOUNT_CONFLICT')
            await openIdentityReview(payload, {
              subject_type: 'CONTACT',
              reason: 'CONTACT_ACCOUNT_CONFLICT',
              subject_ids: [contactId, contactAccount, account.accountId] as string[],
              dedupe_key: `contact-account-conflict:${rfqId}`,
              contact: contactId,
              account: account.accountId,
              rfq: rfqId,
            })
          } else {
            link.account = account.accountId
            link.account_match_state = 'MATCHED_VERIFIED_DOMAIN'
            if (contactId && !contactAccount && cm.kind === 'MATCHED_EXACT_EMAIL')
              // Fill an UNKNOWN link with deterministic evidence; never replace an existing one.
              await payload.update({
                collection: 'crm-contacts',
                id: contactId,
                data: { account: account.accountId, account_link_confidence: 'HIGH_CONFIDENCE' } as never,
                context: server(),
                ...sys,
              })
          }
        } else if (account.kind === 'AMBIGUOUS_REVIEW') {
          link.account_match_state = 'AMBIGUOUS_REVIEW'
          reviewReasons.push('VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS')
          await openIdentityReview(payload, {
            subject_type: 'ACCOUNT',
            reason: 'VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS',
            subject_ids: account.accountIds,
            dedupe_key: `domain-ambiguous:${key.domain}`,
            rfq: rfqId,
          })
        } else {
          link.account_match_state = account.kind === 'FREE_EMAIL_DOMAIN' ? 'FREE_EMAIL_DOMAIN' : 'NO_MATCH'
          if (contactId && contactAccount && ['VERIFIED', 'HIGH_CONFIDENCE'].includes(contactConfidence))
            link.account = contactAccount
          if (account.kind === 'NO_MATCH' && account.companyNameCandidates.length > 0) {
            reviewReasons.push('COMPANY_NAME_MATCH_UNVERIFIED')
            await openIdentityReview(payload, {
              subject_type: 'ACCOUNT',
              reason: 'COMPANY_NAME_MATCH_UNVERIFIED',
              subject_ids: [rfqId, ...account.companyNameCandidates],
              dedupe_key: `company-name:${rfqId}`,
              rfq: rfqId,
            })
          }
        }
      }
    }
    // 8. Possible repeat inquiry: flagged, never discarded (E0.1).
    if (fingerprint) {
      const same = await payload.find({
        collection: 'crm-rfqs',
        where: { and: [{ content_fingerprint: { equals: fingerprint } }, { id: { not_equals: rfqId } }] },
        limit: 5,
        ...sys,
      })
      if (same.docs.length > 0) {
        reviewReasons.push('POSSIBLE_DUPLICATE_SUBMISSION')
        await openIdentityReview(payload, {
          subject_type: 'RFQ',
          reason: 'POSSIBLE_DUPLICATE_SUBMISSION',
          subject_ids: [rfqId, ...same.docs.map((r) => String(r.id))],
          dedupe_key: `rfq-fingerprint:${rfqId}`,
          rfq: rfqId,
        })
      }
    }
    if (reviewReasons.length > 0) link.status = 'NEEDS_REVIEW'
    rfq = (await payload.update({
      collection: 'crm-rfqs',
      id: rfqId,
      data: link as never,
      context: server(),
      ...sys,
    })) as unknown as Doc
  }

  const reviewed = rfq.status === 'NEEDS_REVIEW'
  await payload.update({
    collection: 'crm-intake-events',
    id: intakeId,
    data: {
      processing_state: reviewed ? 'PROCESSED_WITH_REVIEW' : 'PROCESSED',
      processed_at: new Date().toISOString(),
      failure_code: null,
      normalized_summary: {
        field_map_present: d.fieldMapPresent,
        mapped_fields: Object.entries(d.mapped)
          .filter(([k, v]) => k !== 'other' && v !== null)
          .map(([k]) => k),
        other_answer_keys: Object.keys(d.mapped.other),
        unmapped_refs: d.unmappedRefs,
        context_keys: Object.keys(d.context),
        context_rejected: d.contextRejected,
        review_reasons: reviewReasons,
        contact_match_state: rfq.contact_match_state,
        account_match_state: rfq.account_match_state,
        suppression_active: suppressionScopes.length > 0,
        suppression_scopes: suppressionScopes,
      },
    } as never,
    context: server(),
    ...sys,
  })
  return {
    outcome: reviewed ? 'PROCESSED_WITH_REVIEW' : 'PROCESSED',
    rfqId,
    rfqNumber: String(rfq.rfq_number),
  }
}
