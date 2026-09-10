import type { CollectionConfig } from 'payload'
import { ROLES, ROLE_LABELS } from '../access/roles'
import {
  adminFieldOnly,
  anyone,
  canReadContentDrafts,
  canWriteContent,
  crmRead,
  isAdmin,
  isPlatformAdmin,
  nobody,
  publishedOrContentReader,
  selfOrAdmin,
} from '../access/index'
import {
  seoFields,
  slugField,
  verificationFields,
  publishFields,
  sourceFields,
  migrationFields,
  automationFields,
} from '../fields/index'
import { requireVerifiedToPublish, stampHumanEdit } from '../hooks/verification'
import { auditAfterChange, auditAfterDelete, auditAfterLogin } from '../hooks/audit'
import { layoutBlocks } from '../../blocks/payload'

/** Users — invite-only (no public create), roles admin-only, DB sessions with lockout. */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    useSessions: true,
    tokenExpiration: 60 * 60 * 8, // 8h
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
  },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'roles', 'updatedAt'], group: 'Access' },
  access: {
    // Invite-only: only admins create users. No self-signup route exists.
    create: isAdmin,
    read: selfOrAdmin,
    update: selfOrAdmin,
    delete: isPlatformAdmin,
    admin: ({ req }) => Boolean(req.user),
    unlock: isAdmin,
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete], afterLogin: [auditAfterLogin] },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['viewer'],
      options: ROLES.map((r) => ({ label: ROLE_LABELS[r], value: r })),
      access: { create: adminFieldOnly, update: adminFieldOnly },
      saveToJWT: true,
    },
    {
      name: 'invitedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
}

/** Media — site imagery (public read). Alt and rights are required before publish. CRM attachments are a separate, private collection. */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Content', defaultColumns: ['filename', 'alt', 'rights', 'updatedAt'] },
  access: { read: anyone, create: canWriteContent, update: canWriteContent, delete: isAdmin },
  upload: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'],
    imageSizes: [
      { name: 'w480', width: 480 },
      { name: 'w760', width: 760 },
      { name: 'w1100', width: 1100 },
      { name: 'w1600', width: 1600 },
      { name: 'og', width: 1200, height: 630, crop: 'center' },
    ],
    focalPoint: true,
    formatOptions: { format: 'webp', options: { quality: 78 } },
    adminThumbnail: 'w480',
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description:
          'Describe the image for people who cannot see it. Use "" only for purely decorative images (set decorative).',
      },
    },
    { name: 'decorative', type: 'checkbox', defaultValue: false },
    { name: 'caption', type: 'text' },
    {
      name: 'rights',
      type: 'select',
      required: true,
      options: ['owned', 'licensed', 'creative-commons', 'ai-generated', 'unknown'],
      admin: { description: 'Publish gate: "unknown" blocks production use (R34).' },
    },
    { name: 'credit', type: 'text' },
    ...sourceFields(),
  ],
}

/** Private uploads (CRM attachments, imports). Never public. */
export const PrivateFiles: CollectionConfig = {
  slug: 'private-files',
  admin: { group: 'CRM' },
  access: { read: crmRead, create: crmRead, update: crmRead, delete: isAdmin },
  upload: {
    mimeTypes: ['image/*', 'application/pdf', 'text/csv', 'application/json', 'text/plain'],
    disableLocalStorage: false,
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [{ name: 'label', type: 'text' }],
}

export const PAGE_TYPES = [
  'standard',
  'home',
  'service',
  'industry',
  'location',
  'about',
  'article',
  'category',
  'pricing',
  'comparison',
  'faq',
  'glossary',
  'contact',
  'legal',
  'campaign',
  'tool',
  'case-study',
  'build',
] as const

/** Pages — typed layout blocks from the component registry (C4, ADR-024). */
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'pageType', '_status', 'updatedAt'],
    group: 'Content',
    livePreview: {
      url: ({ data }) =>
        `/${(data as { slug?: string }).slug === 'home' ? '' : (data as { slug?: string }).slug + '/'}?preview=1`,
    },
  },
  versions: { drafts: { autosave: { interval: 800 }, schedulePublish: true }, maxPerDoc: 50 },
  access: {
    read: publishedOrContentReader,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
    readVersions: canReadContentDrafts,
  },
  hooks: {
    beforeChange: [requireVerifiedToPublish, stampHumanEdit],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'pageType',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: [...PAGE_TYPES],
      admin: { position: 'sidebar' },
    },
    { name: 'parent', type: 'relationship', relationTo: 'pages', admin: { position: 'sidebar' } },
    {
      name: 'layout',
      type: 'blocks',
      blocks: layoutBlocks,
      admin: {
        description:
          'Approved blocks only (the component registry). New block types are registry entries, never free-form HTML.',
      },
    },
    {
      name: 'legal',
      type: 'group',
      admin: { condition: (_, s) => s?.pageType === 'legal' },
      fields: [
        { name: 'effectiveDate', type: 'date' },
        { name: 'jurisdiction', type: 'text' },
        { name: 'version', type: 'text' },
      ],
    },
    ...publishFields(),
    seoFields(),
    verificationFields(),
    migrationFields(),
    automationFields(),
  ],
}

/** Posts — editorial (newsletter issues, insights). */
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'category', '_status', 'publishedAt'],
    group: 'Content',
  },
  versions: { drafts: { autosave: { interval: 800 }, schedulePublish: true }, maxPerDoc: 50 },
  access: {
    read: publishedOrContentReader,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
    readVersions: canReadContentDrafts,
  },
  hooks: {
    beforeChange: [requireVerifiedToPublish, stampHumanEdit],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    { name: 'excerpt', type: 'textarea', maxLength: 300 },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'body', type: 'richText' },
    { name: 'category', type: 'relationship', relationTo: 'categories', admin: { position: 'sidebar' } },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true, admin: { position: 'sidebar' } },
    {
      name: 'topics',
      type: 'relationship',
      relationTo: 'topics',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'issueNumber',
      type: 'number',
      admin: { position: 'sidebar', description: 'Newsletter issue number, if this post is an issue.' },
    },
    { name: 'related', type: 'relationship', relationTo: 'posts', hasMany: true },
    {
      name: 'updateHistory',
      type: 'array',
      fields: [
        { name: 'date', type: 'date', required: true },
        { name: 'note', type: 'text', required: true },
      ],
    },
    ...publishFields(),
    seoFields(),
    verificationFields(),
    migrationFields(),
    automationFields(),
  ],
}

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
export const Categories = taxonomy('categories')
export const Tags = taxonomy('tags')
export const Topics = taxonomy('topics')
export const Industries = taxonomy('industries', 'Business')
export const Locations: CollectionConfig = {
  ...taxonomy('locations', 'Business'),
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField(),
    { name: 'description', type: 'textarea' },
    { name: 'country', type: 'text', required: true, admin: { description: 'ISO 3166-1 alpha-2' } },
    { name: 'region', type: 'text' },
    seoFields(),
  ],
}

/** Audit log — append-only, admins read, nobody edits or deletes through the API. */
export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  admin: {
    group: 'Access',
    defaultColumns: ['createdAt', 'action', 'collection', 'docId', 'actorEmail'],
    useAsTitle: 'action',
  },
  access: { read: isAdmin, create: nobody, update: nobody, delete: nobody },
  timestamps: true,
  fields: [
    { name: 'action', type: 'text', required: true, index: true },
    { name: 'collection', type: 'text', required: true, index: true },
    { name: 'docId', type: 'text', index: true },
    { name: 'actor', type: 'text', index: true },
    { name: 'actorEmail', type: 'text' },
    { name: 'ip', type: 'text' },
    { name: 'changedKeys', type: 'json' },
    { name: 'summary', type: 'text' },
    {
      name: 'detail',
      type: 'json',
      admin: {
        description:
          'Metadata only — never field values from a PII collection, never prompt or completion text. Used by AI actions for provider/model/prompt version and token usage (C7).',
      },
    },
  ],
}
