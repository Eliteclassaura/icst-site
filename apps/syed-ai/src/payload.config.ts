import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
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
import { s3Storage } from '@payloadcms/storage-s3'
import sharp from 'sharp'
import {
  allCollections,
  allGlobals,
  securityDefaults,
  makeRevalidateAfterChange,
  makeRevalidateGlobal,
  makeSlugRedirectHook,
} from '@factory/agency-core/cms'
import { sendMockEmail } from './jobs/sendMockEmail'
import { notifyOwner } from './jobs/notifyOwner'
import { crmSync } from './jobs/crmSync'
import { leadSummary } from './jobs/leadSummary'
import { revalidator, pathFor } from './lib/revalidate'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const useS3 = Boolean(process.env.S3_BUCKET)

// Restricted rich text: no raw HTML, no arbitrary embeds (master prompt: "avoid unbounded arbitrary HTML").
const editor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    LinkFeature({ enabledCollections: ['pages', 'posts', 'glossary-terms', 'services', 'case-studies'] }),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    FixedToolbarFeature(),
  ],
})

// Attach app-specific hooks (revalidation, slug redirects) to the shared collections.
const revalidate = makeRevalidateAfterChange(revalidator, pathFor)
const slugRedirect = makeSlugRedirectHook((slug, coll) =>
  coll === 'pages'
    ? slug === 'home'
      ? '/'
      : `/${slug}/`
    : `/${coll === 'posts' ? 'insights' : coll}/${slug}/`,
)
// Local disk uploads (no S3): an ABSOLUTE directory, because the standalone server's cwd is not the app dir.
const mediaDir = process.env.MEDIA_DIR || path.resolve(dirname, '../media')
const collections = allCollections.map((c) => {
  let col = c
  if (
    ['pages', 'posts', 'services', 'case-studies', 'glossary-terms', 'people', 'faqs', 'ventures'].includes(
      c.slug,
    )
  )
    col = {
      ...col,
      hooks: { ...col.hooks, afterChange: [...(col.hooks?.afterChange ?? []), revalidate, slugRedirect] },
    }
  if (
    !useS3 &&
    (c.slug === 'media' || c.slug === 'private-files') &&
    col.upload &&
    typeof col.upload === 'object'
  )
    col = {
      ...col,
      upload: { ...col.upload, staticDir: c.slug === 'media' ? mediaDir : path.join(mediaDir, 'private') },
    }
  return col
})
const globals = allGlobals.map((g) => ({
  ...g,
  hooks: { ...g.hooks, afterChange: [...(g.hooks?.afterChange ?? []), makeRevalidateGlobal(revalidator)] },
}))

export default buildConfig({
  serverURL,
  ...securityDefaults({
    serverURL,
    extraOrigins: (process.env.EXTRA_ORIGINS || '').split(',').filter(Boolean),
  }),
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · syed.ai admin' },
    livePreview: {
      breakpoints: [
        { name: 'phone', label: 'Phone', width: 390, height: 844 },
        { name: 'tablet', label: 'Tablet', width: 768, height: 1024 },
        { name: 'desktop', label: 'Desktop', width: 1440, height: 900 },
      ],
    },
  },
  collections,
  globals,
  editor,
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    migrationDir: path.resolve(dirname, 'migrations'),
    push: false,
    idType: 'uuid',
  }),
  sharp,
  jobs: {
    tasks: [sendMockEmail, notifyOwner, crmSync, leadSummary],
    autoRun: [],
    deleteJobOnComplete: false,
    access: { run: ({ req }) => Boolean(req.user) },
  },
  plugins: [
    ...(useS3
      ? [
          s3Storage({
            collections: { media: true, 'private-files': { prefix: 'private' } },
            bucket: process.env.S3_BUCKET!,
            config: {
              endpoint: process.env.S3_ENDPOINT,
              region: process.env.S3_REGION,
              forcePathStyle: true,
              credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID!,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
              },
            },
          }),
        ]
      : []),
  ],
})
