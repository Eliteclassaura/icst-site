#!/usr/bin/env node
/**
 * Wraps a parity report (tools/parity/compare.mjs --json) as a `factory.seo/qa-report` artefact (ADR-028 §5,
 * pack P7) and writes it to apps/<client>/handoff/qa/<run_id>.json. Optionally checks PROTECT URLs from a
 * page-decisions file (`--decisions`): every PROTECT source path must be present in the report's routes.
 *
 *   node tools/parity/emit-qa-report.mjs --report parity.json --site syed-ai --env ci --base http://127.0.0.1:3000 [--decisions decisions.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : [],
    )
    .filter((x) => x.length),
)
const root = resolve(import.meta.dirname, '../..')
const site = String(args.site || 'syed-ai')
const report = JSON.parse(readFileSync(String(args.report), 'utf8'))
const blueprintPath = resolve(root, `apps/${site}/content/${site}.blueprint.json`)
const blueprintRaw = readFileSync(blueprintPath)
const baselineRaw = readFileSync(resolve(root, 'docs/baselines/seo-baseline.json'))
const sha = (b) => createHash('sha256').update(b).digest('hex')

// ULID: 10 chars Crockford time + 16 chars random. Good enough for an idempotency key; no dependency.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function ulid(t = Date.now()) {
  let time = ''
  for (let i = 0; i < 10; i++) {
    time = B32[t % 32] + time
    t = Math.floor(t / 32)
  }
  const rnd = randomBytes(16)
  let r = ''
  for (let i = 0; i < 16; i++) r += B32[rnd[i] % 32]
  return time + r
}

const CHECK_MAP = {
  status: 'status',
  title: 'title',
  description: 'description',
  canonical: 'canonical',
  robots: 'robots',
  h1: 'h1',
  jsonLdTypes: 'schema_type',
  jsonLdIds: 'schema_id',
  glossaryAnchors: 'glossary_anchors',
  internalLinks: 'internal_link',
  wordCount: 'word_count',
}
const mapCheck = (field) =>
  CHECK_MAP[field] ?? (field.startsWith('og:') ? 'og' : field.startsWith('twitter:') ? 'twitter' : 'status')
const toFinding = (url) => (f) => ({
  url,
  check: mapCheck(f.field),
  expected: f.expected,
  actual: f.actual,
  note: f.note,
})

const blocking = []
const advisory = []
for (const [route, r] of Object.entries(report.routes)) {
  for (const f of r.findings) {
    if (f.level === 'blocking') blocking.push(toFinding(route)(f))
    else if (f.level === 'advisory') advisory.push(toFinding(route)(f))
  }
}

let decisionsRunId = null
let routesInDecisions
let protectMissing = 0
if (args.decisions) {
  const d = JSON.parse(readFileSync(String(args.decisions), 'utf8'))
  decisionsRunId = d.run_id ?? null
  const pages = d.payload?.pages ?? []
  routesInDecisions = pages.length
  const checked = new Set(Object.keys(report.routes))
  for (const p of pages.filter((p) => p.action === 'PROTECT')) {
    const path = new URL(p.source_url).pathname
    const ok = checked.has(path) && report.routes[path].status === 200
    if (!ok) {
      protectMissing++
      blocking.push({
        url: path,
        check: 'protect_missing',
        expected: 200,
        actual: report.routes[path]?.status ?? 'absent',
      })
    }
  }
}

let gitSha = 'unknown'
try {
  gitSha = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim()
} catch {}

const runId = ulid()
const artefact = {
  contract: 'factory.seo/qa-report',
  contract_version: '1.0.0',
  produced_by: { system: 'factory-ci', version: gitSha },
  produced_at: new Date().toISOString(),
  project_id: site,
  run_id: runId,
  inputs: [
    { artefact: `${site}.blueprint.json`, sha256: sha(blueprintRaw) },
    { artefact: 'docs/baselines/seo-baseline.json', sha256: sha(baselineRaw) },
  ],
  payload: {
    environment: String(args.env || 'local'),
    base_url: String(args.base || report.base),
    baseline: { kind: 'frozen-old-site', sha256: sha(baselineRaw) },
    blueprint_sha256: sha(blueprintRaw),
    page_decisions_run_id: decisionsRunId,
    result: blocking.length ? 'fail' : 'pass',
    blocking,
    advisory,
    coverage: {
      routes_checked: Object.keys(report.routes).length,
      routes_in_decisions: routesInDecisions,
      protect_urls_missing: protectMissing,
    },
  },
}
const outDir = resolve(root, `apps/${site}/handoff/qa`)
mkdirSync(outDir, { recursive: true })
const out = resolve(outDir, `${runId}.json`)
writeFileSync(out, JSON.stringify(artefact, null, 2) + '\n')
console.log(
  `${artefact.payload.result === 'pass' ? '✔' : '✖'} qa-report ${runId} → ${out.replace(root + '/', '')} (${blocking.length} blocking, ${advisory.length} advisory)`,
)
process.exit(artefact.payload.result === 'pass' ? 0 : 1)
