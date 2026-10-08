import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { isAdminOrServer, ownerHoldsCrmRole } from '../assignment'
import { crmCollection, stampProvenance } from '../collection'
import { provenanceGroup, relationshipBasisFields, userRelation } from '../fields'
import { CrmInvariantError, isServerContext, relId } from '../guards'
import { normalizeWebDomain } from '../normalize'
import {
  ACCOUNT_DOMAIN_STATUS,
  ACCOUNT_STATE,
  RELATIONSHIP_STATE,
  STRATEGIC_TIER,
  VERIFIED_DOMAIN_STATUSES,
  options,
} from '../vocabulary'

type DomainRow = { domain?: string | null; domain_status?: string | null }

/**
 * Domains are normalised, and a *verified* domain may belong to one account only.
 *
 * E0.1 §Duplicate-company resolution: "Human review is required when two accounts share a domain." So a
 * second account cannot silently acquire a verified domain another account already holds — the write is
 * refused and the person is told to open an identity review. CANDIDATE and RETIRED rows may coexist.
 */
const normalizeAndGuardDomains: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const rows = (data.domains ?? []) as DomainRow[]
  const seen = new Set<string>()
  for (const row of rows) {
    const d = normalizeWebDomain(row.domain)
    if (!d)
      throw new CrmInvariantError(
        'DOMAIN_INVALID',
        'Each account domain must be a hostname, e.g. example.com.',
      )
    if (seen.has(d))
      throw new CrmInvariantError('DOMAIN_DUPLICATED', 'A domain is listed twice on this account.')
    seen.add(d)
    row.domain = d
  }
  const verified = rows
    .filter((r) => (VERIFIED_DOMAIN_STATUSES as readonly string[]).includes(String(r.domain_status)))
    .map((r) => r.domain as string)
  if (verified.length === 0) return data
  const others = await req.payload.find({
    collection: 'crm-accounts',
    where: {
      and: [
        { 'domains.domain': { in: verified } },
        { 'domains.domain_status': { in: [...VERIFIED_DOMAIN_STATUSES] } },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
      ],
    },
    depth: 0,
    limit: 5,
    overrideAccess: true,
    req,
  })
  for (const other of others.docs) {
    const clash = ((other as { domains?: DomainRow[] }).domains ?? []).some(
      (r) =>
        verified.includes(String(r.domain)) &&
        (VERIFIED_DOMAIN_STATUSES as readonly string[]).includes(String(r.domain_status)),
    )
    if (clash)
      throw new CrmInvariantError(
        'VERIFIED_DOMAIN_ON_OTHER_ACCOUNT',
        'This verified domain already belongs to another account. Open an identity review instead of linking it twice.',
        409,
      )
  }
  return data
}

/**
 * Wave 1 W1-1: "verified customer" and "verified past customer" are claims backed by evidence, like a verified
 * domain. Setting one, or replacing one, is an admin act; trusted server code (intake, a reviewed import) may
 * record it. Refused outright rather than silently dropped, so a caller never mistakes it for a saved change.
 */
const VERIFIED_RELATIONSHIPS = ['VERIFIED_CUSTOMER', 'VERIFIED_PAST_CUSTOMER']
const verifiedRelationshipIsAdminOnly: CollectionBeforeChangeHook = ({ context, data, originalDoc, req }) => {
  if (!('relationship_state' in data) || isAdminOrServer(req, context)) return data
  const to = String(data.relationship_state ?? 'UNKNOWN')
  const from = String(originalDoc?.relationship_state ?? 'UNKNOWN')
  if (to !== from && (VERIFIED_RELATIONSHIPS.includes(to) || VERIFIED_RELATIONSHIPS.includes(from)))
    throw new CrmInvariantError(
      'VERIFIED_RELATIONSHIP_PRIVILEGED',
      'Only an admin can set or change a verified customer relationship.',
      403,
    )
  return data
}

/**
 * Wave 1 W1-3: an import may name an account from its domain when the file gives no company ("Acme" from acme.com).
 * Such accounts carry `name_from_domain` so staff can find and correct them; a person renaming the account clears it.
 */
const nameFromDomainClears: CollectionBeforeChangeHook = ({ context, data, originalDoc }) => {
  if (isServerContext(context) || !originalDoc?.name_from_domain) return data
  if ('canonical_name' in data && data.canonical_name !== originalDoc.canonical_name) data.name_from_domain = false
  return data
}

/**
 * SEC-CRM-1: a VERIFIED_* domain drives automatic matching of new RFQs, so — like a verified relationship — adding,
 * changing or removing one is an admin act (or trusted server code). Candidate and retired rows stay open to all.
 */
const verifiedStatusOf = (rows: unknown): Map<string, string> =>
  new Map(
    ((rows ?? []) as DomainRow[])
      .filter((r) => (VERIFIED_DOMAIN_STATUSES as readonly string[]).includes(String(r.domain_status)))
      .map((r) => [String(normalizeWebDomain(r.domain) ?? r.domain), String(r.domain_status)]),
  )
const verifiedDomainIsAdminOnly: CollectionBeforeChangeHook = ({ context, data, originalDoc, req }) => {
  if (!('domains' in data) || isAdminOrServer(req, context)) return data
  const before = verifiedStatusOf(originalDoc?.domains)
  const after = verifiedStatusOf(data.domains)
  const changed = before.size !== after.size || [...after].some(([d, st]) => before.get(d) !== st)
  if (changed)
    throw new CrmInvariantError('VERIFIED_DOMAIN_PRIVILEGED', 'Only an admin can mark, change or remove a verified domain.', 403)
  return data
}

const noSelfParent: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (originalDoc?.id && relId(data.parent_account) === String(originalDoc.id))
    throw new CrmInvariantError('ACCOUNT_SELF_PARENT', 'An account cannot be its own parent.')
  return data
}

export const CrmAccounts: CollectionConfig = crmCollection(
  {
    slug: 'crm-accounts',
    labels: { singular: 'Account', plural: 'Accounts' },
    admin: {
      useAsTitle: 'canonical_name',
      description:
        'Companies ICS sells to or serves. Parent/subsidiary is a relationship, never a merge. Unknown stays unknown.',
      defaultColumns: ['canonical_name', 'relationship_state', 'account_state', 'owner', 'updatedAt'],
      listSearchableFields: ['canonical_name', 'legal_name', 'aliases.alias', 'domains.domain'],
    },
    hooks: {
      beforeValidate: [stampProvenance],
      beforeChange: [
        normalizeAndGuardDomains,
        verifiedDomainIsAdminOnly,
        noSelfParent,
        verifiedRelationshipIsAdminOnly,
        ownerHoldsCrmRole('ACCOUNT_OWNER_NOT_CRM_USER'),
        nameFromDomainClears,
      ],
    },
    fields: [
      { name: 'canonical_name', type: 'text', required: true, index: true },
      { name: 'legal_name', type: 'text' },
      {
        name: 'name_from_domain',
        type: 'checkbox',
        defaultValue: false,
        index: true,
        admin: { description: 'Named from its domain by an import (no company name supplied). Renaming clears it.' },
      },
      {
        name: 'aliases',
        type: 'array',
        admin: { description: 'Only aliases with evidence. Similar names never make two records one.' },
        fields: [
          { name: 'alias', type: 'text', required: true },
          { name: 'evidence_ref', type: 'text' },
        ],
      },
      {
        name: 'domains',
        type: 'array',
        admin: {
          description:
            'VERIFIED_* domains drive deterministic matching. A consumer mail domain (gmail.com…) is never an account domain.',
        },
        fields: [
          { name: 'domain', type: 'text', required: true, index: true },
          {
            name: 'domain_status',
            type: 'select',
            required: true,
            defaultValue: 'CANDIDATE',
            options: options(ACCOUNT_DOMAIN_STATUS),
          },
          { name: 'evidence_ref', type: 'text' },
        ],
      },
      {
        name: 'parent_account',
        type: 'relationship',
        relationTo: 'crm-accounts',
        admin: { description: 'Reporting rollup only.' },
      },
      { name: 'industry', type: 'text', admin: { description: 'Only when evidenced. Empty means unknown.' } },
      {
        name: 'strategic_tier',
        type: 'select',
        required: true,
        defaultValue: 'UNRATED',
        options: options(STRATEGIC_TIER),
      },
      {
        name: 'relationship_state',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(RELATIONSHIP_STATE),
        index: true,
      },
      ...relationshipBasisFields(),
      {
        name: 'account_state',
        type: 'select',
        required: true,
        defaultValue: 'ACTIVE',
        options: options(ACCOUNT_STATE),
        index: true,
      },
      userRelation('owner', 'Account owner. Empty means unassigned — no default owner is invented.'),
      provenanceGroup(),
      {
        name: 'contacts',
        type: 'join',
        collection: 'crm-contacts',
        on: 'account',
        admin: { defaultColumns: ['display_name', 'title', 'record_state'] },
      },
      { name: 'sites', type: 'join', collection: 'crm-sites', on: 'account' },
      {
        name: 'opportunities',
        type: 'join',
        collection: 'crm-opportunities',
        on: 'account',
        admin: { defaultColumns: ['name', 'motion', 'stage', 'amount_display'] },
      },
      { name: 'rfqs', type: 'join', collection: 'crm-rfqs', on: 'account' },
    ],
  },
  { deleteAlternative: 'Set account_state to ARCHIVED (or MERGED via a reviewed merge).' },
)
