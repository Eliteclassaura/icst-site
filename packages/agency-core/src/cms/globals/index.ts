import type { GlobalConfig } from 'payload'
import { anyone, canWriteContent, isAdmin, roles } from '../access/index'
import { verificationFields } from '../fields/index'
import { auditGlobalAfterChange } from '../hooks/audit'

const publicGlobal = (
  slug: string,
  label: string,
  fields: GlobalConfig['fields'],
  group = 'Site',
): GlobalConfig => ({
  slug,
  label,
  admin: { group },
  access: { read: anyone, update: canWriteContent },
  hooks: { afterChange: [auditGlobalAfterChange] },
  fields,
})

const adminGlobal = (
  slug: string,
  label: string,
  fields: GlobalConfig['fields'],
  group = 'Configuration',
): GlobalConfig => ({
  slug,
  label,
  admin: { group },
  access: {
    read: roles('platform-admin', 'client-admin', 'editor', 'search-analyst', 'sales'),
    update: isAdmin,
  },
  hooks: { afterChange: [auditGlobalAfterChange] },
  fields,
})

const link = (name: string) => ({
  name,
  type: 'array' as const,
  fields: [
    { name: 'label', type: 'text' as const, required: true },
    { name: 'href', type: 'text' as const, required: true },
    { name: 'rel', type: 'text' as const },
    { name: 'external', type: 'checkbox' as const, defaultValue: false },
  ],
})

export const SiteSettings = publicGlobal('site-settings', 'Site settings', [
  { name: 'siteName', type: 'text', required: true },
  {
    name: 'siteUrl',
    type: 'text',
    required: true,
    admin: { description: 'Canonical origin, no trailing slash, e.g. https://syed.ai' },
  },
  { name: 'tagline', type: 'text' },
  { name: 'defaultLocale', type: 'text', defaultValue: 'en' },
  { name: 'timezone', type: 'text', defaultValue: 'UTC' },
  {
    name: 'trailingSlash',
    type: 'checkbox',
    defaultValue: true,
    admin: { readOnly: true, description: 'Canonical URL form (A14).' },
  },
  {
    name: 'stats',
    type: 'array',
    admin: { description: 'Homepage stats row. Each value is an owner-verified fact.' },
    fields: [
      { name: 'label', type: 'text', required: true },
      { name: 'value', type: 'number', required: true },
      { name: 'prefix', type: 'text' },
      { name: 'suffix', type: 'text' },
      { name: 'decimals', type: 'number', defaultValue: 0 },
      { name: 'comma', type: 'checkbox' },
      verificationFields(),
    ],
  },
  {
    name: 'heroStatus',
    type: 'group',
    fields: [
      { name: 'text', type: 'text' },
      { name: 'live', type: 'checkbox', defaultValue: false },
      verificationFields(),
    ],
  },
  { name: 'build', type: 'text', admin: { readOnly: true, description: 'Set by CI.' } },
])

export const BrandSettings = publicGlobal('brand-settings', 'Brand', [
  { name: 'brandName', type: 'text', required: true },
  {
    name: 'wordmark',
    type: 'group',
    fields: [
      { name: 'text', type: 'text' },
      { name: 'accentSuffix', type: 'text' },
      { name: 'subline', type: 'text' },
    ],
  },
  { name: 'logo', type: 'upload', relationTo: 'media' },
  { name: 'monogram', type: 'upload', relationTo: 'media' },
  { name: 'ogDefault', type: 'upload', relationTo: 'media' },
  {
    name: 'designContractVersion',
    type: 'text',
    admin: { readOnly: true, description: 'From design/design-contract.json at build.' },
  },
  {
    name: 'voice',
    type: 'textarea',
    admin: { description: 'Voice and tone notes for editors and (opt-in) AI assistance.' },
  },
])

export const Header = publicGlobal('header', 'Header / navigation', [
  link('primary'),
  link('utility'),
  {
    name: 'palette',
    type: 'array',
    admin: { description: 'Command palette entries (⌘K).' },
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'href', type: 'text', required: true },
      { name: 'keywords', type: 'text' },
    ],
  },
  { name: 'ctaLabel', type: 'text' },
  { name: 'ctaHref', type: 'text' },
])

export const Footer = publicGlobal('footer', 'Footer', [
  {
    name: 'columns',
    type: 'array',
    fields: [{ name: 'heading', type: 'text', required: true }, link('links')],
  },
  link('legal'),
  { name: 'note', type: 'textarea' },
])

export const ContactLegal = publicGlobal('contact-legal', 'Contact & legal details', [
  { name: 'legalName', type: 'text' },
  {
    name: 'contactEmailPublic',
    type: 'email',
    admin: { description: 'Leave empty to show no email on the site (legacy behaviour).' },
  },
  { name: 'offices', type: 'relationship', relationTo: 'offices', hasMany: true },
  {
    name: 'socialProfiles',
    type: 'array',
    fields: [
      { name: 'network', type: 'text', required: true },
      { name: 'url', type: 'text', required: true },
      { name: 'handle', type: 'text' },
    ],
  },
  { name: 'privacyPage', type: 'relationship', relationTo: 'pages' },
  { name: 'termsPage', type: 'relationship', relationTo: 'pages' },
  { name: 'accessibilityStatementPage', type: 'relationship', relationTo: 'pages' },
  verificationFields(),
])

export const SEODefaults = publicGlobal(
  'seo-defaults',
  'SEO defaults',
  [
    { name: 'titleTemplate', type: 'text', required: true, defaultValue: '{title} | {siteName}' },
    { name: 'defaultDescription', type: 'textarea' },
    { name: 'defaultOgImage', type: 'upload', relationTo: 'media' },
    { name: 'twitterSite', type: 'text' },
    {
      name: 'robotsDirectives',
      type: 'text',
      defaultValue: 'index,follow,max-image-preview:large,max-snippet:-1',
    },
    {
      name: 'robotsTxt',
      type: 'textarea',
      admin: {
        description: 'Additional robots.txt rules (AI agents allowed by default; keep parity with legacy).',
      },
    },
    {
      name: 'llmsTxt',
      type: 'textarea',
      admin: { description: 'Experimental, transparent aid only — never a ranking requirement.' },
    },
    { name: 'organizationEntity', type: 'relationship', relationTo: 'schema-entities' },
    { name: 'websiteEntity', type: 'relationship', relationTo: 'schema-entities' },
    { name: 'personEntity', type: 'relationship', relationTo: 'people' },
    {
      name: 'entities',
      type: 'relationship',
      relationTo: 'schema-entities',
      hasMany: true,
      admin: {
        description:
          'Nodes emitted in the site graph per their emitOn setting (Organization, Person, WebSite, offices, Blog).',
      },
    },
  ],
  'SEO',
)

export const Integrations = adminGlobal('integrations', 'Integrations & feature flags', [
  {
    name: 'turnstile',
    type: 'group',
    fields: [
      { name: 'enabled', type: 'checkbox', defaultValue: true },
      {
        name: 'siteKey',
        type: 'text',
        admin: {
          description: 'Public site key only. The secret lives in the environment (TURNSTILE_SECRET).',
        },
      },
    ],
  },
  {
    name: 'analytics',
    type: 'group',
    fields: [
      {
        name: 'provider',
        type: 'select',
        defaultValue: 'none',
        options: ['none', 'umami', 'plausible', 'posthog'],
      },
      { name: 'publicId', type: 'text' },
      { name: 'host', type: 'text' },
      { name: 'requiresConsent', type: 'checkbox', defaultValue: true },
    ],
  },
  {
    name: 'ai',
    type: 'group',
    fields: [
      {
        name: 'enabled',
        type: 'checkbox',
        defaultValue: false,
        admin: {
          description:
            'Runtime AI is off by default. Provider keys live in the environment; this only toggles features. Both this switch AND `AI_ENABLED=true` in the environment are required — with either off, every AI feature reports "AI disabled" and the platform works unchanged (C7).',
        },
      },
      {
        name: 'status',
        type: 'text',
        virtual: true,
        admin: {
          readOnly: true,
          description: 'Live state, derived from the environment and this switch. Not stored.',
        },
        hooks: {
          afterRead: [
            ({ data }) => {
              const env = process.env.AI_ENABLED === 'true'
              const provider = process.env.AI_PROVIDER ?? 'mock'
              const client = Boolean((data as { ai?: { enabled?: boolean } } | undefined)?.ai?.enabled)
              if (!env && !client) return 'AI disabled — off in the environment (AI_ENABLED) and here'
              if (!env) return 'AI disabled — AI_ENABLED is not set in the environment'
              if (!client) return 'AI disabled — enable it here to switch features on'
              return `AI enabled — provider "${provider}"`
            },
          ],
        },
      },
      {
        name: 'features',
        type: 'select',
        hasMany: true,
        options: [
          'lead-summary',
          'follow-up-draft',
          'lead-classification',
          'content-brief',
          'schema-suggestions',
          'report-narrative',
        ],
      },
      {
        name: 'dataPolicyNote',
        type: 'textarea',
        admin: {
          description:
            'What data leaves the deployment when enabled — shown to admins. Each prompt declares the only fields it may receive (`packages/providers/src/ai/prompts.ts`); anything else is dropped before the provider is called, and a field that still looks like PII refuses the call outright.',
        },
      },
    ],
  },
  {
    name: 'email',
    type: 'group',
    fields: [
      {
        name: 'provider',
        type: 'select',
        defaultValue: 'mock',
        options: ['mock', 'smtp', 'gmail-api', 'stalwart'],
      },
      { name: 'fromName', type: 'text' },
      { name: 'fromEmail', type: 'email' },
      { name: 'notifyEmail', type: 'email' },
      { name: 'replyTo', type: 'email' },
    ],
  },
  {
    name: 'searchIntelligence',
    type: 'group',
    fields: [{ name: 'enabled', type: 'checkbox', defaultValue: false }],
  },
  {
    name: 'crm',
    type: 'group',
    fields: [
      { name: 'enabled', type: 'checkbox', defaultValue: true },
      {
        name: 'provider',
        type: 'select',
        defaultValue: 'mock',
        options: ['none', 'mock', 'hubspot', 'pipedrive'],
        admin: {
          description:
            'Third-party sync (docs/crm-sync.md). HubSpot/Pipedrive arrive in Release 7; credentials are env-only.',
        },
      },
    ],
  },
])

export const ChatConfig = publicGlobal(
  'chat-config',
  'Chat intake',
  [
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    {
      name: 'greetings',
      type: 'array',
      fields: [
        {
          name: 'context',
          type: 'text',
          required: true,
          admin: { description: 'default | services | scorecard | roi | work | building | newsletter' },
        },
        { name: 'text', type: 'textarea', required: true },
      ],
    },
    {
      name: 'briefSteps',
      type: 'array',
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'prompt', type: 'textarea', required: true },
        { name: 'type', type: 'select', required: true, options: ['text', 'email', 'textarea', 'chips'] },
        { name: 'required', type: 'checkbox' },
        { name: 'skipLabel', type: 'text' },
        {
          name: 'chips',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'value', type: 'text' },
          ],
        },
      ],
    },
    {
      name: 'roadmapSteps',
      type: 'array',
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'prompt', type: 'textarea', required: true },
        { name: 'type', type: 'select', required: true, options: ['text', 'email', 'textarea', 'chips'] },
        { name: 'required', type: 'checkbox' },
        {
          name: 'chips',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'value', type: 'text' },
          ],
        },
      ],
    },
    {
      name: 'copy',
      type: 'group',
      fields: [
        { name: 'success', type: 'textarea' },
        { name: 'roadmapSuccess', type: 'textarea' },
        { name: 'failure', type: 'textarea' },
        { name: 'fallbackUrl', type: 'text' },
        { name: 'legal', type: 'text' },
      ],
    },
  ],
  'Intake',
)

export const RoadmapConfig = adminGlobal(
  'roadmap-config',
  'Roadmap scanner',
  [
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'dailyCapPerEmail', type: 'number', defaultValue: 2 },
    { name: 'dailyCapGlobal', type: 'number', defaultValue: 100 },
    {
      name: 'aiAgents',
      type: 'array',
      admin: { description: 'Crawler UAs checked in robots.txt.' },
      fields: [
        { name: 'agent', type: 'text', required: true },
        { name: 'kind', type: 'select', options: ['retrieval', 'training'] },
      ],
    },
    {
      name: 'scoreWeights',
      type: 'json',
      admin: { description: 'Six factors, sum 100 (legacy: 25/20/20/15/12/8).' },
    },
    {
      name: 'findings',
      type: 'array',
      fields: [
        { name: 'code', type: 'text', required: true },
        { name: 'severity', type: 'select', required: true, options: ['critical', 'major', 'minor', 'ok'] },
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'textarea' },
      ],
    },
    {
      name: 'planPhases',
      type: 'array',
      fields: [
        { name: 'weeks', type: 'text', required: true },
        { name: 'heading', type: 'text', required: true },
        { name: 'body', type: 'textarea' },
        { name: 'focus', type: 'text' },
      ],
    },
  ],
  'Intake',
)

export const EmailTemplates = adminGlobal(
  'email-templates',
  'Email templates',
  [
    ...['notifyOwner', 'confirmation', 'welcome', 'roadmap', 'roadmapCopy'].map((k) => ({
      name: k,
      type: 'group' as const,
      fields: [
        { name: 'subject', type: 'text' as const, required: true },
        { name: 'preheader', type: 'text' as const },
        { name: 'body', type: 'richText' as const },
        { name: 'textFallback', type: 'textarea' as const },
      ],
    })),
    { name: 'signature', type: 'textarea' },
    {
      name: 'listUnsubscribe',
      type: 'checkbox',
      defaultValue: true,
      admin: { readOnly: true, description: 'RFC 8058 headers always on for newsletter mail.' },
    },
  ],
  'Intake',
)

export const SpamConfig = adminGlobal(
  'spam-config',
  'Spam & validation lists',
  [
    { name: 'phrases', type: 'array', fields: [{ name: 'phrase', type: 'text', required: true }] },
    { name: 'throwawayDomains', type: 'array', fields: [{ name: 'domain', type: 'text', required: true }] },
    { name: 'disposableDomains', type: 'array', fields: [{ name: 'domain', type: 'text', required: true }] },
    { name: 'knownGoodDomains', type: 'array', fields: [{ name: 'domain', type: 'text', required: true }] },
    { name: 'roleLocalParts', type: 'array', fields: [{ name: 'local', type: 'text', required: true }] },
    {
      name: 'thresholds',
      type: 'group',
      fields: [
        { name: 'silentDropScore', type: 'number', defaultValue: 5 },
        { name: 'dwellMinSeconds', type: 'number', defaultValue: 3 },
        { name: 'dwellMaxSeconds', type: 'number', defaultValue: 7200 },
        { name: 'ratePerHour', type: 'number', defaultValue: 20 },
        { name: 'sendsPerHour', type: 'number', defaultValue: 5 },
        { name: 'globalPerDay', type: 'number', defaultValue: 200 },
        { name: 'dedupeWindowSeconds', type: 'number', defaultValue: 900 },
      ],
    },
  ],
  'Intake',
)

export const FormConfig = publicGlobal(
  'form-config',
  'Form copy & options',
  [
    {
      name: 'selects',
      type: 'array',
      admin: { description: 'Shared option lists so chat and form agree (normalises legacy drift).' },
      fields: [
        {
          name: 'key',
          type: 'text',
          required: true,
          admin: { description: 'Field name: revenue, budget, timeline, focus' },
        },
        {
          name: 'label',
          type: 'text',
          required: true,
          admin: { description: 'Visible label, e.g. Monthly revenue' },
        },
        {
          name: 'options',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'value', type: 'text', required: true },
            { name: 'default', type: 'checkbox' },
          ],
        },
      ],
    },
    {
      name: 'messages',
      type: 'group',
      fields: [
        { name: 'sending', type: 'text' },
        { name: 'sent', type: 'text' },
        { name: 'duplicate', type: 'text' },
        { name: 'typoPrompt', type: 'text' },
        { name: 'fallback', type: 'textarea' },
        { name: 'newsletterPending', type: 'text' },
      ],
    },
  ],
  'Intake',
)

export const allGlobals: GlobalConfig[] = [
  SiteSettings,
  BrandSettings,
  Header,
  Footer,
  ContactLegal,
  SEODefaults,
  Integrations,
  ChatConfig,
  RoadmapConfig,
  EmailTemplates,
  SpamConfig,
  FormConfig,
]
