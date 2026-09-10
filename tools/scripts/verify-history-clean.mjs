#!/usr/bin/env node
/**
 * Verifies that no commit in the repository still carries the compromised legacy key or a legacy
 * allowlist host (ADR-027, docs/runbooks/first-push.md). Works from hashes only — it never needs
 * the literals. Exit 1 with the offending commits if any are found.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const sha = (s) => createHash('sha256').update(s).digest('hex')
const LEGACY_KEY_SHA256 = '1baadc53e62c18f5b7d6fe7fef945a7427d015c54297ea2625b8bc0b75672cf5'
const hostHashes = new Set(
  JSON.parse(
    readFileSync(
      new URL(
        '../../legacy-reference/search-evidence-suite/search-evidence-console/allowlist.sha256.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ).sha256,
)
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 })
const commits = git('rev-list', '--all').trim().split('\n').filter(Boolean)
const bad = []
for (const c of commits) {
  const files = git('ls-tree', '-r', '--name-only', c).trim().split('\n')
  for (const f of files) {
    if (/\.(png|jpe?g|webp|gif|woff2?|ico|pdf|zip)$/i.test(f)) continue
    let text
    try {
      text = git('show', `${c}:${f}`)
    } catch {
      continue
    }
    for (const m of text.matchAll(/\b[0-9a-f]{18}\b/g))
      if (sha(m[0]) === LEGACY_KEY_SHA256) bad.push(`${c.slice(0, 8)} ${f}: legacy key`)
    for (const m of text.matchAll(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi))
      if (hostHashes.has(sha(m[0].toLowerCase()))) bad.push(`${c.slice(0, 8)} ${f}: allowlist host`)
  }
}
if (bad.length) {
  console.error(`HISTORY NOT CLEAN — ${bad.length} finding(s):\n` + [...new Set(bad)].join('\n'))
  process.exit(1)
}
console.error(`history clean: ${commits.length} commits, no legacy key, no allowlist host`)
