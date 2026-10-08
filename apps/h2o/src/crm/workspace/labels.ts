/**
 * Human labels for CRM-1 vocabulary values, as the Sales Workspace shows them. Labels only — no value here
 * changes what is stored. Unknown values fall back to a neutral "Unknown" rather than the raw enum.
 */

export type Tone = 'accent' | 'warning' | 'neutral' | 'success' | 'terminal'

export const RFQ_STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  RECEIVED: { label: 'Received', tone: 'accent' },
  NEEDS_REVIEW: { label: 'Needs review', tone: 'warning' },
  IN_REVIEW: { label: 'In review', tone: 'neutral' },
  QUALIFIED: { label: 'Qualified', tone: 'success' },
  // Terminal states share one neutral tone; the label tells them apart (frozen decision).
  REJECTED_NON_CORE: { label: 'Not core business', tone: 'terminal' },
  DUPLICATE_OF_EXISTING: { label: 'Duplicate', tone: 'terminal' },
  CLOSED: { label: 'Closed', tone: 'terminal' },
}

export const OPEN_RFQ_STATUSES = ['RECEIVED', 'NEEDS_REVIEW', 'IN_REVIEW'] as const
export const ACTIVE_RFQ_STATUSES = ['RECEIVED', 'NEEDS_REVIEW', 'IN_REVIEW', 'QUALIFIED'] as const

export const MOTION_LABEL: Record<string, string> = {
  NEW_TOWER: 'New tower',
  REBUILD_REPLACEMENT: 'Rebuild / replacement',
  REPAIR: 'Repair',
  UPGRADE_RETROFIT: 'Upgrade / retrofit',
  MAINTENANCE_INSPECTION: 'Maintenance / inspection',
  PARTS: 'Parts',
  OTHER_APPROVED: 'Other (approved motion)',
}

export const CONTACT_MATCH_LABEL: Record<string, string> = {
  NOT_ATTEMPTED: 'Not linked',
  MATCHED_EXACT_EMAIL: 'Matched existing contact by email',
  CREATED_NEW_CONTACT: 'New contact created',
  NO_VALID_EMAIL: 'No email supplied — no contact record',
  FIELD_MAPPING_MISSING: 'Not linked — form mapping missing',
  MANUAL: 'Manual link',
}

export const ACCOUNT_MATCH_LABEL: Record<string, string> = {
  NOT_ATTEMPTED: 'Not linked',
  MATCHED_VERIFIED_DOMAIN: 'Matched by verified domain',
  AMBIGUOUS_REVIEW: 'Not linked — domain on several accounts (review)',
  FREE_EMAIL_DOMAIN: 'Not linked — personal email domain',
  NO_MATCH: 'Not linked — no verified match',
  CONTACT_ACCOUNT_CONFLICT_REVIEW: 'Not linked — contact/account conflict (review)',
  MANUAL: 'Manual link',
}

export const RELATIONSHIP_LABEL: Record<string, string> = {
  VERIFIED_CUSTOMER: 'Verified customer',
  VERIFIED_PAST_CUSTOMER: 'Verified past customer',
  PROSPECT: 'Prospect',
  CANDIDATE: 'Candidate',
  UNKNOWN: 'Relationship unknown',
}

export const ACTIVITY_LABEL: Record<string, string> = {
  NOTE_ADDED: 'Note',
  CALL: 'Call',
  MEETING: 'Meeting',
  EMAIL_REFERENCE: 'Email reference',
  REPLY_REFERENCE: 'Customer replied',
  DOCUMENT_REFERENCE: 'Document reference',
  PROJECT_INTERACTION: 'Project interaction',
  INTAKE_RECEIVED: 'Intake received',
  RFQ_CREATED: 'RFQ created',
  RFQ_STATUS_CHANGED: 'Status changed',
  RFQ_ASSIGNED: 'Owner assigned',
  OPPORTUNITY_CREATED: 'Opportunity created',
  OPPORTUNITY_STAGE_CHANGED: 'Stage changed',
  OPPORTUNITY_OWNER_CHANGED: 'Opportunity owner changed',
  TASK_CREATED: 'Follow-up created',
  TASK_COMPLETED: 'Follow-up completed',
  TASK_REASSIGNED: 'Follow-up reassigned',
  SUPPRESSION_RECORDED: 'Do-not-contact recorded',
  SUPPRESSION_CLEARED: 'Do-not-contact cleared',
  IDENTITY_REVIEW_OPENED: 'Identity review opened',
  // Email M1–M3 activity types (found unlabelled in Patch L QA: they rendered as "Unknown").
  EMAIL_NOTIFICATION: 'Email notification',
  EMAIL_REPLY: 'Email reply',
  EMAIL_RECEIVED: 'Email received',
  SEQUENCE_EVENT: 'Sequence',
}

/** Activity types a person may log from the workspace (CRM-1 HUMAN_ACTIVITY_TYPES minus notes). */
export const LOGGABLE_ACTIVITY_TYPES = ['CALL', 'MEETING', 'EMAIL_REFERENCE'] as const

export const TASK_KIND_LABEL: Record<string, string> = {
  RFQ_FIRST_RESPONSE: 'First response',
  FOLLOW_UP: 'Follow-up',
  MISSING_INFORMATION: 'Waiting for customer',
  IDENTITY_REVIEW: 'Identity review',
  INTAKE_REVIEW: 'Intake review',
  GENERAL: 'General',
  SEQUENCE_STEP: 'Sequence task',
  SEQUENCE_REVIEW: 'Sequence review',
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}

export const STAGE_LABEL: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: 'New', tone: 'accent' },
  QUALIFYING: { label: 'Qualifying', tone: 'neutral' },
  QUALIFIED: { label: 'Qualified', tone: 'success' },
  PROPOSAL: { label: 'Proposal', tone: 'neutral' },
  NEGOTIATION: { label: 'Negotiation', tone: 'neutral' },
  DELAYED: { label: 'Delayed', tone: 'warning' },
  WON: { label: 'Won', tone: 'success' },
  LOST: { label: 'Lost', tone: 'terminal' },
  CANCELLED: { label: 'Cancelled', tone: 'terminal' },
}

export const IDENTITY_REASON_LABEL: Record<string, string> = {
  EMAIL_MATCH_NAME_MISMATCH: 'Email matches a contact with a different name',
  SAME_NAME_DIFFERENT_EMAIL: 'Same name as another contact',
  VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS: 'Domain verified on several accounts',
  COMPANY_NAME_MATCH_UNVERIFIED: 'Company name resembles an existing account',
  CONTACT_ACCOUNT_CONFLICT: 'Contact and account disagree',
  POSSIBLE_DUPLICATE_SUBMISSION: 'Possible duplicate submission',
  INTAKE_CONFLICTING_PAYLOAD: 'Conflicting intake payload',
  GENERIC_SHARED_INBOX: 'Shared or role inbox (not a named person)',
  SUSPECT_ADDRESS_DOMAIN: 'Suspicious sign-up domain (no company name)',
  NAME_CONTAINED_LINK: 'Name field held a web link (imported without a name)',
  OTHER: 'Other',
}

/** SEND-FIX-1a (owner 2026-10-08): shown instead of the reply composer while CRM replies are off (launch). */
export const REPLIES_OFF_NOTE = 'Reply from your email for now; CRM sending turns on after launch.'

export const SOURCE_LABEL: Record<string, string> = {
  TYPEFORM: 'Website form (Typeform)',
  NATIVE_FORM: 'Website form',
  NATIVE_CHAT: 'Website chat',
  MANUAL_ENTRY: 'Manual',
  LEGACY_IMPORT: 'Legacy import',
  SYSTEM_DERIVED: 'System',
  SYNTHETIC_FIXTURE: 'Synthetic fixture',
  UNKNOWN: 'Unknown',
}

export const label = (table: Record<string, string>, value: unknown): string =>
  (typeof value === 'string' && table[value]) || 'Unknown'

/**
 * Question labels for Typeform answers, keyed by the `other:<key>` targets of the CRM-1 field map.
 * Labels are the exact wording the visitor saw on Typeform F22cAgx3 (CRM-2 TYPEFORM_FIELD_LEDGER.tsv).
 * An answer whose key is not listed keeps its value and shows "Question label unavailable".
 */
export const TYPEFORM_ANSWER_LABEL: Record<string, string> = {
  interest: 'What are you interested in:',
  part: 'What Part are you interested in?',
  part_details: 'Please provide any information you have on the part, below so we can get started on your RFQ.',
  urgency: 'Is this Urgent Part Quote Request?',
  destination_country: 'Can you please let us know the Country of Destination?',
  anything_else: "Anything else you'd like us to know?",
  // Native form and chat (registry question ids; wording from the accepted OGCS copy, 97e83b3d).
  native_purpose: 'Purpose (chip)',
  parts_part: 'Which part do you need?',
  parts_model: 'Model or serial number',
  parts_qty: 'How many do you need?',
  towers_type: 'What type of tower is it?',
  towers_cells: 'How many cells?',
  towers_site: 'Where is the site?',
  service_issue: 'What is happening with the tower?',
  service_issue_upgrade: 'What would you like to improve?',
  service_timing: 'When do you need the work done?',
  other_need: 'What do you need?',
  notes: 'Anything else we should know?',
  context_type: 'Started from (page type)',
  context_id: 'Started from (item id)',
}

/** Core submitted fields, with their Typeform question wording. */
export const SUBMITTED_FIELD_LABEL: Record<string, string> = {
  email: 'What is your email address?',
  first_name: 'Can I get your first name?',
  last_name: 'And your last name?',
  company: 'What company are you with?',
  phone: 'Please let us know your phone number',
  message: 'Message',
}

/**
 * Interest shown in lists (frozen fallback order, extended with the staff classification for manual
 * inquiries): the customer's service selection → the first RFQ item title → the staff classification
 * (motion) → "General inquiry".
 */
export function interestOf(input: {
  otherAnswers?: unknown
  firstItemTitle?: string | null
  motion?: string | null
}): { text: string; origin: 'CUSTOMER' | 'ITEM' | 'STAFF' | 'NONE' } {
  const answers = (input.otherAnswers && typeof input.otherAnswers === 'object' ? input.otherAnswers : {}) as Record<
    string,
    unknown
  >
  const selection = answers.interest
  if (typeof selection === 'string' && selection.trim()) return { text: selection.trim(), origin: 'CUSTOMER' }
  if (input.firstItemTitle && input.firstItemTitle.trim()) return { text: input.firstItemTitle.trim(), origin: 'ITEM' }
  if (input.motion && MOTION_LABEL[input.motion]) return { text: MOTION_LABEL[input.motion]!, origin: 'STAFF' }
  return { text: 'General inquiry', origin: 'NONE' }
}

/** True when the customer marked the inquiry urgent (Typeform Q8 "Yes"). No SLA is implied. */
export const isCustomerUrgent = (otherAnswers: unknown): boolean => {
  const v = (otherAnswers && typeof otherAnswers === 'object' ? (otherAnswers as Record<string, unknown>).urgency : null)
  return typeof v === 'string' && /^yes$/i.test(v.trim())
}

/**
 * A task title as shown to people. CRM-1 titles identity-review tasks with the reason code
 * ("Identity review: SAME_NAME_DIFFERENT_EMAIL"); the workspace shows the plain-language reason instead.
 */
export function taskTitle(title: unknown): string {
  const t = typeof title === 'string' ? title : ''
  const m = /^Identity review: ([A-Z_]+)$/.exec(t)
  return m ? `Identity review: ${IDENTITY_REASON_LABEL[m[1]!] ?? 'needs a decision'}` : t
}

export const QUALIFICATION_LABEL: Record<string, string> = {
  UNKNOWN: 'Not assessed yet',
  INCOMPLETE: 'Incomplete — waiting for information',
  COMPLETE: 'Complete',
}

/**
 * A stored activity summary as people read it (UI-1 M7). Summaries are audit text written by the system with
 * enum codes in them ("Task created (RFQ_FIRST_RESPONSE)", "RFQ … persisted (TYPEFORM)", "RFQ status RECEIVED →
 * IN_REVIEW"). The record is left exactly as written; only the display replaces each known code with its label
 * and any remaining SHOUTING_CODE with plain words. RFQ numbers (RFQ-YYYYMMDD-XXXXXXX) are kept.
 */
const SUMMARY_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(RFQ_STATUS_LABEL).map(([k, v]) => [k, v.label])),
  ...Object.fromEntries(Object.entries(STAGE_LABEL).map(([k, v]) => [k, v.label])),
  ...TASK_KIND_LABEL,
  ...MOTION_LABEL,
  ...IDENTITY_REASON_LABEL,
  ...SOURCE_LABEL,
  TYPEFORM: 'website form',
  NATIVE_FORM: 'website form',
  NATIVE_CHAT: 'website chat',
  MARKETING_EMAIL: 'marketing email',
  ALL_EMAIL: 'all email',
  ALL_OUTREACH: 'all outreach',
}
export function humanSummary(summary: unknown): string {
  const text = typeof summary === 'string' ? summary : ''
  return text
    .replace(/\bpersisted\b/g, 'received')
    .replace(/\b(?!RFQ-)[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[A-Z]{4,}\b/g, (code) => {
      if (SUMMARY_LABELS[code]) return SUMMARY_LABELS[code]!
      return code.replaceAll('_', ' ').toLowerCase()
    })
}

/** W1-1 contact profile labels. */
export const CONTACT_FUNCTION_LABEL: Record<string, string> = {
  ENGINEERING_TECHNICAL: 'Engineering / technical',
  PLANT_OPERATIONS: 'Plant operations',
  MAINTENANCE_RELIABILITY: 'Maintenance / reliability',
  PROCUREMENT_SOURCING: 'Procurement / sourcing',
  PROJECT_MANAGEMENT: 'Project management',
  EXECUTIVE_MANAGEMENT: 'Executive management',
  EPC_CONSULTANT_THIRD_PARTY: 'EPC / consultant / third party',
  OTHER: 'Other',
  UNKNOWN: 'Not known',
}

export const LINK_CONFIDENCE_LABEL: Record<string, string> = {
  VERIFIED: 'Verified link',
  HIGH_CONFIDENCE: 'High-confidence link',
  LOW_CONFIDENCE: 'Low-confidence link',
  UNKNOWN: 'Link not stated',
}

/** Patch L1: how an inquiry's office queue was decided. */
export const OFFICE_SOURCE_LABEL: Record<string, string> = {
  COUNTRY_RULE: 'routed by country',
  OWNER_OVERRIDE: 'owner routing rule',
  DEFAULT: 'country unknown, default queue',
  MANUAL: 'moved by a person',
}
