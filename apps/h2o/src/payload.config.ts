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

const dirname = path.dirname(fileURLToPath(import.meta.url))
const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3200'

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
 * need not reach into editorial; H2O registers no CRM, so it does not need it.
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
    if (c.slug !== 'media') return c
    if (!c.upload || typeof c.upload !== 'object') return c
    return { ...c, upload: { ...c.upload, staticDir: mediaDir } }
  }),
  Manufacturers,
  ...catalogCollections(mediaDir),
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
  },
  collections,
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
