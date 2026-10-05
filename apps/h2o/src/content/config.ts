import path from 'node:path'
import { EMPTY_ARCHIVE_PATHS } from './empty-archives'

/**
 * Runtime content-bridge configuration (H2O_PAYLOAD_RUNTIME_CONTENT_BRIDGE_R1).
 *
 * Two content sources exist, and exactly one is active per process:
 *
 *   - `repository` (default): the accepted repository authorities under `content/**`. This is what the
 *     unit/static tests, the static public release (`release/build.mjs`) and a plain `next dev` read. It
 *     keeps every accepted Main Factory test meaningful and the static rollback path buildable.
 *   - `payload`: the unified runtime. Public pages resolve their route and document from Payload's
 *     *published* state (anonymous, access-controlled reads); cross-references read the published
 *     snapshot the publishing runner materialises from Payload (see `./snapshot`). Nothing public reads
 *     the repository `content/salmon/documents` tree in this mode.
 *
 * Every value is read from the environment only. Directories must be absolute, and in `payload` mode a
 * missing directory stops the process rather than silently falling back to the repository.
 */
export type ContentSource = 'repository' | 'payload'

export const contentSource = (env: NodeJS.ProcessEnv = process.env): ContentSource =>
  env.H2O_CONTENT_SOURCE === 'payload' ? 'payload' : 'repository'

export const payloadMode = (env: NodeJS.ProcessEnv = process.env): boolean => contentSource(env) === 'payload'

function requireAbsoluteDir(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]
  if (!value || !value.trim())
    throw new Error(`[h2o] ${name} is required when H2O_CONTENT_SOURCE=payload (an absolute, persistent directory).`)
  if (!path.isAbsolute(value)) throw new Error(`[h2o] ${name} must be an absolute path.`)
  return path.resolve(value)
}

/** Published-content snapshot generations (persistent volume). */
export const snapshotRoot = (env: NodeJS.ProcessEnv = process.env): string => requireAbsoluteDir('CONTENT_SNAPSHOT_DIR', env)

/** Pagefind index generations (persistent volume). */
export const searchIndexRoot = (env: NodeJS.ProcessEnv = process.env): string => requireAbsoluteDir('SEARCH_INDEX_DIR', env)

/**
 * The single schedule coordinator. Exactly one process in a deployment sets `H2O_PUBLISHING_RUNNER=1`;
 * it runs the `publishing` queue. Every other process only enqueues. Email and every other queue stay off.
 */
export const isPublishingRunner = (env: NodeJS.ProcessEnv = process.env): boolean => env.H2O_PUBLISHING_RUNNER === '1'

/**
 * Indexing policy. `private` (the default, and the only value for staging or any non-production surface)
 * renders every public page `noindex, nofollow` and sends `X-Robots-Tag: noindex, nofollow`, whatever the
 * record says. `production` honours each record's approved `indexable` flag. It is exercised only on
 * isolated synthetic fixtures in tests; enabling it anywhere real is a separate owner decision.
 */
export type IndexingPolicy = 'private' | 'production'
export const indexingPolicy = (env: NodeJS.ProcessEnv = process.env): IndexingPolicy =>
  env.H2O_INDEXING_POLICY === 'production' ? 'production' : 'private'

/**
 * Approved `noindex, follow` routes (Control Tower rulings 2026-10-02): the canonical author archive and the public
 * archives that list nothing public (./empty-archives). Under the production policy such a PUBLIC route tells crawlers
 * to follow its links, whatever its ledger `indexable` flag says, and it is never in the sitemap. Every other route,
 * and every route under `private`, is unchanged.
 */
export const NOINDEX_FOLLOW_PATHS: ReadonlySet<string> = new Set(['/author/timbozic/', ...EMPTY_ARCHIVE_PATHS])

/**
 * Retired WordPress system URLs answered 410 Gone (Master SEO Pass R1, OGCS decisions; Control Tower brief 2026-10-04).
 * Matched on the path, so `/wp/wp-admin/edit.php?post_type=product` is covered by `/wp/wp-admin/edit.php`.
 */
export const GONE_PATHS: ReadonlySet<string> = new Set(['/canvas/list/', '/wp/wp-admin/edit.php'])

/** Canonical public origin used in canonical URLs and the sitemap (not the serving host). */
export const PUBLIC_ORIGIN = 'https://h2ocooling.com'
