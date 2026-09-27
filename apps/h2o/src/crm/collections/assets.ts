import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmCollection, stampProvenance } from '../collection'
import { provenanceGroup } from '../fields'
import { CrmInvariantError, merged, relId, writeOnce } from '../guards'
import {
  ASSET_CONDITION_STATE,
  ASSET_STATE,
  ASSET_TECHNICAL_FACTS,
  EVIDENCE_VERIFICATION,
  options,
  type AssetTechnicalFact,
} from '../vocabulary'

/** The account is derived from the site on the server. A client-supplied account is never trusted. */
const deriveAccountFromSite: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const siteId = relId(merged(data, originalDoc).site)
  if (!siteId) throw new CrmInvariantError('ASSET_SITE_REQUIRED', 'A cooling tower belongs to a plant/site.')
  const site = await req.payload.findByID({
    collection: 'crm-sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
    req,
  })
  data.account = relId((site as { account?: unknown }).account)
  return data
}

const isSet = (fact: AssetTechnicalFact, value: unknown): boolean =>
  fact === 'condition_state'
    ? value !== undefined && value !== null && value !== 'UNKNOWN'
    : value !== undefined && value !== null && value !== ''

/**
 * E1.2 evidence discipline, enforced rather than requested: every non-empty technical fact must cite
 * evidence for *that* fact. A manufacturer typed from memory, or a condition inferred from age, has no
 * evidence row and is refused. `condition_state` = UNKNOWN is the honest default and needs none.
 *
 * Nothing here infers a replacement need from age, prior repair, maintenance or inspection — there is no
 * code path that sets `condition_state` at all; only a person with evidence can.
 */
const technicalFactsNeedEvidence: CollectionBeforeChangeHook = ({ data: incoming, originalDoc }) => {
  const data = merged(incoming, originalDoc)
  const evidence = (
    (data.technical_evidence ?? []) as Array<{ fact?: string; evidence_ref?: string | null }>
  ).filter((e) => typeof e.evidence_ref === 'string' && e.evidence_ref.trim() !== '')
  for (const fact of ASSET_TECHNICAL_FACTS) {
    if (!isSet(fact, (data as Record<string, unknown>)[fact])) continue
    if (!evidence.some((e) => e.fact === fact))
      throw new CrmInvariantError(
        'ASSET_FACT_WITHOUT_EVIDENCE',
        `${fact} is set but has no evidence row. Leave it empty (unknown) or cite the evidence.`,
      )
  }
  return incoming
}

export const CrmAssets: CollectionConfig = crmCollection(
  {
    slug: 'crm-assets',
    labels: { singular: 'Cooling Tower Asset', plural: 'Cooling Tower Assets' },
    admin: {
      useAsTitle: 'asset_name',
      description:
        'Installed base. Every technical fact cites evidence; unknown stays unknown. No need is inferred from age or history.',
      defaultColumns: [
        'asset_name',
        'internal_reference',
        'site',
        'manufacturer',
        'condition_state',
        'asset_state',
      ],
      listSearchableFields: ['asset_name', 'internal_reference', 'manufacturer', 'model'],
    },
    hooks: {
      beforeValidate: [stampProvenance],
      beforeChange: [writeOnce('crm-assets', ['site']), deriveAccountFromSite, technicalFactsNeedEvidence],
    },
    fields: [
      { name: 'site', type: 'relationship', relationTo: 'crm-sites', required: true, index: true },
      {
        name: 'account',
        type: 'relationship',
        relationTo: 'crm-accounts',
        index: true,
        admin: { readOnly: true, description: 'Derived from the site.' },
      },
      { name: 'asset_name', type: 'text' },
      {
        name: 'internal_reference',
        type: 'text',
        index: true,
        admin: { description: 'ICS or customer tag. Not a canonical id.' },
      },
      { name: 'manufacturer', type: 'text' },
      { name: 'model', type: 'text' },
      { name: 'tower_type', type: 'text' },
      { name: 'material', type: 'text' },
      { name: 'cell_count', type: 'number', min: 1 },
      { name: 'commissioned_year', type: 'number', min: 1900, max: 2200 },
      {
        name: 'condition_state',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(ASSET_CONDITION_STATE),
        index: true,
      },
      {
        name: 'asset_state',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(ASSET_STATE),
        index: true,
      },
      {
        name: 'technical_evidence',
        type: 'array',
        admin: { description: 'One row per evidenced fact.' },
        fields: [
          { name: 'fact', type: 'select', required: true, options: options(ASSET_TECHNICAL_FACTS) },
          { name: 'evidence_ref', type: 'text', required: true },
          {
            name: 'verification_state',
            type: 'select',
            required: true,
            defaultValue: 'UNKNOWN',
            options: options(EVIDENCE_VERIFICATION),
          },
          { name: 'observed_at', type: 'date' },
        ],
      },
      {
        name: 'known_dates',
        type: 'array',
        admin: { description: 'Installation, rebuild, inspection… only with evidence.' },
        fields: [
          {
            name: 'date_kind',
            type: 'select',
            required: true,
            options: options([
              'INSTALLED',
              'COMMISSIONED',
              'REBUILT',
              'INSPECTED',
              'SERVICED',
              'OTHER',
            ] as const),
          },
          { name: 'date_value', type: 'date', required: true },
          { name: 'evidence_ref', type: 'text', required: true },
        ],
      },
      provenanceGroup(),
      { name: 'service_history', type: 'join', collection: 'crm-activities', on: 'asset' },
      { name: 'opportunities', type: 'join', collection: 'crm-opportunities', on: 'assets' },
    ],
  },
  { deleteAlternative: 'Set asset_state to RETIRED.' },
)
