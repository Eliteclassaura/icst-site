/**
 * Build-time redirect map from the blueprint (ADR-028 §7): the proxy's fallback when the runtime map is
 * unavailable, and the source of `gone` paths (legacy endpoints that answer 404/410 with no body).
 *   pnpm --filter @factory/syed-ai redirects:build
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validate } from '@factory/seo-contracts'

const bpPath = fileURLToPath(new URL('../content/syed-ai.blueprint.json', import.meta.url))
const outPath = fileURLToPath(new URL('../content/redirects.json', import.meta.url))
const bp = JSON.parse(readFileSync(bpPath, 'utf8'))
const v = validate('factory.seo/blueprint', bp)
if (!v.ok) {
  console.error('blueprint invalid:', v.issues)
  process.exit(1)
}
const redirects: Record<string, { to: string | null; status: number }> = {}
for (const r of v.value.redirects) redirects[r.from] = { to: r.to ?? null, status: r.status }
const gone: Record<string, number> = {}
for (const g of v.value.gone) gone[g.path] = g.status
const out = { generatedFrom: 'syed-ai.blueprint.json', redirects, gone }
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')
console.error(`redirects.json: ${Object.keys(redirects).length} redirects, ${Object.keys(gone).length} gone`)
