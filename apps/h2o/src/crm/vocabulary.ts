/**
 * H2O / ICS CRM-1 — controlled vocabulary.
 *
 * Every enum here is either copied **verbatim** from an accepted Revenue Engine authority (the source is
 * named beside it) or is a CRM-1 operational taxonomy that no authority defines, in which case it says so.
 * Nothing here is invented to make a screen look complete.
 *
 * `UNKNOWN` is a first-class member wherever the authority has one. A missing fact is never defaulted to
 * a value that asserts something (`0`, `USD`, `OTHER`, `ACTIVE`, `ELIGIBLE`, today's date).
 */

/** Fixed tenant key. One deployment, one database per client (Factory rule); recorded for future isolation. */
export const TENANT = 'ICS' as const

/** E0.1 R1 `03_ACCOUNT_MATCHING_AND_ENRICHMENT_CONTRACT.md` — confidence vocabulary. */
export const LINK_CONFIDENCE = ['VERIFIED', 'HIGH_CONFIDENCE', 'LOW_CONFIDENCE', 'UNKNOWN'] as const

/** E0.1 R1 §Domain normalization — account domain status. */
export const ACCOUNT_DOMAIN_STATUS = ['VERIFIED_OWNED', 'VERIFIED_ALIAS', 'CANDIDATE', 'RETIRED'] as const
export const VERIFIED_DOMAIN_STATUSES = ['VERIFIED_OWNED', 'VERIFIED_ALIAS'] as const

/** E0.1 `account.schema.json`. */
export const STRATEGIC_TIER = ['TIER_1', 'TIER_2', 'TIER_3', 'UNRATED'] as const
export const RELATIONSHIP_STATE = [
  'VERIFIED_CUSTOMER',
  'VERIFIED_PAST_CUSTOMER',
  'PROSPECT',
  'CANDIDATE',
  'UNKNOWN',
] as const
export const ACCOUNT_STATE = ['ACTIVE', 'DORMANT', 'ARCHIVED', 'MERGED'] as const

/** E0.1 `contact.schema.json`. */
export const CONTACT_FIT_STATE = ['MEGA_INDUSTRIAL_FIT', 'LIKELY_FIT', 'UNKNOWN', 'NON_CORE'] as const
export const RECORD_STATE = ['ACTIVE', 'ARCHIVED', 'MERGED'] as const
/** IMPORT-TYPEFORM-1: past quote requests imported read-only (owner, CT 2026-10-08). */
export const HISTORICAL_INQUIRY_SOURCE = ['TYPEFORM_LEGACY'] as const
/** History, not work: closed with an unknown outcome; never in an RFQ queue. */
export const HISTORICAL_INQUIRY_STATE = ['HISTORICAL_CLOSED_UNKNOWN'] as const

/**
 * CRM-1 operational taxonomy (no authority enumerates it). A *function*, never a job title and never an
 * authority claim; UNKNOWN when not evidenced.
 */
export const CONTACT_FUNCTION = [
  'ENGINEERING_TECHNICAL',
  'PLANT_OPERATIONS',
  'MAINTENANCE_RELIABILITY',
  'PROCUREMENT_SOURCING',
  'PROJECT_MANAGEMENT',
  'EXECUTIVE_MANAGEMENT',
  'EPC_CONSULTANT_THIRD_PARTY',
  'OTHER',
  'UNKNOWN',
] as const

export const PHONE_KIND = ['PRIMARY', 'MOBILE', 'OFFICE', 'OTHER', 'UNKNOWN'] as const

/** E0.1 `suppression_state_machine.json` orthogonal dimensions. */
export const MARKETING_ELIGIBILITY = ['ELIGIBLE', 'INELIGIBLE', 'UNKNOWN', 'REVIEW_REQUIRED'] as const
export const JURISDICTION = [
  'VERIFIED_US',
  'VERIFIED_JAPAN',
  'VERIFIED_MALAYSIA',
  'VERIFIED_VIETNAM',
  // ERS slice 1 (CT 2026-10-05): Thailand gets its own value (TH office, PDPA).
  'VERIFIED_THAILAND',
  'VERIFIED_OTHER',
  'COUNTRY_UNKNOWN',
  'LEGAL_REVIEW_REQUIRED',
] as const
export const RELATIONSHIP_EVIDENCE = [
  'EXPLICIT_OPT_IN',
  'RFQ_REQUEST',
  'ACTIVE_CUSTOMER',
  'PAST_CUSTOMER',
  'DIRECT_BUSINESS_RELATIONSHIP',
  'PROFESSIONAL_CONTACT',
  'NON_PERSONAL_BUSINESS_ADDRESS',
  'OTHER_VERIFIED',
  'NONE',
  'UNKNOWN',
] as const
export const MESSAGE_PURPOSE = [
  'PERSONAL',
  'ACCOUNT_RELATIONSHIP',
  'SALES_RECONNECT',
  'SEQUENCE_OUTREACH',
  'BROADCAST',
  'TRANSACTIONAL',
] as const

/** E0.1 `suppression_state_machine.json` `suppression_reasons`, with their precedence (1 = strongest). */
export const SUPPRESSION_REASON = [
  'DO_NOT_CONTACT',
  'LEGAL_PROHIBITION',
  'COMPLAINT',
  'HARD_BOUNCE',
  'INVALID_ADDRESS',
  'UNSUBSCRIBED',
  'MANUAL_SUPPRESSION',
  'SOFT_BOUNCE_HOLD',
] as const
export type SuppressionReason = (typeof SUPPRESSION_REASON)[number]
export const SUPPRESSION_PRECEDENCE: Record<SuppressionReason, number> = {
  DO_NOT_CONTACT: 1,
  LEGAL_PROHIBITION: 1,
  COMPLAINT: 2,
  HARD_BOUNCE: 3,
  INVALID_ADDRESS: 3,
  UNSUBSCRIBED: 4,
  MANUAL_SUPPRESSION: 5,
  SOFT_BOUNCE_HOLD: 6,
}
/** CRM-1 scope names. E0.1 `rfc8058_handling.scope_default` is MARKETING_EMAIL. */
export const SUPPRESSION_SCOPE = ['MARKETING_EMAIL', 'ALL_EMAIL', 'ALL_OUTREACH'] as const
export const SUPPRESSION_ACTION = ['APPLY', 'CLEAR'] as const
export const SUPPRESSION_SOURCE = [
  'MANUAL',
  'PROVIDER_EVENT',
  'RFC8058_ENDPOINT',
  'LEGACY_IMPORT',
  'LEGAL_REVIEW',
  'SYSTEM',
] as const
/** E0.1: "Never auto-clear" — clearing requires explicit re-consent plus privileged review. */
export const REASONS_REQUIRING_RECONSENT_TO_CLEAR: readonly SuppressionReason[] = [
  'COMPLAINT',
  'UNSUBSCRIBED',
]
/** E0.1: "A separately verified replacement address is a new address identity and does not erase old suppression." */
export const REASONS_NEVER_CLEARABLE: readonly SuppressionReason[] = ['HARD_BOUNCE', 'INVALID_ADDRESS']

/** E0.1 `site.schema.json`. */
export const SITE_STATE = ['ACTIVE', 'INACTIVE', 'UNKNOWN'] as const

/** E0.1 `asset.schema.json`. */
export const ASSET_CONDITION_STATE = [
  'NORMAL',
  'WATCH',
  'REPAIR_CANDIDATE',
  'UPGRADE_CANDIDATE',
  'REBUILD_CANDIDATE',
  'REPLACEMENT_CANDIDATE',
  'UNKNOWN',
] as const
export const ASSET_STATE = ['ACTIVE', 'RETIRED', 'UNKNOWN'] as const
/** The technical facts on an asset that must each carry evidence when non-null (E1.2 evidence discipline). */
export const ASSET_TECHNICAL_FACTS = [
  'manufacturer',
  'model',
  'tower_type',
  'material',
  'cell_count',
  'commissioned_year',
  'condition_state',
] as const
export type AssetTechnicalFact = (typeof ASSET_TECHNICAL_FACTS)[number]
export const EVIDENCE_VERIFICATION = ['VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN'] as const

/** E0.1 `opportunity.schema.json` — frozen. */
export const OPPORTUNITY_MOTION = [
  'NEW_TOWER',
  'REBUILD_REPLACEMENT',
  'REPAIR',
  'UPGRADE_RETROFIT',
  'MAINTENANCE_INSPECTION',
  'PARTS',
  'OTHER_APPROVED',
] as const
export type OpportunityMotion = (typeof OPPORTUNITY_MOTION)[number]

/**
 * Control Tower CRM-1 §4 lists twelve commercial motions. They subdivide the frozen E0.1 motions; each maps
 * to exactly one of them and `motion_detail` must agree with `motion` (enforced in the opportunity hook).
 */
export const MOTION_DETAIL_TO_MOTION = {
  NEW_LARGE_MEGA_TOWER: 'NEW_TOWER',
  MAJOR_REBUILD_REPLACEMENT: 'REBUILD_REPLACEMENT',
  REPAIR: 'REPAIR',
  THERMAL_UPGRADE: 'UPGRADE_RETROFIT',
  MECHANICAL_UPGRADE: 'UPGRADE_RETROFIT',
  STRUCTURAL_UPGRADE: 'UPGRADE_RETROFIT',
  PERFORMANCE_UPGRADE_RETROFIT: 'UPGRADE_RETROFIT',
  MAINTENANCE: 'MAINTENANCE_INSPECTION',
  INSPECTION: 'MAINTENANCE_INSPECTION',
  COOLING_TOWER_PARTS: 'PARTS',
  CRITICAL_SPARES: 'PARTS',
  INSTALLED_BASE_LIFECYCLE_EXPANSION: 'OTHER_APPROVED',
} as const satisfies Record<string, OpportunityMotion>
export const MOTION_DETAIL = Object.keys(MOTION_DETAIL_TO_MOTION) as Array<
  keyof typeof MOTION_DETAIL_TO_MOTION
>

/** E0.1 `opportunity.schema.json` — frozen commercial stage. */
export const OPPORTUNITY_STAGE = [
  'NEW',
  'QUALIFYING',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'DELAYED',
  'WON',
  'LOST',
  'CANCELLED',
] as const
export type OpportunityStage = (typeof OPPORTUNITY_STAGE)[number]
export const TERMINAL_STAGES: readonly OpportunityStage[] = ['WON', 'LOST', 'CANCELLED']

/** E1.4 `project_identity.json` project types. Nullable: a parts order has no project type. */
export const PROJECT_TYPE = [
  'NEW_TOWER',
  'MAJOR_REBUILD_REPLACEMENT',
  'CAPACITY_EXPANSION_MODERNIZATION',
] as const

/** E1.4 `sequence_library.json` allowed_project_stages (union) — a project dimension, separate from `stage`. */
export const PROJECT_STAGE = [
  'EARLY_SIGNAL',
  'DISCOVERY',
  'TECHNICAL_SCOPING',
  'STAKEHOLDER_ALIGNMENT',
  'BUDGETING_OR_BUSINESS_CASE',
  'PROCUREMENT_PREPARATION',
  'DELAYED',
  'ON_HOLD',
  'NO_CURRENT_DECISION',
] as const

/** E1.4 `project_eligibility.json` project_states. */
export const PROJECT_STATE = [
  'VERIFIED_ACTIVE_CAPITAL_PROJECT',
  'VERIFIED_EARLY_PROJECT_SIGNAL',
  'VERIFIED_REBUILD_REPLACEMENT_PROJECT',
  'KNOWN_ACCOUNT_PROJECT_UNCONFIRMED',
  'ASSET_NEED_UNCONFIRMED',
  'STALE_PROJECT_SIGNAL',
  'PROJECT_ON_HOLD',
  'PROJECT_CLOSED_OR_CANCELLED',
  'UNKNOWN_PROJECT_STATUS',
] as const
/** States E1.4 requires evidence for (a `project_evidence_ref`). */
export const VERIFIED_PROJECT_STATES = [
  'VERIFIED_ACTIVE_CAPITAL_PROJECT',
  'VERIFIED_EARLY_PROJECT_SIGNAL',
  'VERIFIED_REBUILD_REPLACEMENT_PROJECT',
  'PROJECT_ON_HOLD',
] as const

/** E0.1 `opportunity.schema.json` `source_category`. */
export const SOURCE_CATEGORY = ['EMAIL_SOURCED', 'EMAIL_INFLUENCED', 'NON_EMAIL_SOURCED', 'UNKNOWN'] as const

/** E3 `opportunity_economics.json`. */
export const AMOUNT_STATUS = ['KNOWN', 'NOT_ENTERED', 'WITHHELD_OR_NOT_AVAILABLE', 'UNKNOWN'] as const
export type AmountStatus = (typeof AMOUNT_STATUS)[number]
export const OUTCOME_STATUS = ['OPEN', 'WON', 'LOST', 'CANCELLED', 'UNKNOWN'] as const
export const REVENUE_VERIFICATION_STATE = [
  'UNVERIFIED',
  'WON_EVENT_RECORDED',
  'CONFIRMED',
  'CORRECTED',
  'UNKNOWN',
] as const
/** E3 `revenue_truth.json` states. Derived, never entered. */
export const REVENUE_TRUTH_STATE = [
  'REVENUE_UNKNOWN',
  'OPPORTUNITY_VALUE_KNOWN',
  'WON_REVENUE_CONFIRMED',
  'LOST_NO_REVENUE',
  'CANCELLED_NO_REVENUE',
  'VALUE_NOT_ENTERED',
  'VALUE_WITHHELD_OR_NOT_AVAILABLE',
] as const
export type RevenueTruthState = (typeof REVENUE_TRUTH_STATE)[number]

/** E1.4 `buying_group_model.json` — verbatim. */
export const BUYING_GROUP_ROLE_CLASS = [
  'ENGINEERING_TECHNICAL',
  'PLANT_OPERATIONS',
  'MAINTENANCE_RELIABILITY',
  'PROCUREMENT_SOURCING',
  'PROJECT_MANAGEMENT',
  'EXECUTIVE_ECONOMIC_SPONSOR',
  'EPC_CONSULTANT_THIRD_PARTY_ENGINEER',
  'OTHER',
  'UNKNOWN',
] as const
export const BUYING_GROUP_MEMBERSHIP_CLASS = [
  'ACCOUNT_CONTACT',
  'PROJECT_BUYING_GROUP_MEMBER',
  'PROJECT_MEMBERSHIP_UNKNOWN',
] as const
export const BUYING_GROUP_CONFIDENCE = ['CONFIRMED', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const
export const BUYING_GROUP_VERIFICATION = ['VERIFIED', 'REVIEWED_UNVERIFIED', 'UNKNOWN'] as const

/** Record origin. `UNKNOWN` exists because a legacy row's origin can be genuinely unknown. */
/** The website intake sources: they get the sales alert and the customer acknowledgement. */
export const WEBSITE_SOURCES = ['TYPEFORM', 'NATIVE_FORM', 'NATIVE_CHAT'] as const
export const isWebsiteSource = (v: unknown): boolean => typeof v === 'string' && (WEBSITE_SOURCES as readonly string[]).includes(v)

export const SOURCE_SYSTEM = [
  'TYPEFORM',
  // Native intake (owner decision 2026-10-05: our own form and corner chat replace Typeform at launch).
  'NATIVE_FORM',
  'NATIVE_CHAT',
  'MANUAL_ENTRY',
  'LEGACY_IMPORT',
  'SYSTEM_DERIVED',
  'SYNTHETIC_FIXTURE',
  'UNKNOWN',
] as const

/**
 * RFQ lifecycle. E1.1 names `NEW_INQUIRY`, `RFQ_RECEIVED`, `RFQ_REVIEW`; E0.1 names `ics.rfq.qualified` and
 * `ics.rfq.rejected_non_core`. The CRM record keeps those meanings; no state is entered because time passed.
 */
export const RFQ_STATUS = [
  'RECEIVED',
  'NEEDS_REVIEW',
  'IN_REVIEW',
  'QUALIFIED',
  'REJECTED_NON_CORE',
  'DUPLICATE_OF_EXISTING',
  'CLOSED',
] as const
export const RFQ_QUALIFICATION_STATE = ['UNKNOWN', 'INCOMPLETE', 'COMPLETE'] as const
export const RFQ_FOLLOW_UP_STATE = ['NOT_STARTED', 'TASK_OPEN', 'HUMAN_RESPONDED', 'NOT_REQUIRED'] as const
export const CONTACT_MATCH_STATE = [
  'NOT_ATTEMPTED',
  'MATCHED_EXACT_EMAIL',
  'CREATED_NEW_CONTACT',
  'NO_VALID_EMAIL',
  'FIELD_MAPPING_MISSING',
  'MANUAL',
] as const
export const ACCOUNT_MATCH_STATE = [
  'NOT_ATTEMPTED',
  'MATCHED_VERIFIED_DOMAIN',
  'AMBIGUOUS_REVIEW',
  'FREE_EMAIL_DOMAIN',
  'NO_MATCH',
  'CONTACT_ACCOUNT_CONFLICT_REVIEW',
  'MANUAL',
] as const
/** CRM-1 never sends. The state exists so a later phase cannot mistake "not attempted" for "sent". */
export const NOTIFICATION_STATE = ['NOT_SENT_DISABLED_IN_CRM1'] as const

export const PRODUCT_RESOLUTION_STATE = [
  'NOT_SUPPLIED',
  'RESOLVED_EXACT_SLUG',
  'UNRESOLVED',
  'INVALID_CONTEXT',
] as const
export const QUANTITY_STATUS = ['KNOWN', 'NOT_SUPPLIED'] as const

/** Activity timeline taxonomy (H2O-local, because agency-core `activities` is enum-incompatible). */
export const ACTIVITY_TYPE = [
  'NOTE_ADDED',
  'CALL',
  'MEETING',
  'EMAIL_REFERENCE',
  'REPLY_REFERENCE',
  'DOCUMENT_REFERENCE',
  'PROJECT_INTERACTION',
  'INTAKE_RECEIVED',
  'RFQ_CREATED',
  'RFQ_STATUS_CHANGED',
  'RFQ_ASSIGNED',
  'OPPORTUNITY_CREATED',
  'OPPORTUNITY_STAGE_CHANGED',
  'OPPORTUNITY_OWNER_CHANGED',
  'TASK_CREATED',
  'TASK_COMPLETED',
  'TASK_REASSIGNED',
  'SUPPRESSION_RECORDED',
  'SUPPRESSION_CLEARED',
  'IDENTITY_REVIEW_OPENED',
  // CRM email M1: a system notification about this record was sent, suppressed or dead-lettered.
  'EMAIL_NOTIFICATION',
  // CRM email M2: a person wrote to the customer from the CRM (queued, sent, failed or not sent).
  'EMAIL_REPLY',
  // CRM email M3: the customer's email came back on the RFQ's reply token.
  'EMAIL_RECEIVED',
  // ERS slice 1: a sequence enrolled, sent a step, paused or stopped for this record.
  'SEQUENCE_EVENT',
] as const
export type ActivityType = (typeof ACTIVITY_TYPE)[number]
/** Only these may be entered by a person. The rest are written by the system when the thing happens. */
export const HUMAN_ACTIVITY_TYPES: readonly ActivityType[] = [
  'NOTE_ADDED',
  'CALL',
  'MEETING',
  'EMAIL_REFERENCE',
  'REPLY_REFERENCE',
  'DOCUMENT_REFERENCE',
  'PROJECT_INTERACTION',
]
export const ACTOR_KIND = ['USER', 'SYSTEM', 'INTEGRATION'] as const

export const TASK_KIND = [
  'RFQ_FIRST_RESPONSE',
  'FOLLOW_UP',
  'MISSING_INFORMATION',
  'IDENTITY_REVIEW',
  'INTAKE_REVIEW',
  'GENERAL',
  // ERS slice 1: a sequence's task step, and a sequence item a person must look at (reply, lint hold, render hold).
  'SEQUENCE_STEP',
  'SEQUENCE_REVIEW',
] as const
export const TASK_STATUS = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const
/** E1.1 names `HIGH_PRIORITY_RFQ_RESPONSE`; that is the justification for a priority field at all. */
export const TASK_PRIORITY = ['HIGH', 'NORMAL', 'LOW'] as const
export const TASK_SOURCE = ['MANUAL', 'SYSTEM_RULE', 'INTAKE'] as const

export const INTAKE_PROCESSING_STATE = [
  'PROCESSING',
  'PROCESSED',
  'PROCESSED_WITH_REVIEW',
  'DUPLICATE_OF_EXISTING_SUBMISSION',
  'QUARANTINED_MALFORMED',
  'QUARANTINED_UNSUPPORTED',
  'FAILED_RETRYABLE',
  // RFQ-FIX-1 (audit R5): a native request whose hidden field was filled; admins only, never an RFQ
  'QUARANTINED_SPAM',
  // RFQ-FIX-1.1: the sweeper gave up after SWEEP_MAX_ATTEMPTS; shown to admins on the CRM overview, never retried again
  'FAILED_PERMANENT',
] as const

export const IDENTITY_REVIEW_SUBJECT = ['CONTACT', 'ACCOUNT', 'SITE', 'ASSET', 'RFQ', 'INTAKE_EVENT'] as const
export const IDENTITY_REVIEW_REASON = [
  'EMAIL_MATCH_NAME_MISMATCH',
  'SAME_NAME_DIFFERENT_EMAIL',
  'VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS',
  'COMPANY_NAME_MATCH_UNVERIFIED',
  'CONTACT_ACCOUNT_CONFLICT',
  'POSSIBLE_DUPLICATE_SUBMISSION',
  'INTAKE_CONFLICTING_PAYLOAD',
  // E1.3 R1 AR-007: a generic/shared inbox (info@, sales@, purchasing@…) needs identity review.
  'GENERIC_SHARED_INBOX',
  'SUSPECT_ADDRESS_DOMAIN',
  // Owner ruling 2026-10-08 (legacy load): a corporate-domain contact whose name field held a web link, loaded without a name.
  'NAME_CONTAINED_LINK',
  'OTHER',
] as const
export const IDENTITY_REVIEW_STATE = [
  'OPEN',
  'CONFIRMED_DISTINCT',
  'CONFIRMED_DUPLICATE_PENDING_MERGE',
  'DISMISSED',
] as const

/** Payload `select` options from a const tuple. */
export const options = <T extends readonly string[]>(values: T) =>
  values.map((value) => ({ label: value, value }))

/** CRM email M1 — the notification outbox (collections/email-outbox.ts). */
// SEND-FIX-1a: MFA_CODE is reserved for MFA-2's emailed sign-in code (CRM-B); off until MFA-2 ships (email/config.ts)
// INTAKE_FAILED_ALERT: the internal "a quote request could not be processed" alert (auditor note on RFQ-FIX-1.1)
export const EMAIL_KIND = ['RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK', 'RFQ_REPLY', 'SEQUENCE_EMAIL', 'MFA_CODE', 'INTAKE_FAILED_ALERT'] as const
export type EmailKind = (typeof EMAIL_KIND)[number]
/**
 * PENDING → SENDING → SENT, or → RETRY (backoff) → … → DEAD. The SUPPRESSED_* states are terminal and are
 * decided before anything is sent: by the send gate (H2O_EMAIL_MODE / allowlist), by the suppression ledger,
 * by the customer-acknowledgement switch, or because there is no usable recipient.
 */
export const EMAIL_OUTBOX_STATUS = [
  'PENDING',
  'SENDING',
  'RETRY',
  'SENT',
  'DEAD',
  'SUPPRESSED_BY_MODE',
  'SUPPRESSED_BY_SUPPRESSION',
  'SUPPRESSED_ACK_DISABLED',
  'SUPPRESSED_NO_RECIPIENT',
  // Patch C: a template message whose template is not approved, or a required merge field is empty (fail closed).
  'SUPPRESSED_TEMPLATE',
  // SEND-FIX-1a (review R2-03): the attempt intent is recorded and the message is being handed to the mail server.
  // Only the worker holding the lease moves it on; an expired SUBMITTING row is never sent again (→ UNCERTAIN).
  'SUBMITTING',
  // SEND-FIX-1a: the mail server may or may not have accepted it (a failure after DATA with no reply, a crash or a
  // database failure around acceptance). Held for a person: "Delivery unconfirmed — not automatically retried".
  'UNCERTAIN',
] as const
export type EmailOutboxStatus = (typeof EMAIL_OUTBOX_STATUS)[number]
export const EMAIL_TERMINAL_STATUS: readonly EmailOutboxStatus[] = [
  'SENT',
  'DEAD',
  'SUPPRESSED_BY_MODE',
  'SUPPRESSED_BY_SUPPRESSION',
  'SUPPRESSED_ACK_DISABLED',
  'SUPPRESSED_NO_RECIPIENT',
  'SUPPRESSED_TEMPLATE',
  'UNCERTAIN',
]
export const EMAIL_EVENT = [
  'QUEUED',
  'SUPPRESSED',
  'SENT',
  'ATTEMPT_FAILED',
  'DEAD_LETTERED',
  'DIRECT_SENT',
  'DIRECT_SUPPRESSED',
  'DIRECT_FAILED',
  // SEND-FIX-1a: handed to the mail server (the attempt intent is recorded first); the outcome is unknown.
  'SUBMITTED',
  'UNCERTAIN',
] as const
export type EmailEvent = (typeof EMAIL_EVENT)[number]

/** CRM email M2/M3 — the RFQ conversation (collections/email-messages.ts). */
export const EMAIL_DIRECTION = ['OUTBOUND', 'INBOUND'] as const
/**
 * Outbound: QUEUED → SENT | FAILED; NOT_SENT when the gate or suppression stopped it before sending.
 * Inbound (M3): RECEIVED.
 */
export const EMAIL_MESSAGE_STATUS = ['QUEUED', 'SENT', 'FAILED', 'NOT_SENT', 'RECEIVED'] as const
export type EmailMessageStatus = (typeof EMAIL_MESSAGE_STATUS)[number]

/**
 * CRM email M3 — why an inbound message was not linked to an RFQ automatically. Nothing is ever linked by
 * display name, subject or sender: only a live reply token links; everything else waits for an admin.
 */
export const EMAIL_REVIEW_REASON = [
  'NO_TOKEN',
  'UNKNOWN_TOKEN',
  'EXPIRED_TOKEN',
  'MULTIPLE_TOKENS',
  'AUTO_SUBMITTED',
  'BULK',
  'SPAM',
  'OWN_ADDRESS',
  'PROCESSING_FAILED',
] as const
export type EmailReviewReason = (typeof EMAIL_REVIEW_REASON)[number]
export const EMAIL_REVIEW_STATE = ['OPEN', 'LINKED', 'DISCARDED'] as const

// ── Revenue Engine slice 1 (E0.1 primitives under the LEAN CUT; CT rulings 2026-10-05) ──────────────────────────────
/** A sequence: DRAFT until its first version is published; a running sequence is only ever paused (LEAN CUT). */
export const SEQUENCE_RUN_STATE = ['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED'] as const
export type SequenceRunState = (typeof SEQUENCE_RUN_STATE)[number]
/** E0.1 `publication_state` (REVIEW is not used: approval is AUTO, owner override). Published versions are immutable. */
export const SEQUENCE_VERSION_STATE = ['DRAFT', 'PUBLISHED', 'RETIRED'] as const
/** LEAN CUT step types: EMAIL (an approved SEQUENCE template), WAIT (N business days), TASK (for the owner). */
export const SEQUENCE_STEP_TYPE = ['EMAIL', 'WAIT', 'TASK'] as const
export type SequenceStepType = (typeof SEQUENCE_STEP_TYPE)[number]
/** E0.1 enrollment status (`sequence_runtime.schema.json`), plus AWAITING_SEND while an email step's row is queued. */
export const ENROLLMENT_STATUS = ['ACTIVE', 'AWAITING_SEND', 'PAUSED', 'COMPLETED', 'EXITED', 'DEAD_LETTER'] as const
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[number]
export const ENROLLMENT_LIVE: readonly EnrollmentStatus[] = ['ACTIVE', 'AWAITING_SEND', 'PAUSED']
/** LEAN CUT exit goals, plus RFQ_QUALIFIED and OWNER_RESPONDED (CT ruling 5). */
export const ENROLLMENT_EXIT_REASON = [
  'REPLIED',
  'RFQ_SUBMITTED',
  'RFQ_CLOSED',
  'RFQ_QUALIFIED',
  'OWNER_RESPONDED',
  'UNSUBSCRIBED',
  'BOUNCED',
  'COMPLAINT',
  'SUPPRESSED',
  'MANUAL_STOP',
  // ENGINE-SCOPE-1b: a monthly publication slot whose window had passed; recorded, never sent late.
  'MISSED',
] as const
export type EnrollmentExitReason = (typeof ENROLLMENT_EXIT_REASON)[number]
export const ENROLLMENT_PAUSE_REASON = ['SEQUENCE_PAUSED', 'LINT_HOLD', 'RENDER_HOLD', 'MANUAL'] as const
export const ENROLLED_VIA = ['MANUAL', 'SAVED_VIEW', 'RULE', 'PUBLICATION'] as const
/** The sending identity's health (E0.1 §17, reduced): WARMING and ACTIVE send; PAUSED does not (admin resume). */
export const ERS_HEALTH_STATE = ['ACTIVE', 'PAUSED'] as const
/**
 * ICS_MISSING_INFORMATION (CT ruling 8): the missing items are picked by a person from this fixed set — never free
 * text, never inferred. The phrase is what the email says ("we are missing …").
 */
export const MISSING_INFORMATION_ITEMS = {
  DESIGN_SPECIFICATION: 'the current design specification',
  PROJECT_SCHEDULE: 'the requested project schedule',
  DRAWINGS: 'current drawings',
  TOWER_TYPE: 'the tower type (crossflow or counterflow) and manufacturer',
  CELL_COUNT: 'the number of cells',
  MODEL_SERIAL: 'the model and serial number, or a nameplate photo',
  DESIGN_CONDITIONS: 'the design conditions (flow rate and water temperatures)',
  SITE_LOCATION: 'the site location',
  QUANTITIES: 'the quantities needed',
  PHOTOS: 'photos of the area or parts concerned',
} as const
export type MissingInformationItem = keyof typeof MISSING_INFORMATION_ITEMS
