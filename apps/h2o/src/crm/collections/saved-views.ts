import type { Access, CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig, Where } from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { crmCollection } from '../collection'
import { userRelation } from '../fields'
import { CrmInvariantError, isServerContext, relId } from '../guards'
import { normalizeViewQuery, VIEW_LISTS } from '../workspace/views'
import { options } from '../vocabulary'

/**
 * Wave 1 W1-6 saved views: a named filter for one workspace list, per user, optionally shared by an admin.
 *
 * A view stores **only** a filter query that the server re-parses and rebuilds from the list's own validated
 * params (`normalizeViewQuery`): enums, UUIDs and sort keys. A search term is never part of a view (search terms
 * stay out of URLs and storage), so a view can't carry personal data. Views are user settings, not CRM records:
 * the owner may rename or delete their own; shared views are created, changed and deleted by admins only.
 */
const MAX_VIEWS_PER_USER = 25

const ownOrShared: Access = ({ req }) => {
  if (!hasRole(req, CRM_USERS) || !req.user) return false
  return { or: [{ owner: { equals: req.user.id } }, { shared: { equals: true } }] } as Where
}
/** Owners manage their own private views; admins manage shared views (and their own). */
const manageable: Access = ({ req }) => {
  if (!hasRole(req, CRM_USERS) || !req.user) return false
  if (hasRole(req, ADMINS)) return { or: [{ owner: { equals: req.user.id } }, { shared: { equals: true } }] } as Where
  return { and: [{ owner: { equals: req.user.id } }, { shared: { not_equals: true } }] } as Where
}

const stampOwner: CollectionBeforeValidateHook = ({ context, data, operation, originalDoc, req }) => {
  if (!data) return data
  const d = data as Record<string, unknown>
  if (operation === 'create') {
    if (!isServerContext(context)) d.owner = req.user ? req.user.id : null
  } else if (originalDoc && 'owner' in d && relId(d.owner) !== relId(originalDoc.owner))
    throw new CrmInvariantError('VIEW_OWNER_IMMUTABLE', 'A saved view’s owner cannot change.')
  return data
}

const viewRules: CollectionBeforeChangeHook = async ({ context, data, operation, originalDoc, req }) => {
  const list = String(data.list ?? originalDoc?.list ?? '')
  if (!(VIEW_LISTS as readonly string[]).includes(list)) throw new CrmInvariantError('VIEW_LIST_INVALID', 'Choose which list this view is for.')
  if (operation === 'update' && 'list' in data && originalDoc && data.list !== originalDoc.list) throw new CrmInvariantError('VIEW_LIST_IMMUTABLE', 'A view’s list cannot change.')
  const name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim().slice(0, 80) : (originalDoc?.name as string | undefined)
  if (!name) throw new CrmInvariantError('VIEW_NAME_REQUIRED', 'Name the view.')
  if ('name' in data) data.name = name
  // Only validated filters survive; anything else (free text, unknown keys, a search term) is dropped.
  if ('query' in data || operation === 'create') data.query = normalizeViewQuery(list as never, data.query)
  const sharing = 'shared' in data ? Boolean(data.shared) : Boolean(originalDoc?.shared)
  if (sharing !== Boolean(originalDoc?.shared) && !hasRole(req, ADMINS) && !isServerContext(context))
    throw new CrmInvariantError('VIEW_SHARE_PRIVILEGED', 'Only an admin can share a view with the team.', 403)
  if (operation === 'create' && req.user) {
    const mine = await req.payload.count({ collection: 'crm-saved-views', where: { owner: { equals: req.user.id } }, overrideAccess: true, req })
    if (mine.totalDocs >= MAX_VIEWS_PER_USER) throw new CrmInvariantError('VIEW_LIMIT', `You can keep up to ${MAX_VIEWS_PER_USER} saved views.`)
  }
  return data
}

export const CrmSavedViews: CollectionConfig = crmCollection(
  {
    slug: 'crm-saved-views',
    labels: { singular: 'Saved view', plural: 'Saved views' },
    access: { read: ownOrShared, update: manageable, delete: manageable },
    admin: {
      useAsTitle: 'name',
      description: 'Workspace saved filters (Wave 1). Filter keys only — never a search term or personal data.',
      defaultColumns: ['name', 'list', 'owner', 'shared', 'pinned'],
    },
    hooks: { beforeValidate: [stampOwner], beforeChange: [viewRules] },
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'list', type: 'select', required: true, options: options(VIEW_LISTS), index: true },
      { name: 'query', type: 'text', admin: { description: 'Validated filter query (rebuilt by the server).' } },
      userRelation('owner', 'Who saved it. Set by the server.'),
      { name: 'shared', type: 'checkbox', defaultValue: false, index: true, admin: { description: 'Shared with every CRM user (admins only).' } },
      { name: 'pinned', type: 'checkbox', defaultValue: false, admin: { description: 'Shown in the sidebar.' } },
    ],
  },
  { deleteAlternative: '', adminDelete: true },
)
