#!/usr/bin/env node
/**
 * KIT-0 H6: run a command with the environment that makes the app resolve `CLIENT=<slug>`.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin/with-client.ts icst -- <command> [args...]
 * Sets CLIENT and CLIENT_MANIFEST_JSON (validated manifest of clients/<slug>), and CLIENTS_DIR.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientEnv } from '../src/client-env.ts'
import { ManifestError } from '../src/manifest.ts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const argv = process.argv.slice(2)
const dash = argv.indexOf('--')
const slug = argv[0]
if (!slug || dash < 1 || dash === argv.length - 1) {
  process.stderr.write('usage: with-client <slug> -- <command> [args...]\n')
  process.exit(2)
}
try {
  const env = { ...process.env, ...clientEnv(path.join(repo, 'clients'), slug), CLIENTS_DIR: path.join(repo, 'clients') }
  const r = spawnSync(argv[dash + 1], argv.slice(dash + 2), { stdio: 'inherit', env })
  process.exit(r.status ?? 1)
} catch (e) {
  if (e instanceof ManifestError) {
    process.stderr.write(`${e.message}\n`)
    process.exit(1)
  }
  throw e
}
