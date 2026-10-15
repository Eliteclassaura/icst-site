#!/usr/bin/env node
/**
 * Text wordmark fallback for a client with no logo yet: SVGs written to apps/h2o/public/brand/ from the manifest's short name and the
 * theme tokens (accent and text colours). It is a stop-gap, not a logo: replace the files (and the manifest paths) when the real mark exists.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin/wordmark.ts <slug>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest } from '../src/load.ts'
import { loadTokens } from '../src/theme.ts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const slug = process.argv[2]
if (!slug) {
  process.stderr.write('usage: wordmark <slug>\n')
  process.exit(2)
}
const dir = path.join(repo, 'clients', slug)
const m = loadManifest(dir)
const t = loadTokens(dir)
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string)
const name = esc(m.client.shortName)
const font = "Teko, 'Arial Narrow', Arial, sans-serif"
const wordmark = (ink: string, sub: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 256" role="img" aria-label="${esc(m.brand.names.site)}"><title>${esc(m.brand.names.site)}</title><text x="0" y="170" font-family="${font}" font-size="190" font-weight="600" letter-spacing="4" fill="${ink}">${name}</text><text x="4" y="236" font-family="Arial, sans-serif" font-size="30" letter-spacing="3" fill="${sub}">${esc(m.brand.names.site.toUpperCase())}</text></svg>\n`
const emblem = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" role="img" aria-label="${esc(m.brand.names.site)}"><rect width="180" height="180" rx="28" fill="${t.light.accent}"/><text x="90" y="118" text-anchor="middle" font-family="${font}" font-size="${m.client.shortName.length > 3 ? 64 : 80}" font-weight="600" fill="${t.light.accentOn}">${name}</text></svg>\n`
const out = path.join(repo, 'apps/h2o/public/brand')
mkdirSync(out, { recursive: true })
writeFileSync(path.join(out, `${slug}-light.svg`), wordmark(t.light.accentDeep ?? t.light.accent ?? '#000', t.light.textMuted ?? '#555'))
writeFileSync(path.join(out, `${slug}-dark.svg`), wordmark('#ffffff', '#d0d0d0'))
writeFileSync(path.join(out, `${slug}-emblem.svg`), emblem)
writeFileSync(path.join(out, `${slug}-favicon.svg`), emblem)
writeFileSync(path.join(repo, 'apps/h2o/src/app/icon.svg'), emblem)
process.stdout.write(`wrote wordmark and emblem for ${slug} (stop-gap, not a logo)\n`)
