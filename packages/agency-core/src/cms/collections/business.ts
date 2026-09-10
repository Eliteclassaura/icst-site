import type { CollectionConfig } from 'payload'
import {
  anyone,
  canReadContentDrafts,
  canWriteContent,
  isAdmin,
  publishedOrContentReader,
} from '../access/index'
import { seoFields, slugField, verificationFields, sourceFields } from '../fields/index'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'

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

/** People — authors, team, the founder. Feeds Person schema and E-E-A-T blocks. */
export const People: CollectionConfig = content('people', 'Business', {
  admin: { useAsTitle: 'name', group: 'Business' },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField(),
    { name: 'jobTitle', type: 'text' },
    { name: 'bio', type: 'richText' },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    { name: 'sameAs', type: 'array', fields: [{ name: 'url', type: 'text', required: true }] },
    { name: 'knowsAbout', type: 'array', fields: [{ name: 'topic', type: 'text', required: true }] },
    { name: 'location', type: 'relationship', relationTo: 'locations' },
    { name: 'isAuthor', type: 'checkbox', defaultValue: false },
    { name: 'isTeam', type: 'checkbox', defaultValue: true },
    {
      name: 'schemaId',
      type: 'text',
      admin: { description: 'Stable JSON-LD @id, e.g. https://syed.ai/#person' },
    },
    seoFields(),
    verificationFields(),
  ],
})

/** Services / offers — the three engagements; Service + Offer schema when factual. */
export const Services: CollectionConfig = content('services', 'Business', {
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    { name: 'summary', type: 'textarea' },
    { name: 'body', type: 'richText' },
    {
      name: 'offer',
      type: 'group',
      fields: [
        {
          name: 'price',
          type: 'number',
          admin: { description: 'Numeric, no currency symbol. Rendered in OfferCatalog only when verified.' },
        },
        { name: 'currency', type: 'text', defaultValue: 'USD' },
        { name: 'billing', type: 'select', options: ['fixed', 'monthly', 'quote'] },
        { name: 'includes', type: 'array', fields: [{ name: 'item', type: 'text', required: true }] },
        { name: 'availability', type: 'select', options: ['available', 'limited', 'waitlist'] },
      ],
    },
    { name: 'order', type: 'number', admin: { position: 'sidebar' } },
    { name: 'schemaId', type: 'text' },
    seoFields(),
    verificationFields(),
  ],
})

/** Offices — LocalBusiness nodes with hours and geo (all facts need verification). */
export const Offices: CollectionConfig = content('offices', 'Business', {
  admin: { useAsTitle: 'name', group: 'Business' },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField(),
    { name: 'description', type: 'textarea' },
    {
      name: 'address',
      type: 'group',
      fields: [
        { name: 'street', type: 'text' },
        { name: 'locality', type: 'text', required: true },
        { name: 'region', type: 'text' },
        { name: 'postalCode', type: 'text' },
        { name: 'country', type: 'text', required: true },
      ],
    },
    {
      name: 'geo',
      type: 'group',
      fields: [
        { name: 'latitude', type: 'number', min: -90, max: 90 },
        { name: 'longitude', type: 'number', min: -180, max: 180 },
      ],
      admin: {
        description: 'Plain numbers, not a PostGIS point — keeps client databases dependency-free (ADR-022).',
      },
    },
    { name: 'telephone', type: 'text' },
    {
      name: 'hours',
      type: 'array',
      fields: [
        {
          name: 'days',
          type: 'select',
          hasMany: true,
          options: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
          required: true,
        },
        { name: 'opens', type: 'text', required: true },
        { name: 'closes', type: 'text', required: true },
      ],
    },
    {
      name: 'hoursDisplay',
      type: 'text',
      admin: {
        description:
          'Human form for the footer, e.g. "Mon–Fri · 9–6 ET (UTC−5)". Structured `hours` feeds schema.',
      },
    },
    {
      name: 'footerRole',
      type: 'text',
      admin: { description: 'Short role shown in the footer, e.g. "Strategy & client work".' },
    },
    { name: 'areaServed', type: 'text' },
    { name: 'schemaId', type: 'text' },
    verificationFields(),
  ],
})

/** Case studies — modelled scenarios must be labelled as such. */
export const CaseStudies: CollectionConfig = content('case-studies', 'Content', {
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'modelled',
      options: ['client-result', 'modelled'],
      admin: {
        description:
          'Modelled scenarios render with an explicit label. Client results need the client’s consent recorded.',
      },
    },
    {
      name: 'consentRecorded',
      type: 'checkbox',
      admin: { condition: (_, s) => s?.kind === 'client-result' },
    },
    { name: 'track', type: 'text' },
    { name: 'client', type: 'text' },
    { name: 'scale', type: 'text' },
    { name: 'span', type: 'text' },
    { name: 'blurb', type: 'textarea' },
    { name: 'problem', type: 'richText' },
    { name: 'benchmark', type: 'textarea', admin: { description: '"Calibrated against" sources.' } },
    {
      name: 'diagnostics',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
        { name: 'note', type: 'text' },
      ],
    },
    {
      name: 'plays',
      type: 'array',
      fields: [
        { name: 'heading', type: 'text', required: true },
        { name: 'body', type: 'textarea', required: true },
      ],
    },
    {
      name: 'phases',
      type: 'array',
      fields: [
        { name: 'month', type: 'text', required: true },
        { name: 'heading', type: 'text', required: true },
        { name: 'body', type: 'textarea' },
      ],
    },
    {
      name: 'results',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'from', type: 'text', required: true },
        { name: 'to', type: 'text', required: true },
      ],
    },
    {
      name: 'chart',
      type: 'group',
      fields: [
        { name: 'caption', type: 'text' },
        { name: 'unit', type: 'text' },
        { name: 'labels', type: 'json' },
        { name: 'series', type: 'json' },
      ],
    },
    {
      name: 'kpis',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
      ],
    },
    { name: 'stack', type: 'array', fields: [{ name: 'item', type: 'text', required: true }] },
    { name: 'aiInTheLoop', type: 'richText' },
    { name: 'lever', type: 'textarea' },
    {
      name: 'sources',
      type: 'array',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'url', type: 'text' },
        { name: 'detail', type: 'text' },
      ],
    },
    { name: 'featured', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar' } },
    { name: 'order', type: 'number', admin: { position: 'sidebar' } },
    seoFields(),
    verificationFields(),
  ],
})

/** Ventures / builds — the "building" cards. Progress % and statuses are owner-verified facts. */
export const Ventures: CollectionConfig = content('ventures', 'Content', {
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['live', 'beta', 'open-beta', 'wip', 'paused'],
    },
    { name: 'progress', type: 'number', min: 0, max: 100 },
    { name: 'metric', type: 'text', admin: { description: 'Alternative to progress, e.g. "14 shipped".' } },
    { name: 'one', type: 'text' },
    { name: 'body', type: 'richText' },
    {
      name: 'details',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
      ],
    },
    { name: 'next', type: 'text' },
    { name: 'team', type: 'text' },
    { name: 'stack', type: 'array', fields: [{ name: 'item', type: 'text', required: true }] },
    { name: 'order', type: 'number', admin: { position: 'sidebar' } },
    seoFields(),
    verificationFields(),
  ],
})

export const Testimonials: CollectionConfig = content('testimonials', 'Content', {
  admin: { useAsTitle: 'attribution', group: 'Content' },
  fields: [
    { name: 'quote', type: 'textarea', required: true },
    { name: 'attribution', type: 'text', required: true },
    { name: 'role', type: 'text' },
    { name: 'company', type: 'text' },
    {
      name: 'consentRecorded',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      admin: { description: 'Real testimonials need written consent. Never fabricate.' },
    },
    ...sourceFields(),
    verificationFields(),
  ],
})

export const FAQs: CollectionConfig = content('faqs', 'Content', {
  admin: { useAsTitle: 'question', group: 'Content' },
  fields: [
    { name: 'question', type: 'text', required: true },
    { name: 'answer', type: 'richText', required: true },
    {
      name: 'pages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      admin: { description: 'FAQPage schema is emitted only where the Q&A is visible.' },
    },
    { name: 'order', type: 'number', admin: { position: 'sidebar' } },
    verificationFields(),
  ],
})

export const GlossaryTerms: CollectionConfig = content('glossary-terms', 'Content', {
  admin: { useAsTitle: 'term', group: 'Content' },
  fields: [
    { name: 'term', type: 'text', required: true },
    slugField(),
    {
      name: 'anchor',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Stable fragment id used in URLs and DefinedTerm @id — never change after publish.',
      },
    },
    { name: 'definition', type: 'richText', required: true },
    { name: 'whyItMatters', type: 'textarea' },
    { name: 'howMeasured', type: 'textarea' },
    { name: 'order', type: 'number', admin: { position: 'sidebar' } },
    verificationFields(),
  ],
})

/** Citations — third-party evidence referenced by stats and articles. */
export const Citations: CollectionConfig = {
  slug: 'citations',
  admin: { useAsTitle: 'title', group: 'Content' },
  access: { read: anyone, create: canWriteContent, update: canWriteContent, delete: isAdmin },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'publisher', type: 'text', required: true },
    { name: 'url', type: 'text' },
    { name: 'publishedAt', type: 'date' },
    { name: 'accessedAt', type: 'date' },
    { name: 'note', type: 'textarea' },
    verificationFields(),
  ],
}

/** Evidence stats — the numbers in the evidence grid, each tied to a citation. */
export const EvidenceStats: CollectionConfig = content('evidence-stats', 'Content', {
  admin: { useAsTitle: 'label', group: 'Content' },
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'value', type: 'number', required: true },
    {
      name: 'format',
      type: 'group',
      fields: [
        { name: 'prefix', type: 'text' },
        { name: 'suffix', type: 'text' },
        { name: 'decimals', type: 'number', defaultValue: 0 },
        { name: 'comma', type: 'checkbox', defaultValue: false },
      ],
    },
    { name: 'note', type: 'textarea' },
    { name: 'citation', type: 'relationship', relationTo: 'citations', required: true },
    { name: 'order', type: 'number', admin: { position: 'sidebar' } },
    verificationFields(),
  ],
})

export const CTAs: CollectionConfig = content('ctas', 'Content', {
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea' },
    {
      name: 'primary',
      type: 'group',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text' },
        { name: 'chatMode', type: 'select', options: ['brief', 'roadmap'] },
      ],
    },
    {
      name: 'secondary',
      type: 'group',
      fields: [
        { name: 'label', type: 'text' },
        { name: 'href', type: 'text' },
      ],
    },
    { name: 'image', type: 'upload', relationTo: 'media' },
  ],
})

/** Interactive tool data (simulator, scorecard, revenue model) — editorial models, labelled as such. */
export const SimulatorPrompts: CollectionConfig = content('simulator-prompts', 'Tools', {
  admin: { useAsTitle: 'question', group: 'Tools' },
  fields: [
    { name: 'category', type: 'text', required: true },
    { name: 'question', type: 'text', required: true },
    {
      name: 'before',
      type: 'group',
      fields: [
        { name: 'body', type: 'textarea', required: true },
        {
          name: 'sources',
          type: 'array',
          fields: [
            { name: 'n', type: 'number', required: true },
            { name: 'host', type: 'text', required: true },
            { name: 'isClient', type: 'checkbox' },
          ],
        },
        { name: 'note', type: 'text' },
      ],
    },
    {
      name: 'after',
      type: 'group',
      fields: [
        { name: 'body', type: 'textarea', required: true },
        {
          name: 'sources',
          type: 'array',
          fields: [
            { name: 'n', type: 'number', required: true },
            { name: 'host', type: 'text', required: true },
            { name: 'isClient', type: 'checkbox' },
          ],
        },
        { name: 'note', type: 'text' },
      ],
    },
    { name: 'order', type: 'number', admin: { position: 'sidebar' } },
  ],
})

export const ScorecardQuestions: CollectionConfig = content('scorecard-questions', 'Tools', {
  admin: { useAsTitle: 'title', group: 'Tools' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'weight', type: 'number', required: true },
    {
      name: 'options',
      type: 'array',
      minRows: 2,
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'score', type: 'number', required: true },
      ],
    },
    { name: 'fix', type: 'textarea', admin: { description: 'Shown when this question scores low.' } },
    { name: 'order', type: 'number', admin: { position: 'sidebar' } },
  ],
})

export const ScorecardBands: CollectionConfig = content('scorecard-bands', 'Tools', {
  admin: { useAsTitle: 'name', group: 'Tools' },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'min', type: 'number', required: true },
    { name: 'max', type: 'number', required: true },
    { name: 'copy', type: 'textarea' },
  ],
})

export const RevenueModelPrograms: CollectionConfig = content('revenue-model-programs', 'Tools', {
  admin: { useAsTitle: 'name', group: 'Tools' },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true },
    { name: 'name', type: 'text', required: true },
    { name: 'sessionsMultiplier', type: 'number', required: true },
    { name: 'conversionMultiplier', type: 'number', required: true },
    { name: 'defaultFee', type: 'number', required: true },
    { name: 'note', type: 'textarea' },
    verificationFields(),
  ],
})

export const Notices: CollectionConfig = content('notices', 'Content', {
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea', required: true },
    { name: 'href', type: 'text' },
    { name: 'from', type: 'date' },
    { name: 'until', type: 'date' },
    {
      name: 'placement',
      type: 'select',
      defaultValue: 'announcement',
      options: ['announcement', 'hero-status', 'footer'],
    },
  ],
})

export const SchemaEntities: CollectionConfig = {
  slug: 'schema-entities',
  admin: {
    useAsTitle: 'name',
    group: 'SEO',
    description:
      'Reusable JSON-LD nodes (Organization, WebSite, Brand). Facts only — never fabricated ratings or reviews.',
  },
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'schemaId', type: 'text', required: true, unique: true, admin: { description: 'Stable @id.' } },
    {
      name: 'type',
      type: 'text',
      required: true,
      admin: { description: '@type; comma-separate multiple (ProfessionalService, Organization).' },
    },
    {
      name: 'data',
      type: 'json',
      required: true,
      admin: { description: 'Node body without @context/@id/@type.' },
    },
    {
      name: 'emitOn',
      type: 'select',
      defaultValue: 'all',
      options: ['all', 'home', 'none'],
      admin: {
        description:
          'Which pages include this node in their JSON-LD graph. Site-wide entities (Organization, Person) emit everywhere; Blog only on the home page.',
      },
    },
    verificationFields(),
  ],
}

export const SEOTemplates: CollectionConfig = {
  slug: 'seo-templates',
  admin: { useAsTitle: 'name', group: 'SEO' },
  access: { read: anyone, create: isAdmin, update: canWriteContent, delete: isAdmin },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'appliesTo',
      type: 'select',
      hasMany: true,
      options: ['pages', 'posts', 'services', 'case-studies', 'glossary-terms'],
    },
    {
      name: 'titleTemplate',
      type: 'text',
      required: true,
      admin: { description: 'e.g. "{title} | syed.ai"' },
    },
    { name: 'descriptionTemplate', type: 'textarea' },
  ],
}
