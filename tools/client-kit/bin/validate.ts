#!/usr/bin/env node
/** node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin/validate.ts <slug>   (KIT-0 M1) */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest, ManifestError } from '../src/manifest.ts'

const out = (m: string) => process.stdout.write(`${m}\n`)
const clients = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../clients')
const slug = process.argv[2]
if (!slug) {
  console.error('usage: validate <slug>')
  process.exit(2)
}
try {
  loadManifest(path.join(clients, slug))
  out(`ok: clients/${slug}/manifest.json`)
} catch (e) {
  if (e instanceof ManifestError) {
    console.error(e.message)
    process.exit(1)
  }
  throw e
}
