import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Where,
} from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { recordActivity } from '../activity'
import { crmCollection } from '../collection'
import { CrmInvariantError, relId } from '../guards'

type Doc = Record<string, unknown>

/** Notes are restricted-read CRM content: editable by their author or an admin, deletable by an admin. */
const authorOrAdmin: Access = ({ req }) => {
  if (hasRole(req, ADMINS)) return true
  if (!hasRole(req, CRM_USERS) || !req.user) return false
  return { author: { equals: req.user.id } } as Where
}

const stampAuthor: CollectionBeforeValidateHook = ({ data, operation, originalDoc, req }) => {
  if (!data) return data
  if (operation === 'create') data.author = req.user ? req.user.id : null
  else if (originalDoc && 'author' in data && relId(data.author) !== relId(originalDoc.author))
    throw new CrmInvariantError('NOTE_AUTHOR_IMMUTABLE', 'A note’s author cannot change.')
  const subjects = ['account', 'contact', 'site', 'asset', 'opportunity', 'rfq'].filter(
    (f) => relId((data as Doc)[f] ?? (originalDoc as Doc | undefined)?.[f]) !== null,
  )
  if (subjects.length === 0)
    throw new CrmInvariantError('NOTE_WITHOUT_SUBJECT', 'A note must relate to at least one CRM record.')
  return data
}

const timeline: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  const d = doc as Doc
  await recordActivity(req, {
    type: 'NOTE_ADDED',
    summary: 'Note added',
    idempotency_key: `note-added:${String(d.canonical_id)}`,
    account: relId(d.account),
    contact: relId(d.contact),
    site: relId(d.site),
    asset: relId(d.asset),
    opportunity: relId(d.opportunity),
    rfq: relId(d.rfq),
    detail: { note: String(d.id) },
  })
  return doc
}

export const CrmNotes: CollectionConfig = crmCollection(
  {
    slug: 'crm-notes',
    labels: { singular: 'Note', plural: 'Notes' },
    access: { update: authorOrAdmin, delete: ({ req }) => hasRole(req, ADMINS) },
    admin: {
      useAsTitle: 'canonical_id',
      description:
        'Human notes. The timeline records that a note was added; the text stays here, access-controlled.',
      defaultColumns: ['createdAt', 'author', 'account', 'opportunity', 'rfq'],
    },
    hooks: { beforeValidate: [stampAuthor], afterChange: [timeline] },
    fields: [
      { name: 'body', type: 'textarea', required: true },
      { name: 'author', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', index: true },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', index: true },
      { name: 'site', type: 'relationship', relationTo: 'crm-sites', index: true },
      { name: 'asset', type: 'relationship', relationTo: 'crm-assets', index: true },
      { name: 'opportunity', type: 'relationship', relationTo: 'crm-opportunities', index: true },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', index: true },
    ],
  },
  { deleteAlternative: '', adminDelete: true },
)
