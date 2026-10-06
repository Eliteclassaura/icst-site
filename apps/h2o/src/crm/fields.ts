import type { Field, GroupField, PayloadRequest, TextField } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { EVIDENCE_VERIFICATION, SOURCE_SYSTEM, options } from './vocabulary'

/** Canonical UUIDv7 — set by `assignCanonicalId`, unique, never editable. */
export const canonicalIdField = (): TextField => ({
  name: 'canonical_id',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: {
    readOnly: true,
    position: 'sidebar',
    description: 'Canonical UUIDv7 (Revenue Engine identity). Server-generated; never editable.',
  },
})

/**
 * Provenance (E0.1 R1 §2; CRM-1 §23). Every CRM fact records where it came from.
 *
 * `verification_state` defaults to `UNKNOWN`, never `VERIFIED`: a record is verified by a person or an
 * authoritative source, not by being created. `source_system` has no default — a record that cannot say
 * where it came from fails validation, except that a logged-in person creating a record by hand is itself
 * the source (`MANUAL_ENTRY`, set by `stampProvenance` in `collection.ts`).
 */
export const provenanceGroup = (): GroupField => ({
  name: 'provenance',
  type: 'group',
  admin: {
    description:
      'Where this record came from. Evidence is retained; nothing is overwritten by a weaker source.',
  },
  fields: [
    { name: 'source_system', type: 'select', required: true, options: options(SOURCE_SYSTEM), index: true },
    {
      name: 'source_record_id',
      type: 'text',
      index: true,
      admin: { description: 'Identifier in the source system. Not a canonical id.' },
    },
    {
      name: 'source_event_id',
      type: 'text',
      index: true,
      admin: { description: 'Source event (e.g. Typeform event_id). Not a canonical id.' },
    },
    {
      name: 'evidence_ref',
      type: 'text',
      admin: { description: 'Pointer to the evidence (document, RFQ, record, URL).' },
    },
    { name: 'first_seen_at', type: 'date' },
    { name: 'last_seen_at', type: 'date' },
    { name: 'import_batch_id', type: 'text', index: true },
    {
      name: 'verification_state',
      type: 'select',
      required: true,
      defaultValue: 'UNKNOWN',
      options: options(EVIDENCE_VERIFICATION),
    },
  ],
})

/** `null`-able ISO country code. No default: UNKNOWN is null, never `US`. */
export const countryCodeField = (name = 'country_code'): TextField => ({
  name,
  type: 'text',
  maxLength: 2,
  validate: (value: unknown) =>
    value === null || value === undefined || value === '' || /^[A-Z]{2}$/.test(String(value))
      ? true
      : 'Use an ISO 3166-1 alpha-2 code (e.g. JP), or leave empty when unknown.',
})

/** Owner/assignee relation to the existing users collection (no second user system). */
export const userRelation = (name: string, description: string, required = false): Field => ({
  name,
  type: 'relationship',
  relationTo: 'users',
  required,
  index: true,
  admin: { description },
})

/**
 * CT ruling 2026-10-05 (owner override): a first-class, queryable record of *why* a record may be treated as an
 * existing relationship when no per-record evidence exists. Today only `OWNER_ATTESTED_BATCH`: the owner attested a whole
 * import file, and `relationship_basis_batch` names the batch. It is evidence of the owner's attestation, not a
 * verification — the relationship/evidence fields stay CANDIDATE/UNKNOWN. Set by an admin import only.
 */
export const RELATIONSHIP_BASIS = ['OWNER_ATTESTED_BATCH'] as const
export const relationshipBasisFields = (): Field[] => [
  {
    name: 'relationship_basis',
    type: 'select',
    options: RELATIONSHIP_BASIS.map((v) => ({ label: v, value: v })),
    index: true,
    access: { create: ({ req }) => isAdminReq(req), update: ({ req }) => isAdminReq(req) },
    admin: { readOnly: true, description: 'Owner-attested batch evidence (see relationship_basis_batch). Not a verification.' },
  },
  {
    name: 'relationship_basis_batch',
    type: 'text',
    index: true,
    access: { create: ({ req }) => isAdminReq(req), update: ({ req }) => isAdminReq(req) },
    admin: { readOnly: true, description: 'The import batch (canonical id) whose attestation applies.' },
  },
]

const isAdminReq = (req: PayloadRequest) => hasRole(req, ADMINS)
