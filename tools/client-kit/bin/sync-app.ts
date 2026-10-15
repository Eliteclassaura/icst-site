#!/usr/bin/env node
/**
 * KIT-0 H0: the app cannot import `.ts`-suffixed paths from tools/, so the manifest validator lives in the app as a generated copy
 * (`apps/h2o/src/client/{check,manifest}.ts`): the same source with `./x.ts` imports made extensionless. A test fails if they drift.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin/sync-app.ts [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appCopy, SYNCED } from '../src/sync-app.ts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
let stale = 0
for (const f of SYNCED) {
  const src = readFileSync(path.join(repo, 'tools/client-kit/src', f), 'utf8')
  const dest = path.join(repo, 'apps/h2o/src/client', f)
  const want = appCopy(src, f)
  let have = ''
  try {
    have = readFileSync(dest, 'utf8')
  } catch {
    /* missing */
  }
  if (process.argv.includes('--check')) {
    if (have !== want) {
      process.stderr.write(`${path.relative(repo, dest)} is out of date; run sync-app\n`)
      stale++
    }
  } else writeFileSync(dest, want)
}
if (stale) process.exit(1)
