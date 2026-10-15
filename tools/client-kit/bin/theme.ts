#!/usr/bin/env node
/** node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin/theme.ts <slug> [--check]   (KIT-0 M6) */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTokens, renderTokensCss, TokensError } from '../src/theme.ts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const [slug, flag] = process.argv.slice(2)
if (!slug) {
  process.stderr.write('usage: theme <slug> [--check]\n')
  process.exit(2)
}
const dir = path.join(repo, 'clients', slug)
try {
  const css = renderTokensCss(loadTokens(dir))
  const out = path.join(dir, 'theme', 'tokens.css')
  if (flag === '--check') {
    let have = ''
    try {
      have = readFileSync(out, 'utf8')
    } catch {
      /* missing */
    }
    if (have !== css) {
      process.stderr.write(`${path.relative(repo, out)} is out of date; run theme ${slug}\n`)
      process.exit(1)
    }
    process.stdout.write(`ok: clients/${slug}/theme/tokens.css is current\n`)
  } else {
    writeFileSync(out, css)
    process.stdout.write(`wrote clients/${slug}/theme/tokens.css\n`)
  }
} catch (e) {
  if (e instanceof TokensError) {
    process.stderr.write(`${e.message}\n`)
    process.exit(1)
  }
  throw e
}
