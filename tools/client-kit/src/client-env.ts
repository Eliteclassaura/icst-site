import path from 'node:path'
import { loadManifest } from './load.ts'

/**
 * Build/seed tooling: the environment that makes the app resolve `CLIENT=<slug>`. The manifest travels as JSON in
 * `CLIENT_MANIFEST_JSON` (validated again by the app). Use from next.config, the seed CLI and tests.
 */
export function clientEnv(clientsRoot: string, slug: string): { CLIENT: string; CLIENT_MANIFEST_JSON?: string } {
  if (slug === 'h2o') return { CLIENT: 'h2o' }
  return { CLIENT: slug, CLIENT_MANIFEST_JSON: JSON.stringify(loadManifest(path.join(clientsRoot, slug))) }
}
