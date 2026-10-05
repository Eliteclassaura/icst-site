import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import type { CollectionConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import {
  lexicalEditor,
  FixedToolbarFeature,
  HeadingFeature,
  LinkFeature,
  BlockquoteFeature,
  UnorderedListFeature,
  OrderedListFeature,
  BoldFeature,
  ItalicFeature,
  UnderlineFeature,
  ParagraphFeature,
  HorizontalRuleFeature,
} from '@payloadcms/richtext-lexical'
import sharp from 'sharp'
import { securityDefaults } from '@factory/agency-core/cms/kernel'
import { foundationCollections } from '@factory/agency-core/cms/foundation'
import { Manufacturers } from './collections/manufacturers'
import { catalogCollections } from './collections/index'
import { crmCollections, crmEndpoints } from './crm/index'
import { withPasswordEmail } from './auth/password-email'
import { h2oEmailAdapter } from './email/adapter'
import { crmAdminComponents } from './crm/admin/config'
import { PublicRoutes } from './content/collections/public-routes'
import { PublicRedirects } from './content/collections/public-redirects'
import { jobsConfig, PublicationState } from './content/jobs'
import { SiteChromeGlobal } from './content/site-chrome'

const dirname = path.dirname(fileURLToPath(import.meta.url))
// No default origin: a deployable manifest must state its public origin (see RUNTIME_VARIABLES.md).
const serverURL = requireEnv('NEXT_PUBLIC_SERVER_URL')

/**
 * Required configuration fails closed.
 *
 * An empty-string fallback for a secret or a connection string does not prevent a misconfigured start —
 * it defers the failure to somewhere less obvious, with an unauthenticated or unconnected process already
 * running. Missing configuration should stop the process at the point the configuration is read.
 *
 * The error names the variable and where to set it. It never includes the value, so it is safe in a log,
 * a CI transcript or a screenshot.
 */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(
      `[h2o] Required environment variable ${name} is missing or blank. ` +
        `Set it in apps/h2o/.env (see .env.example). The value itself is never logged.`,
    )
  }
  return value
}

const payloadSecret = requireEnv('PAYLOAD_SECRET')
const databaseURI = requireEnv('DATABASE_URI')

/**
 * H2O Payload configuration — Phase 2 increment 2A.1B.
 *
 * R1 registered all 41 shared collections. That was a diagnostic architecture, not a boundary: it made the
 * build green by giving the generated `CollectionSlug` union every slug the shared package mentions, and it
 * left H2O carrying two dozen tables for entities it has no product use for.
 *
 * 2A.1B registers the **foundation layer** instead — the closed shared set, the seven collections whose
 * references all resolve inside themselves:
 *
 *   users · media · audit-log · citations · people · locations · pages
 *
 * `pages` is here because the frozen blueprint relates `products.related_services` to it. `media` and
 * `citations` arrive through `seoFields()`, `users` through `verificationFields()`, `people` through
 * `publishFields()`, and `locations` through `people`. Nothing here is registered to satisfy a type: each
 * one is reachable from something H2O genuinely uses.
 *
 * `industries` is deliberately absent. It belongs to the reusable foundation layer only so the CRM layer
 * need not reach into editorial; H2O registers no agency-core CRM, so it does not need it. H2O's own
 * CRM-1 collections (`src/crm/`, all `crm-`-prefixed) relate only to `users`, `products` and each other.
 *
 * Two settings remain security-relevant from the first commit, because retrofitting either is how a
 * staging system quietly becomes unsafe:
 *
 *   push: false      schema changes arrive as reviewed migrations, never by silent introspection
 *   idType: 'uuid'   record identifiers are unpredictable, which narrows one class of guessing attack
 *
 * UUIDs are **not** authorization. An unguessable id does nothing about a list endpoint, a search endpoint
 * or a permissive read rule — those are access control's job, and proving them is 2A.3's job.
 *
 * `securityDefaults` supplies CORS, CSRF, rate limiting, telemetry-off and GraphQL-disabled-unless-asked,
 * identically to the other Factory app rather than in a second H2O-specific dialect.
 *
 * Globals are not registered. Nothing in the foundation layer reads or types a global.
 */

// Restricted rich text: no raw HTML, no arbitrary embeds — the accepted Factory posture, which matters
// because the foundation collections bring richText fields with them.
//
// `enabledCollections` is typed `CollectionSlug[]`, so it lists only what H2O actually registers. syed-ai
// additionally enables posts, glossary-terms, services and case-studies; none of those exist here.
const editor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    LinkFeature({ enabledCollections: ['pages'] }),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    FixedToolbarFeature(),
  ],
})

// Local disk uploads: an ABSOLUTE directory, because the standalone server's cwd is not the app dir.
// `media` is the only upload collection in the foundation layer — `private-files` belongs to CRM, which
// H2O does not register.
const mediaDir = process.env.MEDIA_DIR || path.resolve(dirname, '../media')

const collections: CollectionConfig[] = [
  ...foundationCollections.map((c) => {
    // R1B (Control Tower C5): `public-routes` is the single public page authority on H2O. The foundation
    // `pages` collection (empty here) stays registered for schema compatibility but is hidden and not writable.
    // CRM email M1 (Control Tower 2026-10-04): password reset by email through the gated H2O adapter. Refused
    // while H2O_EMAIL_MODE=off, as at launch. See `src/auth/password-email.ts`.
    if (c.slug === 'users') return withPasswordEmail(c)
    if (c.slug === 'pages') return { ...c, admin: { ...c.admin, hidden: true }, access: { ...c.access, create: () => false, update: () => false } }
    if (c.slug !== 'media') return c
    if (!c.upload || typeof c.upload !== 'object') return c
    return { ...c, upload: { ...c.upload, staticDir: mediaDir } }
  }),
  // Grouped with Products / Product categories so editors find the catalog by name (CRM go-live Pass 0).
  { ...Manufacturers, admin: { ...Manufacturers.admin, group: 'Products' } },
  ...catalogCollections(mediaDir),
  // CRM-1 (H2O-local, private). Registered after the catalog because RFQ items relate to `products`.
  ...crmCollections,
  // Runtime content bridge: the public website's pages and redirects, Payload-managed (drafts/versions).
  PublicRoutes,
  PublicRedirects,
]

export default buildConfig({
  serverURL,
  ...securityDefaults({
    serverURL,
    extraOrigins: (process.env.EXTRA_ORIGINS || '').split(',').filter(Boolean),
  }),
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · H2O staging admin' },
    // CRM-1: one private overview view and a nav link. Both check CRM roles server-side.
    components: crmAdminComponents,
  },
  collections,
  // CRM go-live: the Typeform intake webhook (404 unless ingest is enabled; signature-verified).
  endpoints: crmEndpoints,
  globals: [PublicationState, SiteChromeGlobal],
  // One publishing/indexing queue and runner (see src/content/jobs.ts). Email has its own outbox, drained by
  // the same runner role (src/email/outbox-worker.ts), not a Payload job queue.
  jobs: jobsConfig,
  // Always set: without an adapter Payload would log whole messages (reset links included). The adapter gates
  // every send by H2O_EMAIL_MODE and never logs a recipient, subject, body or token (src/email/adapter.ts).
  email: h2oEmailAdapter,
  // The frozen contract marks the product and family narrative and SEO groups `localized`. Declaring a
  // single locale now creates the localized column shape; adding a second locale later is then a
  // configuration change rather than a schema rebuild. The catalog is monolingual today — zero products
  // sit in any translation group — so `en` is the whole of it, and `locale_state` records the rest.
  localization: { locales: ['en'], defaultLocale: 'en', fallback: true },
  editor,
  secret: payloadSecret,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: databaseURI },
    migrationDir: path.resolve(dirname, 'migrations'),
    push: false,
    idType: 'uuid',
  }),
  sharp,
})
