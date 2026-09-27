import type { CollectionConfig } from 'payload'
import { crmCollection, stampProvenance } from '../collection'
import { countryCodeField, provenanceGroup } from '../fields'
import { writeOnce } from '../guards'
import { LINK_CONFIDENCE, SITE_STATE, options } from '../vocabulary'

/**
 * Plant / Site (E0.1 `site.schema.json`).
 *
 * Identity is the canonical id and the account it belongs to — **not** the address. Two sites with the same
 * name or address are two records until a person decides otherwise; nothing here merges or de-duplicates by
 * text. Moving a site to another account would silently re-parent its towers and projects, so `account` is
 * write-once: a wrongly attached site is archived and recreated, visibly.
 */
export const CrmSites: CollectionConfig = crmCollection(
  {
    slug: 'crm-sites',
    labels: { singular: 'Plant / Site', plural: 'Plants / Sites' },
    admin: {
      useAsTitle: 'site_name',
      description:
        'Plants and sites. Address and geography only when known. Never merged because names look alike.',
      defaultColumns: ['site_name', 'account', 'city', 'country_code', 'site_state'],
      listSearchableFields: ['site_name', 'city', 'region'],
    },
    hooks: {
      beforeValidate: [stampProvenance],
      beforeChange: [writeOnce('crm-sites', ['account'])],
    },
    fields: [
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', required: true, index: true },
      { name: 'site_name', type: 'text', required: true, index: true },
      { name: 'address', type: 'textarea' },
      { name: 'city', type: 'text' },
      { name: 'region', type: 'text' },
      countryCodeField(),
      { name: 'industry_application', type: 'text' },
      { name: 'sales_region', type: 'text' },
      {
        name: 'site_link_confidence',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(LINK_CONFIDENCE),
      },
      {
        name: 'site_state',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(SITE_STATE),
        index: true,
      },
      provenanceGroup(),
      { name: 'assets', type: 'join', collection: 'crm-assets', on: 'site' },
      { name: 'opportunities', type: 'join', collection: 'crm-opportunities', on: 'site' },
      { name: 'rfqs', type: 'join', collection: 'crm-rfqs', on: 'site' },
    ],
  },
  { deleteAlternative: 'Set site_state to INACTIVE.' },
)
