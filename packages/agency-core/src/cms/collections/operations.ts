import type { CollectionConfig } from 'payload'
import { anyone, canWriteContent, crmRead, crmWrite, isAdmin, nobody, roles } from '../access/index'
import { verificationFields } from '../fields/index'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'

/**
 * Redirects — every removed or renamed ranking URL gets a row. Loops are rejected.
 * `status` (ADR-028 §6): only `active` rows are served; automation may create `proposed` rows, a human
 * activates them (or the next Lane-A blueprint apply adopts/removes them). Nothing unattended changes a
 * ranking URL.
 */
export const Redirects: CollectionConfig = {
  slug: 'redirects',
  admin: {
    useAsTitle: 'from',
    group: 'SEO',
    defaultColumns: ['from', 'to', 'statusCode', 'status', 'source', 'updatedAt'],
  },
  access: { read: anyone, create: canWriteContent, update: canWriteContent, delete: isAdmin },
  hooks: {
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
    beforeValidate: [
      ({ data }) => {
        if (data?.from && data?.to && data.from === data.to)
          throw new Error('Redirect from and to are identical (loop).')
        if (data && String(data.statusCode) !== '410' && !data.to)
          throw new Error('A redirect needs a target unless it is a 410.')
        return data
      },
    ],
  },
  fields: [
    {
      name: 'from',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'Path, e.g. /old-page/ (trailing slash form).' },
    },
    { name: 'to', type: 'text', admin: { description: 'Path or absolute URL. Empty only for 410.' } },
    {
      name: 'statusCode',
      type: 'select',
      required: true,
      defaultValue: '308',
      options: ['301', '308', '410'],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'proposed',
      index: true,
      options: ['proposed', 'active'],
      admin: {
        position: 'sidebar',
        description: 'Only active redirects are served. Automation can only propose; a person activates.',
      },
    },
    { name: 'reason', type: 'text' },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      options: ['manual', 'slug-change', 'migration', 'legacy-hash', 'automation'],
    },
    {
      name: 'runId',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'page-decisions / automation run that proposed it.',
      },
    },
    {
      name: 'activatedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
    { name: 'activatedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
  ],
}

/** Forms — configuration for public intake (fields, options, copy). Submissions are separate and private. */
export const Forms: CollectionConfig = {
  slug: 'forms',
  admin: { useAsTitle: 'name', group: 'Intake' },
  access: { read: anyone, create: isAdmin, update: canWriteContent, delete: isAdmin },
  hooks: { afterChange: [auditAfterChange] },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'brief | newsletter | roadmap | chat' },
    },
    {
      name: 'fields',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'label', type: 'text', required: true },
        {
          name: 'type',
          type: 'select',
          required: true,
          options: ['text', 'email', 'textarea', 'select', 'checkbox', 'url'],
        },
        { name: 'required', type: 'checkbox', defaultValue: false },
        { name: 'maxLength', type: 'number' },
        { name: 'placeholder', type: 'text' },
        {
          name: 'options',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'value', type: 'text', required: true },
          ],
        },
        { name: 'defaultValue', type: 'text' },
      ],
    },
    { name: 'submitLabel', type: 'text', defaultValue: 'Send' },
    { name: 'successMessage', type: 'textarea' },
    {
      name: 'roadmapOptIn',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        {
          name: 'defaultChecked',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'A15: opt-in, unchecked by default.' },
        },
        { name: 'label', type: 'text' },
      ],
    },
    {
      name: 'turnstile',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Enabled at launch (owner decision 2026-09-04). Verified server-side.' },
    },
  ],
}

const SUBMISSION_STATUS = ['received', 'spam', 'duplicate', 'processed', 'failed'] as const

/** Submissions — every public POST, stored before any email is attempted. PII: CRM roles only. */
export const Submissions: CollectionConfig = {
  slug: 'submissions',
  admin: {
    useAsTitle: 'email',
    group: 'Intake',
    defaultColumns: ['createdAt', 'form', 'email', 'status', 'spamScore'],
  },
  access: { read: crmRead, create: nobody, update: crmWrite, delete: isAdmin },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'form', type: 'relationship', relationTo: 'forms', required: true },
    { name: 'mode', type: 'select', required: true, options: ['brief', 'newsletter', 'roadmap'] },
    {
      name: 'source',
      type: 'select',
      required: true,
      options: ['form', 'chat', 'newsletter', 'scorecard', 'import'],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'received',
      options: [...SUBMISSION_STATUS],
    },
    { name: 'email', type: 'email', required: true, index: true },
    { name: 'name', type: 'text' },
    { name: 'company', type: 'text' },
    { name: 'site', type: 'text' },
    {
      name: 'fields',
      type: 'json',
      admin: { description: 'Remaining submitted fields (revenue, budget, timeline, focus, brief…).' },
    },
    {
      name: 'context',
      type: 'group',
      fields: [
        { name: 'page', type: 'text' },
        { name: 'journey', type: 'text' },
        { name: 'dwellSeconds', type: 'number' },
        { name: 'score', type: 'text' },
        { name: 'referrer', type: 'text' },
        { name: 'utm', type: 'json' },
        { name: 'screen', type: 'text' },
        { name: 'language', type: 'text' },
        { name: 'timezone', type: 'text' },
        { name: 'userAgent', type: 'text' },
        {
          name: 'ipHash',
          type: 'text',
          admin: { description: 'Salted hash of the IP; the raw IP is never stored.' },
        },
      ],
    },
    { name: 'spamScore', type: 'number' },
    { name: 'spamReasons', type: 'json' },
    {
      name: 'fingerprint',
      type: 'text',
      index: true,
      admin: { description: 'sha256(email|brief[0:400]) for the 900 s dedupe window.' },
    },
    { name: 'contact', type: 'relationship', relationTo: 'contacts' },
    { name: 'lead', type: 'relationship', relationTo: 'leads' },
    { name: 'error', type: 'text' },
  ],
}

/** Subscribers — from the legacy Subscribers.ts, extended (scorecard source, consent method). */
export const Subscribers: CollectionConfig = {
  slug: 'subscribers',
  admin: {
    useAsTitle: 'email',
    group: 'Audience',
    defaultColumns: ['email', 'name', 'status', 'signupAt', 'source'],
  },
  access: { read: crmRead, create: crmWrite, update: crmWrite, delete: isAdmin },
  hooks: {
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
    beforeChange: [
      ({ data }) => {
        if (!data) return data
        const now = new Date().toISOString()
        if (data.status === 'confirmed' && !data.confirmedAt) data.confirmedAt = now
        if (data.status === 'unsubscribed' && !data.unsubscribedAt) data.unsubscribedAt = now
        return data
      },
    ],
  },
  fields: [
    {
      name: 'externalId',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Legacy import key.' },
    },
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    { name: 'dedupeKey', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'name', type: 'text' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: ['pending', 'confirmed', 'unsubscribed', 'bounced', 'complained'],
      index: true,
    },
    { name: 'signupAt', type: 'date', required: true },
    { name: 'confirmedAt', type: 'date' },
    { name: 'unsubscribedAt', type: 'date' },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'newsletter',
      options: ['newsletter', 'chat', 'form', 'roadmap', 'scorecard', 'import'],
    },
    { name: 'sourcePage', type: 'text' },
    { name: 'tags', type: 'array', fields: [{ name: 'tag', type: 'text', required: true }] },
    {
      name: 'consent',
      type: 'group',
      fields: [
        {
          name: 'method',
          type: 'select',
          options: ['double-opt-in', 'single-opt-in', 'unsubscribed', 'imported'],
        },
        { name: 'requestedAt', type: 'date' },
        { name: 'confirmedAt', type: 'date' },
        { name: 'ipHash', type: 'text' },
        { name: 'userAgent', type: 'text' },
        {
          name: 'evidence',
          type: 'text',
          admin: { description: 'Where the consent record came from (form key, import file).' },
        },
      ],
    },
    {
      name: 'history',
      type: 'array',
      admin: { readOnly: true },
      fields: [
        { name: 'status', type: 'text', required: true },
        { name: 'at', type: 'date', required: true },
      ],
    },
    { name: 'meta', type: 'json' },
    { name: 'schemaVersion', type: 'number', defaultValue: 2, admin: { position: 'sidebar' } },
  ],
}

/** CRM foundation — Contacts, Companies, Leads, Activities, Tasks. Full CRM services arrive in C6. */
export const Companies: CollectionConfig = {
  slug: 'companies',
  admin: { useAsTitle: 'name', group: 'CRM' },
  access: { read: crmRead, create: crmWrite, update: crmWrite, delete: isAdmin },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'domain', type: 'text', index: true },
    { name: 'industry', type: 'relationship', relationTo: 'industries' },
    { name: 'location', type: 'relationship', relationTo: 'locations' },
    { name: 'notes', type: 'textarea' },
  ],
}

export const Contacts: CollectionConfig = {
  slug: 'contacts',
  admin: { useAsTitle: 'email', group: 'CRM', defaultColumns: ['email', 'name', 'company', 'updatedAt'] },
  access: { read: crmRead, create: crmWrite, update: crmWrite, delete: isAdmin },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    {
      name: 'emailNormalized',
      type: 'text',
      index: true,
      admin: { readOnly: true, description: 'Lower-cased, +tag stripped, gmail dots folded — match key.' },
    },
    { name: 'name', type: 'text' },
    { name: 'phone', type: 'text' },
    { name: 'company', type: 'relationship', relationTo: 'companies' },
    {
      name: 'provenance',
      type: 'select',
      required: true,
      defaultValue: 'form',
      options: ['form', 'chat', 'newsletter', 'roadmap', 'import', 'manual'],
    },
    {
      name: 'preferences',
      type: 'group',
      fields: [
        { name: 'marketing', type: 'checkbox', defaultValue: false },
        { name: 'transactional', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      name: 'suppressed',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Bounce/complaint/unsubscribe → never email.' },
    },
    { name: 'notes', type: 'textarea' },
  ],
}

export const Leads: CollectionConfig = {
  slug: 'leads',
  admin: {
    useAsTitle: 'title',
    group: 'CRM',
    defaultColumns: ['title', 'stage', 'score', 'source', 'updatedAt'],
  },
  access: { read: crmRead, create: crmWrite, update: crmWrite, delete: isAdmin },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'contact', type: 'relationship', relationTo: 'contacts', required: true },
    { name: 'company', type: 'relationship', relationTo: 'companies' },
    {
      name: 'stage',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: ['new', 'qualified', 'proposal', 'won', 'lost', 'nurture'],
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      options: ['form', 'chat', 'roadmap', 'newsletter', 'referral', 'manual'],
    },
    {
      name: 'attribution',
      type: 'group',
      fields: [
        { name: 'landingPage', type: 'text' },
        { name: 'referrer', type: 'text' },
        { name: 'utm', type: 'json' },
        { name: 'campaign', type: 'text' },
      ],
    },
    { name: 'submittedFields', type: 'json' },
    {
      name: 'score',
      type: 'number',
      min: 0,
      max: 100,
      admin: {
        readOnly: true,
        description: 'Deterministic. Components stored in scoreBreakdown; AI may never write this.',
      },
    },
    { name: 'scoreBreakdown', type: 'json', admin: { readOnly: true } },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
    { name: 'nextFollowUpAt', type: 'date' },
    {
      name: 'sync',
      type: 'group',
      admin: {
        description: 'Third-party CRM sync state (docs/crm-sync.md). Written by the crmSync job only.',
      },
      fields: [
        {
          name: 'status',
          type: 'select',
          defaultValue: 'pending',
          options: ['pending', 'synced', 'failed', 'skipped'],
        },
        { name: 'provider', type: 'text', admin: { readOnly: true } },
        { name: 'externalId', type: 'text', admin: { readOnly: true }, index: true },
        { name: 'lastAttemptAt', type: 'date', admin: { readOnly: true } },
        { name: 'attempts', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'error', type: 'text', admin: { readOnly: true } },
      ],
    },
    {
      name: 'aiInsight',
      type: 'group',
      admin: { description: 'Generated. Labelled, reviewable, never authoritative.' },
      fields: [
        { name: 'summary', type: 'textarea' },
        { name: 'nextAction', type: 'text' },
        { name: 'provider', type: 'text' },
        { name: 'model', type: 'text' },
        { name: 'promptVersion', type: 'text' },
        { name: 'generatedAt', type: 'date' },
        { name: 'confidence', type: 'number' },
        { name: 'reviewedBy', type: 'relationship', relationTo: 'users' },
        { name: 'reviewAction', type: 'select', options: ['accepted', 'edited', 'rejected'] },
      ],
    },
  ],
}

export const Activities: CollectionConfig = {
  slug: 'activities',
  admin: { useAsTitle: 'type', group: 'CRM', defaultColumns: ['createdAt', 'type', 'lead', 'contact'] },
  access: { read: crmRead, create: crmWrite, update: nobody, delete: nobody }, // immutable timeline
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        'submission',
        'email-sent',
        'email-received',
        'note',
        'stage-change',
        'task',
        'score-change',
        'ai-insight',
        'import',
        'crm-sync',
        'notification',
      ],
    },
    { name: 'contact', type: 'relationship', relationTo: 'contacts', index: true },
    { name: 'lead', type: 'relationship', relationTo: 'leads', index: true },
    { name: 'submission', type: 'relationship', relationTo: 'submissions' },
    { name: 'summary', type: 'text', required: true },
    { name: 'data', type: 'json' },
    { name: 'actor', type: 'relationship', relationTo: 'users' },
  ],
}

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: { useAsTitle: 'title', group: 'CRM' },
  access: { read: crmRead, create: crmWrite, update: crmWrite, delete: crmWrite },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'lead', type: 'relationship', relationTo: 'leads' },
    { name: 'assignee', type: 'relationship', relationTo: 'users' },
    { name: 'dueAt', type: 'date' },
    { name: 'status', type: 'select', defaultValue: 'open', options: ['open', 'done', 'cancelled'] },
  ],
}

/** Lead-score rules — deterministic, editable by admins, every change audited. */
export const LeadScoreRules: CollectionConfig = {
  slug: 'lead-score-rules',
  admin: { useAsTitle: 'name', group: 'CRM' },
  access: { read: crmRead, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { afterChange: [auditAfterChange] },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'factor',
      type: 'select',
      required: true,
      options: ['service-fit', 'geography', 'budget', 'timeline', 'engagement', 'recency', 'negative'],
    },
    { name: 'field', type: 'text', required: true },
    { name: 'match', type: 'text', required: true, admin: { description: 'Exact value or regex (/…/).' } },
    { name: 'points', type: 'number', required: true },
    { name: 'active', type: 'checkbox', defaultValue: true },
    verificationFields(),
  ],
}

/** Outbox — durable record of every outbound message (mock provider writes here; real providers too). */
export const Outbox: CollectionConfig = {
  slug: 'outbox',
  admin: {
    useAsTitle: 'subject',
    group: 'Intake',
    defaultColumns: ['createdAt', 'to', 'subject', 'status', 'provider'],
  },
  access: {
    read: roles('platform-admin', 'client-admin', 'sales'),
    create: nobody,
    update: nobody,
    delete: isAdmin,
  },
  fields: [
    { name: 'to', type: 'email', required: true },
    { name: 'subject', type: 'text', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: ['notify-owner', 'confirmation', 'welcome', 'roadmap', 'roadmap-copy', 'test'],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: ['queued', 'sent', 'failed', 'suppressed'],
    },
    { name: 'provider', type: 'text' },
    { name: 'providerMessageId', type: 'text' },
    { name: 'idempotencyKey', type: 'text', unique: true, index: true },
    { name: 'headers', type: 'json' },
    { name: 'error', type: 'text' },
    { name: 'sentAt', type: 'date' },
    { name: 'lead', type: 'relationship', relationTo: 'leads' },
  ],
}

/** Rate-limit events — hashed keys only (ip hash, dedupe hash, 'sends'); no PII. Admin read for diagnostics; written by the intake code with overrideAccess. */
export const RateEvents: CollectionConfig = {
  slug: 'rate-events',
  admin: { group: 'Operations', defaultColumns: ['scope', 'key', 'at'], hidden: true },
  access: { read: isAdmin, create: nobody, update: nobody, delete: isAdmin },
  timestamps: false,
  fields: [
    {
      name: 'scope',
      type: 'select',
      required: true,
      options: ['request', 'send', 'global', 'dedupe'],
      index: true,
    },
    { name: 'key', type: 'text', required: true, index: true },
    { name: 'at', type: 'date', required: true, index: true },
  ],
}
