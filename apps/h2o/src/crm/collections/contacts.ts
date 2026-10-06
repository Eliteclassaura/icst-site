import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { adminOnlyValues } from '../access'
import { ownerHoldsCrmRole } from '../assignment'
import { crmCollection, stampProvenance } from '../collection'
import { countryCodeField, provenanceGroup, relationshipBasisFields, userRelation } from '../fields'
import { CrmInvariantError, isServerContext, merged, relId, writeOnce } from '../guards'
import { emailKey, textOrNull } from '../normalize'
import { activeSuppressionsFor } from '../suppression'
import { CONTACT_COUNTRY_SOURCE } from '../countries'
import { ADDRESS_QUALITY, addressQualityOf } from '../address-quality'
import {
  CONTACT_FIT_STATE,
  CONTACT_FUNCTION,
  JURISDICTION,
  LINK_CONFIDENCE,
  MARKETING_ELIGIBILITY,
  PHONE_KIND,
  RECORD_STATE,
  RELATIONSHIP_EVIDENCE,
  options,
} from '../vocabulary'

/**
 * Email identity. The person types `email`; the server derives `email_original`, `email_canonical` and
 * `email_match_key` (lowercase only — E0.1 forbids provider alias folding). The address is the contact
 * point's identity, so it is write-once: a different address is a different contact point (and, per E0.1,
 * a replacement address never inherits or erases the old one's suppression).
 */
const deriveEmail: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data || operation !== 'create') return data
  const d = data as Record<string, unknown>
  const key = emailKey(d.email)
  if (!key)
    throw new CrmInvariantError('EMAIL_INVALID', 'A contact needs a syntactically valid email address.')
  d.email = key.canonical
  if (typeof d.email_original !== 'string' || d.email_original === '') d.email_original = key.original
  d.email_match_key = key.matchKey
  d.email_domain = key.domain
  return data
}

const deriveDisplayName: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data
  const d = data as Record<string, unknown>
  if (textOrNull(d.display_name) === null) {
    const name = [textOrNull(d.first_name), textOrNull(d.last_name)].filter(Boolean).join(' ')
    d.display_name = name === '' ? null : name
  }
  return data
}

/** An account link must say how strong it is; UNKNOWN confidence means no link. */
const accountLinkConsistency: CollectionBeforeChangeHook = ({ data: incoming, originalDoc, req }) => {
  const data = merged(incoming, originalDoc)
  const linked = relId(data.account) !== null
  const conf = String(data.account_link_confidence ?? 'UNKNOWN')
  if (linked && conf === 'UNKNOWN')
    throw new CrmInvariantError(
      'ACCOUNT_LINK_CONFIDENCE_REQUIRED',
      'Say how the contact is known to belong to this account (VERIFIED, HIGH_CONFIDENCE or LOW_CONFIDENCE).',
    )
  if (!linked && conf !== 'UNKNOWN')
    throw new CrmInvariantError(
      'ACCOUNT_LINK_CONFIDENCE_WITHOUT_ACCOUNT',
      'An account-link confidence needs an account.',
    )
  // Never let a weaker assertion silently replace a verified one.
  if (originalDoc?.account_link_confidence === 'VERIFIED') {
    const changed = relId(data.account) !== relId(originalDoc.account) || conf !== 'VERIFIED'
    if (changed && !hasRole(req, ADMINS))
      throw new CrmInvariantError(
        'VERIFIED_LINK_PROTECTED',
        'A VERIFIED account link can only be changed by an admin.',
        403,
      )
  }
  return incoming
}

/**
 * Marketing eligibility is never assumed. `ELIGIBLE` needs an admin (field access), recorded relationship
 * evidence, a resolved jurisdiction and **no active suppression**. Missing consent is not opt-in.
 */
const eligibilityGate: CollectionBeforeChangeHook = async ({ data: incoming, originalDoc, req }) => {
  const data = merged(incoming, originalDoc)
  if (data.marketing_eligibility !== 'ELIGIBLE') return incoming
  const evidence = String(data.relationship_evidence ?? 'UNKNOWN')
  const jurisdiction = String(data.jurisdiction ?? 'COUNTRY_UNKNOWN')
  if (data.address_quality)
    throw new CrmInvariantError(
      'ELIGIBILITY_BLOCKED_BY_ADDRESS_QUALITY',
      'This address is flagged (typo, disposable, spam pattern or internal); it cannot be marked eligible.',
      409,
    )
  if (evidence === 'UNKNOWN' || evidence === 'NONE')
    throw new CrmInvariantError(
      'ELIGIBILITY_WITHOUT_EVIDENCE',
      'Marketing eligibility needs recorded relationship evidence.',
    )
  if (jurisdiction === 'COUNTRY_UNKNOWN' || jurisdiction === 'LEGAL_REVIEW_REQUIRED')
    throw new CrmInvariantError(
      'ELIGIBILITY_JURISDICTION_UNRESOLVED',
      'Marketing eligibility needs a resolved jurisdiction (E0.1: unknown country is REVIEW_REQUIRED, not ELIGIBLE).',
    )
  const key = (data.email_match_key ?? originalDoc?.email_match_key) as string | undefined
  if (key) {
    const active = await activeSuppressionsFor(req, key)
    if (active.length > 0)
      throw new CrmInvariantError(
        'ELIGIBILITY_BLOCKED_BY_SUPPRESSION',
        'This address has an active suppression; it cannot be marked eligible.',
        409,
      )
  }
  return incoming
}

/**
 * Address quality (CT 2026-10-05). On create the server derives it from the domain (own domain → INTERNAL, which also
 * marks the contact as an internal/test address; disposable; provider typo) unless trusted code (an admin, or the
 * import) supplies a value. Afterwards only an admin or trusted server code may change it. The address itself is
 * never corrected.
 */
const addressQualityGuard: CollectionBeforeChangeHook = ({ context, data, operation, originalDoc, req }) => {
  if (!data) return data
  const d = data as Record<string, unknown>
  const trusted = isServerContext(context) || hasRole(req, ADMINS)
  if (operation === 'create') {
    if (!trusted || d.address_quality === undefined || d.address_quality === null) d.address_quality = addressQualityOf(String(d.email_domain ?? '')) ?? null
    if (d.address_quality === 'INTERNAL') d.internal_test_candidate = true
    return data
  }
  if ('address_quality' in d && (d.address_quality ?? null) !== (originalDoc?.address_quality ?? null) && !trusted)
    throw new CrmInvariantError('ADDRESS_QUALITY_ADMIN_ONLY', 'Only an admin can change an address-quality flag.', 403)
  return data
}

/** Trusted server code may not overwrite an existing account link (it must open a review instead). */
const serverNeverRelinks: CollectionBeforeChangeHook = ({ context, data, operation, originalDoc }) => {
  if (operation !== 'update' || !isServerContext(context) || !originalDoc) return data
  if (relId(originalDoc.account) !== null && relId(data.account) !== relId(originalDoc.account))
    throw new CrmInvariantError(
      'SERVER_RELINK_FORBIDDEN',
      'Automation cannot replace an existing account link.',
    )
  return data
}

export const CrmContacts: CollectionConfig = crmCollection(
  {
    slug: 'crm-contacts',
    // Duplicating one of these would fabricate a second record of something that happened once.
    disableDuplicate: true,
    labels: { singular: 'Contact', plural: 'Contacts' },
    admin: {
      useAsTitle: 'display_name',
      description:
        'People — buying-group members, not the commercial centre. Authority, budget and role are never inferred.',
      defaultColumns: ['display_name', 'account', 'title', 'contact_function', 'record_state', 'updatedAt'],
      listSearchableFields: [
        'display_name',
        'first_name',
        'last_name',
        'email_match_key',
        'company_name_original',
      ],
    },
    hooks: {
      beforeValidate: [stampProvenance, deriveEmail, deriveDisplayName],
      beforeChange: [
        writeOnce('crm-contacts', ['email', 'email_original', 'email_match_key', 'email_domain']),
        accountLinkConsistency,
        serverNeverRelinks,
        addressQualityGuard,
        eligibilityGate,
        ownerHoldsCrmRole('CONTACT_OWNER_NOT_CRM_USER'),
      ],
    },
    fields: [
      {
        name: 'email',
        type: 'text',
        required: true,
        admin: { description: 'Write-once. A different address is a different contact point.' },
      },
      {
        name: 'email_original',
        type: 'text',
        admin: { readOnly: true, description: 'Exactly as received.' },
      },
      {
        name: 'email_match_key',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        admin: { readOnly: true, description: 'Lowercase only. No alias folding (E0.1).' },
      },
      { name: 'email_domain', type: 'text', index: true, admin: { readOnly: true } },
      { name: 'first_name', type: 'text' },
      { name: 'last_name', type: 'text' },
      { name: 'display_name', type: 'text', index: true },
      {
        name: 'phones',
        type: 'array',
        fields: [
          {
            name: 'number_raw',
            type: 'text',
            required: true,
            admin: { description: 'As supplied; not reformatted.' },
          },
          {
            name: 'kind',
            type: 'select',
            required: true,
            defaultValue: 'UNKNOWN',
            options: options(PHONE_KIND),
          },
        ],
      },
      {
        name: 'title',
        type: 'text',
        admin: { description: 'Only when known. A title is not an authority claim.' },
      },
      {
        name: 'contact_function',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(CONTACT_FUNCTION),
      },
      {
        name: 'company_name_original',
        type: 'text',
        admin: { description: 'As submitted. Does not link an account by itself.' },
      },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', index: true },
      {
        name: 'account_link_confidence',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(LINK_CONFIDENCE),
      },
      ...relationshipBasisFields(),
      countryCodeField(),
      {
        name: 'country_source',
        type: 'select',
        options: options(CONTACT_COUNTRY_SOURCE),
        admin: {
          description:
            'How the country is known. Inferred values (phone code, email ccTLD) are hints, never a verified jurisdiction.',
        },
      },
      {
        name: 'fit_state',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(CONTACT_FIT_STATE),
      },
      {
        name: 'record_state',
        type: 'select',
        required: true,
        defaultValue: 'ACTIVE',
        options: options(RECORD_STATE),
        index: true,
      },
      userRelation('owner', 'Contact owner, if any. Empty means unassigned.'),
      {
        name: 'address_quality',
        type: 'select',
        index: true,
        options: options(ADDRESS_QUALITY),
        admin: {
          description:
            'Data-quality flag. Any value: never linked to an account, never marketing-eligible, excluded from every sequence. The address is kept as written.',
        },
      },
      {
        name: 'internal_test_candidate',
        type: 'checkbox',
        defaultValue: false,
        admin: { description: 'E0.1: marks an internal/test address. It never makes a contact sendable.' },
      },
      {
        type: 'collapsible',
        label: 'Eligibility (E0.1) — missing consent is not opt-in',
        fields: [
          {
            name: 'marketing_eligibility',
            type: 'select',
            required: true,
            defaultValue: 'UNKNOWN',
            options: options(MARKETING_ELIGIBILITY),
            access: {
              create: adminOnlyValues('marketing_eligibility', ['ELIGIBLE']),
              update: adminOnlyValues('marketing_eligibility', ['ELIGIBLE']),
            },
          },
          {
            name: 'relationship_evidence',
            type: 'select',
            required: true,
            defaultValue: 'UNKNOWN',
            options: options(RELATIONSHIP_EVIDENCE),
          },
          {
            name: 'jurisdiction',
            type: 'select',
            required: true,
            defaultValue: 'COUNTRY_UNKNOWN',
            options: options(JURISDICTION),
          },
        ],
      },
      provenanceGroup(),
      { name: 'buying_groups', type: 'join', collection: 'crm-buying-group-members', on: 'contact' },
      { name: 'rfqs', type: 'join', collection: 'crm-rfqs', on: 'contact' },
      { name: 'tasks', type: 'join', collection: 'crm-tasks', on: 'contact' },
    ],
  },
  { deleteAlternative: 'Set record_state to ARCHIVED.' },
)
