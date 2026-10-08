import type { CollectionConfig } from 'payload'
import { crmAdminField, noOne } from '../access'
import { crmCollection } from '../collection'
import { CrmInvariantError, isServerContext, writeOnce } from '../guards'
import { INTAKE_PROCESSING_STATE, TENANT, options } from '../vocabulary'

/**
 * Raw intake event store (E0.1 event envelope: immutable identity, idempotency, replay quarantine).
 *
 * One row per external event, keyed by `(source_system, source_event_id)` — a Typeform `event_id` is the
 * transport identity of one delivery attempt. Business uniqueness (one RFQ per submitted response) is a
 * separate key on the RFQ. Only signature-verified deliveries are ever stored: an unverified body is not
 * evidence of anything and is rejected before it touches the database.
 *
 * Written only by trusted server code. No person creates, edits or deletes an intake event; admins read
 * the raw payload (PII), sales read the normalised, non-personal summary.
 */
export const CrmIntakeEvents: CollectionConfig = crmCollection(
  {
    slug: 'crm-intake-events',
    // Duplicating one of these would fabricate a second record of something that happened once.
    disableDuplicate: true,
    labels: { singular: 'Intake event', plural: 'Intake events' },
    access: { create: noOne, update: noOne },
    admin: {
      useAsTitle: 'source_event_id',
      description:
        'Verified inbound events, stored before any processing. Replays are no-ops; conflicting replays are quarantined.',
      defaultColumns: ['received_at', 'source_system', 'processing_state', 'rfq', 'replay_count'],
    },
    defaultSort: '-received_at',
    indexes: [{ fields: ['source_system', 'source_event_id'], unique: true }],
    hooks: {
      beforeValidate: [
        ({ context, data, operation }) => {
          if (!isServerContext(context))
            throw new CrmInvariantError(
              'INTAKE_SERVER_ONLY',
              'Intake events are written by the intake service only.',
              403,
            )
          if (data && operation === 'create') data.tenant = TENANT
          return data
        },
      ],
      beforeChange: [
        writeOnce('crm-intake-events', [
          'tenant',
          'source_system',
          'source_event_id',
          'source_form_id',
          'source_response_token',
          'raw_payload_hash',
          'raw_payload',
          'received_at',
          'signature_state',
        ]),
      ],
    },
    fields: [
      { name: 'tenant', type: 'text', required: true, defaultValue: TENANT, admin: { readOnly: true } },
      {
        name: 'source_system',
        type: 'select',
        required: true,
        options: options(['TYPEFORM', 'NATIVE_FORM', 'NATIVE_CHAT'] as const),
        index: true,
      },
      { name: 'source_event_id', type: 'text', required: true, index: true },
      { name: 'source_event_type', type: 'text' },
      { name: 'source_form_id', type: 'text', index: true },
      { name: 'source_response_token', type: 'text', index: true },
      // VERIFIED: Typeform HMAC signature. FORM_TOKEN_VERIFIED: native intake's signed timing token.
      { name: 'signature_state', type: 'select', required: true, options: options(['VERIFIED', 'FORM_TOKEN_VERIFIED'] as const) },
      { name: 'raw_payload_hash', type: 'text', required: true, index: true },
      {
        name: 'raw_payload',
        type: 'json',
        access: { read: crmAdminField },
        admin: { description: 'Admin-only. Exactly as received (parsed JSON), for audit and replay.' },
      },
      { name: 'received_at', type: 'date', required: true, index: true },
      {
        name: 'processing_state',
        type: 'select',
        required: true,
        defaultValue: 'PROCESSING',
        options: options(INTAKE_PROCESSING_STATE),
        index: true,
      },
      { name: 'failure_code', type: 'text' },
      {
        name: 'normalized_summary',
        type: 'json',
        admin: { description: 'Non-personal: which fields were present, context keys, match outcomes.' },
      },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', index: true },
      {
        name: 'processing_lease_until',
        type: 'date',
        admin: { readOnly: true, description: 'Processing claim lease (see intake/typeform/claim.ts).' },
      },
      { name: 'replay_count', type: 'number', required: true, defaultValue: 0 },
      { name: 'last_replay_at', type: 'date' },
      {
        name: 'conflicting_deliveries',
        type: 'array',
        admin: { description: 'Same event id, different payload — quarantined, never applied.' },
        fields: [
          { name: 'raw_payload_hash', type: 'text', required: true },
          { name: 'received_at', type: 'date', required: true },
        ],
      },
      { name: 'processed_at', type: 'date' },
      // RFQ-FIX-1.1: the sweeper's attempts on a stranded native request, and when it last tried (backoff)
      { name: 'sweep_attempts', type: 'number', defaultValue: 0, admin: { readOnly: true } },
      { name: 'last_sweep_at', type: 'date', admin: { readOnly: true } },
    ],
  },
  { deleteAlternative: 'Intake events are the evidence trail.' },
)
