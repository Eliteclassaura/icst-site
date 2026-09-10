import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import sharp from 'sharp'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Outbox } from './collections/Outbox'
import { sendMockEmail } from './jobs/sendMockEmail'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const useS3 = Boolean(process.env.S3_BUCKET)

export default buildConfig({
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL,
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [Users, Media, Pages, Outbox],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    migrationDir: path.resolve(dirname, 'migrations'),
    push: false, // migrations only — never schema push, even in dev
  }),
  sharp,
  jobs: {
    tasks: [sendMockEmail],
    // The web process never runs jobs; a separate worker does (src/worker.ts).
    autoRun: [],
    access: { run: ({ req }) => Boolean(req.user) },
  },
  plugins: [
    ...(useS3 ? [s3Storage({
      collections: { media: true },
      bucket: process.env.S3_BUCKET!,
      config: {
        endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
      },
    })] : []),
  ],
})
