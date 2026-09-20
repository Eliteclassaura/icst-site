import type { CollectionConfig } from 'payload'
import {
  anyone,
  canReadContentDrafts,
  canWriteContent,
  isAdmin,
  publishedOrContentReader,
} from '../access/index'
import { seoFields, slugField } from '../fields/index'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'

/**
 * Collection factories shared across layers.
 *
 * `taxonomy` is used by the editorial taxonomies and by the foundation `locations`; `content` by the
 * editorial content types and by the foundation `people`. Both bodies are carried over verbatim from
 * `collections/core.ts` and `collections/business.ts`; only their visibility changed, at the bottom of
 * this file, because they are now referenced across module boundaries.
 */

const taxonomy = (slug: string, group = 'Taxonomy'): CollectionConfig => ({
  slug,
  admin: { useAsTitle: 'name', group },
  access: { read: anyone, create: canWriteContent, update: canWriteContent, delete: isAdmin },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField(),
    { name: 'description', type: 'textarea' },
    seoFields(),
  ],
})

const content = (slug: string, group: string, extra: Partial<CollectionConfig> = {}): CollectionConfig => ({
  slug,
  admin: { useAsTitle: 'title', group, ...(extra.admin ?? {}) },
  versions: { drafts: true, maxPerDoc: 25 },
  access: {
    read: publishedOrContentReader,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
    readVersions: canReadContentDrafts,
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [],
  ...extra,
})

export { taxonomy, content }
