import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmCollection, stampProvenance } from '../collection'
import { provenanceGroup } from '../fields'
import { CrmInvariantError, merged, relId, writeOnce } from '../guards'
import {
  BUYING_GROUP_CONFIDENCE,
  BUYING_GROUP_MEMBERSHIP_CLASS,
  BUYING_GROUP_ROLE_CLASS,
  BUYING_GROUP_VERIFICATION,
  options,
} from '../vocabulary'

type Doc = Record<string, unknown>

/**
 * Buying-group membership is **per opportunity/project** (E1.4 `buying_group_model.json`).
 *
 *   - "Verified employment/account membership alone does not establish project buying-group membership."
 *     There is no code path that enrols an account's contacts into a project; each row is created
 *     deliberately, and the default class is PROJECT_MEMBERSHIP_UNKNOWN.
 *   - Role classes are not job titles and default to UNKNOWN; UNKNOWN is never OTHER.
 *   - A VERIFIED membership or role cites its evidence (`provenance.evidence_ref`).
 *   - A contact from another account (a consultant, an EPC engineer) is allowed only as
 *     EPC_CONSULTANT_THIRD_PARTY_ENGINEER or OTHER, and must cite evidence — so evidence about Contact A at
 *     Account X cannot quietly place Contact B from Account Y on the project.
 *   - (opportunity, contact) is unique, and both are write-once: a membership row is about one person on
 *     one project and never becomes a row about another.
 */
const membershipRules: CollectionBeforeChangeHook = async ({ data: incoming, originalDoc, req }) => {
  const data = merged(incoming, originalDoc) as Doc
  const oppId = relId(data.opportunity)
  const contactId = relId(data.contact)
  if (!oppId || !contactId)
    throw new CrmInvariantError(
      'BUYING_GROUP_SCOPE_REQUIRED',
      'A membership names one opportunity and one contact.',
    )
  const [opp, contact] = await Promise.all([
    req.payload.findByID({ collection: 'crm-opportunities', id: oppId, depth: 0, overrideAccess: true, req }),
    req.payload.findByID({ collection: 'crm-contacts', id: contactId, depth: 0, overrideAccess: true, req }),
  ])
  const oppAccount = relId((opp as unknown as Doc).account)
  const contactAccount = relId((contact as unknown as Doc).account)
  incoming.account = oppAccount
  const cross = contactAccount !== oppAccount
  incoming.cross_account = cross
  const evidence = String(((data.provenance ?? {}) as Doc).evidence_ref ?? '').trim()
  if (cross) {
    if (!['EPC_CONSULTANT_THIRD_PARTY_ENGINEER', 'OTHER'].includes(String(data.role_class)))
      throw new CrmInvariantError(
        'BUYING_GROUP_CROSS_ACCOUNT_ROLE',
        'A contact outside the opportunity’s account can join only as a third-party engineer/consultant or OTHER.',
      )
    if (!evidence)
      throw new CrmInvariantError(
        'BUYING_GROUP_CROSS_ACCOUNT_EVIDENCE',
        'A cross-account member must cite evidence tying them to this project.',
      )
  }
  if ((data.membership_verification === 'VERIFIED' || data.role_verification === 'VERIFIED') && !evidence)
    throw new CrmInvariantError(
      'BUYING_GROUP_VERIFIED_WITHOUT_EVIDENCE',
      'A VERIFIED membership or role needs evidence bound to this project.',
    )
  if (data.role_verification === 'VERIFIED' && data.role_class === 'UNKNOWN')
    throw new CrmInvariantError('BUYING_GROUP_UNKNOWN_ROLE_VERIFIED', 'An UNKNOWN role cannot be VERIFIED.')
  return incoming
}

/** E1.4 `role_specific_personalization_gate`, verbatim. Pure; used by future sequence runtime and tests. */
export function roleSpecificPersonalizationAllowed(m: Doc, enrollmentOpportunityId: string): boolean {
  return (
    m.membership_class === 'PROJECT_BUYING_GROUP_MEMBER' &&
    m.membership_verification === 'VERIFIED' &&
    relId(m.opportunity) === enrollmentOpportunityId &&
    m.role_verification === 'VERIFIED' &&
    ['CONFIRMED', 'HIGH'].includes(String(m.role_confidence)) &&
    m.role_class !== 'UNKNOWN'
  )
}

export const CrmBuyingGroupMembers: CollectionConfig = crmCollection(
  {
    slug: 'crm-buying-group-members',
    // Duplicating one of these would fabricate a second record of something that happened once.
    disableDuplicate: true,
    labels: { singular: 'Buying-group member', plural: 'Buying groups' },
    admin: {
      useAsTitle: 'canonical_id',
      description:
        'Who is involved in THIS project, with evidence. Account employment alone is not project membership. Roles are classes, not titles.',
      defaultColumns: [
        'opportunity',
        'contact',
        'membership_class',
        'role_class',
        'role_verification',
        'cross_account',
      ],
    },
    indexes: [{ fields: ['opportunity', 'contact'], unique: true }],
    hooks: {
      beforeValidate: [stampProvenance],
      beforeChange: [writeOnce('crm-buying-group-members', ['opportunity', 'contact']), membershipRules],
    },
    fields: [
      {
        name: 'opportunity',
        type: 'relationship',
        relationTo: 'crm-opportunities',
        required: true,
        index: true,
      },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', required: true, index: true },
      {
        name: 'account',
        type: 'relationship',
        relationTo: 'crm-accounts',
        index: true,
        admin: { readOnly: true, description: 'Derived from the opportunity.' },
      },
      {
        name: 'cross_account',
        type: 'checkbox',
        admin: { readOnly: true, description: 'The contact belongs to a different account (e.g. an EPC).' },
      },
      {
        name: 'membership_class',
        type: 'select',
        required: true,
        defaultValue: 'PROJECT_MEMBERSHIP_UNKNOWN',
        options: options(BUYING_GROUP_MEMBERSHIP_CLASS),
      },
      {
        name: 'membership_confidence',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(BUYING_GROUP_CONFIDENCE),
      },
      {
        name: 'membership_verification',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(BUYING_GROUP_VERIFICATION),
      },
      {
        name: 'role_class',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(BUYING_GROUP_ROLE_CLASS),
      },
      {
        name: 'role_confidence',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(BUYING_GROUP_CONFIDENCE),
      },
      {
        name: 'role_verification',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(BUYING_GROUP_VERIFICATION),
      },
      provenanceGroup(),
    ],
  },
  {
    deleteAlternative:
      'Set membership_class to PROJECT_MEMBERSHIP_UNKNOWN with a note; memberships are history.',
  },
)
