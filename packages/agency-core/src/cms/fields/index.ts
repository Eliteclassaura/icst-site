import type { Field, GroupField, TextField } from 'payload'
import { adminFieldOnly } from '../access/index'

/** URL slug; unique per collection; lower-kebab enforced. */
export const slugField = (opts: { required?: boolean } = {}): TextField => ({
  name: 'slug',
  type: 'text',
  required: opts.required ?? true,
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Lower-case, hyphenated. Changing a published slug creates a redirect (see Redirects).',
  },
  validate: (val: unknown) =>
    typeof val === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val)
      ? true
      : 'Use lower-case letters, digits and hyphens only.',
})

/**
 * SEO group (master prompt §Technical SEO). Editorial planning data, not ranking switches.
 * Empty title/description fall back to templates at render time.
 */
export const seoFields = (): GroupField => ({
  name: 'seo',
  type: 'group',
  label: 'SEO',
  fields: [
    {
      name: 'title',
      type: 'text',
      maxLength: 70,
      admin: { description: 'Falls back to the page title + site template.' },
    },
    { name: 'description', type: 'textarea', maxLength: 170 },
    {
      name: 'canonical',
      type: 'text',
      admin: { description: 'Absolute URL. Leave empty to self-canonicalise.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'noindex',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            width: '50%',
            description: 'Launch gate blocks an indexable page accidentally set to noindex.',
          },
        },
        { name: 'nofollow', type: 'checkbox', defaultValue: false, admin: { width: '50%' } },
      ],
    },
    {
      name: 'lock',
      type: 'checkbox',
      defaultValue: false,
      access: { update: adminFieldOnly },
      admin: {
        description:
          'SEO-locked: indexability and canonical may only change through an admin or a page-decisions run (ADR-028). Set for ranking URLs.',
      },
    },
    {
      name: 'noindexReason',
      type: 'text',
      admin: {
        condition: (_, s) => Boolean(s?.noindex),
        description: 'Required when noindex is on; prevents accidental noindex.',
      },
    },
    {
      name: 'ogTitle',
      type: 'text',
      maxLength: 110,
      admin: { description: 'Only when the social title should differ from the SEO title.' },
    },
    {
      name: 'ogDescription',
      type: 'textarea',
      maxLength: 300,
      admin: { description: 'Only when the social description should differ.' },
    },
    { name: 'ogImage', type: 'upload', relationTo: 'media' },
    {
      name: 'ogImageUrl',
      type: 'text',
      admin: {
        description:
          'Root-relative or absolute image URL when the social image is a static asset (legacy /assets/img/og-*.jpg). Overrides ogImage.',
      },
    },
    { name: 'ogImageAlt', type: 'text', maxLength: 200 },
    {
      name: 'twitterDescription',
      type: 'textarea',
      maxLength: 300,
      admin: { description: 'Only when it should differ from the OG description.' },
    },
    { name: 'twitterImageAlt', type: 'text', maxLength: 200 },
    { name: 'primaryTopic', type: 'text', admin: { description: 'Planning data only.' } },
    { name: 'breadcrumbTitle', type: 'text' },
    {
      name: 'schemaExtra',
      type: 'json',
      admin: {
        description:
          'Legacy-carried JSON-LD fragments the builders merge: { webpage: {...}, article: {...}, howTo: {...} }. Shrinks as more is generated from data (ADR-025).',
      },
    },
    {
      name: 'schemaTypes',
      type: 'select',
      hasMany: true,
      options: [
        'WebPage',
        'Article',
        'BlogPosting',
        'Service',
        'FAQPage',
        'HowTo',
        'DefinedTermSet',
        'Person',
        'Organization',
        'LocalBusiness',
        'OfferCatalog',
        'ProfilePage',
      ],
      admin: {
        description: 'Only types the visible content supports. FAQPage requires visible Q&A on the page.',
      },
    },
    { name: 'citations', type: 'relationship', relationTo: 'citations', hasMany: true },
    {
      type: 'row',
      fields: [
        { name: 'reviewedAt', type: 'date', admin: { width: '50%' } },
        { name: 'contentUpdatedAt', type: 'date', admin: { width: '50%' } },
      ],
    },
  ],
})

/** Content-verification group (ADR-016). Production launch gate blocks `unverified` facts on indexable pages. */
export const verificationFields = (): GroupField => ({
  name: 'verification',
  type: 'group',
  label: 'Verification',
  admin: { position: 'sidebar' },
  fields: [
    {
      name: 'status',
      type: 'select',
      defaultValue: 'unverified',
      options: ['unverified', 'verified', 'needs-change'],
      required: true,
    },
    { name: 'verifiedBy', type: 'relationship', relationTo: 'users', access: { update: adminFieldOnly } },
    { name: 'verifiedAt', type: 'date' },
    { name: 'note', type: 'textarea' },
  ],
})

/** Editorial publish metadata used by feeds/schema. */
export const publishFields = (): Field[] => [
  {
    name: 'publishedAt',
    type: 'date',
    admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
  },
  {
    name: 'authors',
    type: 'relationship',
    relationTo: 'people',
    hasMany: true,
    admin: { position: 'sidebar' },
  },
]

/** Minimal rich text (Lexical) — configured by the app via `editor`; here we only declare the field. */
export const richTextField = (name = 'body', required = false): Field => ({
  name,
  type: 'richText',
  required,
})

/** Reusable "source & rights" for anything that asserts a fact or shows an image. */
export const sourceFields = (): Field[] => [
  {
    name: 'source',
    type: 'text',
    admin: { description: 'Where this came from (publisher, URL, photographer).' },
  },
  { name: 'sourceUrl', type: 'text' },
  { name: 'sourceDate', type: 'date' },
]

/**
 * Migration provenance (ADR-028 §8; blueprint v2 `pages[].migration`). Ties a document to the source URL it
 * came from, the content hash of the source and the decisions run that shaped it. Admin-only, read-only in
 * the UI; written by the seed / importer.
 */
export const migrationFields = (): GroupField => ({
  name: 'migration',
  type: 'group',
  label: 'Migration provenance',
  access: { read: adminFieldOnly, update: adminFieldOnly },
  admin: { position: 'sidebar', description: 'Written by the importer. Where this document came from.' },
  fields: [
    { name: 'sourceUrl', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'sourceId', type: 'text', admin: { readOnly: true } },
    {
      name: 'sourceSystem',
      type: 'select',
      options: ['wordpress', 'static-html', 'copy-deck', 'other'],
      admin: { readOnly: true },
    },
    { name: 'originalTitle', type: 'text', admin: { readOnly: true } },
    { name: 'originalMetaDescription', type: 'textarea', admin: { readOnly: true } },
    { name: 'originalH1', type: 'text', admin: { readOnly: true } },
    { name: 'originalWordCount', type: 'number', admin: { readOnly: true } },
    { name: 'contentHash', type: 'text', admin: { readOnly: true } },
    { name: 'importedAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'decisionsVersion',
      type: 'text',
      index: true,
      admin: { readOnly: true, description: 'page-decisions run_id (ULID) last applied.' },
    },
    {
      name: 'decisionAction',
      type: 'select',
      options: [
        'PROTECT',
        'IMPROVE',
        'REWRITE',
        'REPOSITION',
        'CONSOLIDATE',
        'REDIRECT',
        'NOINDEX',
        'PRUNE',
        'REVIEW',
      ],
      admin: { readOnly: true },
    },
  ],
})

/** Machine-write bookkeeping (ADR-028 §4): set by the automation hooks, never by hand. */
export const automationFields = (): GroupField => ({
  name: 'automation',
  type: 'group',
  label: 'Automation',
  access: { read: adminFieldOnly, update: adminFieldOnly },
  admin: { position: 'sidebar', description: 'Pending machine drafts and the run that wrote them.' },
  fields: [
    { name: 'pendingReview', type: 'checkbox', defaultValue: false, index: true, admin: { readOnly: true } },
    { name: 'runId', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'lastAutomationAt', type: 'date', admin: { readOnly: true } },
    { name: 'lastHumanEditAt', type: 'date', admin: { readOnly: true } },
  ],
})
