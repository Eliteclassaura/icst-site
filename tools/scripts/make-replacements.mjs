#!/usr/bin/env node
/**
 * Builds the `git filter-repo --replace-text` rules for the first-push history rewrite (ADR-027,
 * docs/runbooks/first-push.md). Reads the literals from a PRISTINE legacy archive the owner holds
 * offline — never from this repository, whose copy is already redacted. Prints the rules to stdout;
 * the caller writes them to a temporary file and deletes it afterwards.
 *
 *   node tools/scripts/make-replacements.mjs --from-git c5        # pre-rewrite history still holds the literals
 *   node tools/scripts/make-replacements.mjs <pristine-syed-ai-site-dir> <pristine-search-evidence-suite-dir>
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const sha = (s) => createHash('sha256').update(s).digest('hex')
const LEGACY_KEY_SHA256 = '1baadc53e62c18f5b7d6fe7fef945a7427d015c54297ea2625b8bc0b75672cf5'
const OWNER_DOMAINS = ['syed.ai', 'websitecontentstrategy.com']
const FILE_EXT_TLDS = new Set('php js css html json txt md py xml csv yaml yml ico png jpg svg'.split(' '))
const SUBS = 'legacy-reference/syed-ai-site/subscribers.php'
const PROXY = 'legacy-reference/search-evidence-suite/search-evidence-console/proxy.php'

let subsSrc, proxySrc
if (args[0] === '--from-git') {
  const rev = args[1] ?? 'c5'
  const show = (p) => execFileSync('git', ['show', `${rev}:${p}`], { encoding: 'utf8' })
  subsSrc = show(SUBS)
  proxySrc = show(PROXY)
} else {
  const [siteDir, sesDir] = args
  if (!siteDir || !sesDir) {
    console.error(
      'usage: make-replacements.mjs --from-git <rev> | <pristine-syed-ai-site-dir> <pristine-search-evidence-suite-dir>',
    )
    process.exit(2)
  }
  const subs = join(siteDir, 'subscribers.php')
  const proxy = join(sesDir, 'search-evidence-console', 'proxy.php')
  for (const f of [subs, proxy]) if (!existsSync(f)) throw new Error(`not found: ${f}`)
  subsSrc = readFileSync(subs, 'utf8')
  proxySrc = readFileSync(proxy, 'utf8')
}

const key = subsSrc.match(/const SUBS_KEY = '([0-9a-f]{18})'/)?.[1]
if (!key || sha(key) !== LEGACY_KEY_SHA256) throw new Error('pristine key not found or hash mismatch')

const hosts = []
for (const m of proxySrc.matchAll(/['"]([a-z0-9.-]+\.[a-z]{2,})['"]/gi)) {
  const h = m[1].toLowerCase()
  if (FILE_EXT_TLDS.has(h.split('.').pop())) continue
  if (OWNER_DOMAINS.some((d) => h === d || h.endsWith('.' + d))) continue
  if (!hosts.includes(h)) hosts.push(h)
}
// Same numbering as the working-tree redaction so history and HEAD agree byte-for-byte.
const committed = JSON.parse(
  readFileSync(
    new URL(
      '../../legacy-reference/search-evidence-suite/search-evidence-console/allowlist.sha256.json',
      import.meta.url,
    ),
    'utf8',
  ),
).sha256
const unknown = hosts.filter((h) => !committed.includes(sha(h)))
if (unknown.length) throw new Error(`${unknown.length} pristine host(s) missing from allowlist.sha256.json`)

const lines = [`${key}==><legacy-admin-key-redacted>`]
hosts.forEach((h, i) => lines.push(`${h}==>redacted-client-host-${String(i + 1).padStart(2, '0')}.invalid`))
process.stdout.write(lines.join('\n') + '\n')
console.error(`${lines.length} rules (1 key, ${hosts.length} hosts)`)
