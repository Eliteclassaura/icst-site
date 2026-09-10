#!/usr/bin/env node
/**
 * Writes a `factory.seo/deploy-event` artefact (ADR-028 §5, pack P7) to apps/<client>/handoff/deploy/<run_id>.json.
 * Called by the deploy step (Coolify post-deploy hook or CI) with the environment and base URL.
 *
 *   node tools/parity/emit-deploy-event.mjs --site syed-ai --env staging --base https://staging.example.test [--status deployed|rolled_back] [--previous <sha>]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
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
const blueprintRaw = readFileSync(resolve(root, `apps/${site}/content/${site}.blueprint.json`))
const sha = (b) => createHash('sha256').update(b).digest('hex')
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
const gitSha = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim()
const migDir = resolve(root, `apps/${site}/src/migrations`)
const migrations = existsSync(migDir)
  ? readdirSync(migDir)
      .filter((f) => /^\d{8}_\d{6}_.+\.ts$/.test(f))
      .map((f) => f.replace(/\.ts$/, ''))
  : []
const runId = ulid()
const artefact = {
  contract: 'factory.seo/deploy-event',
  contract_version: '1.0.0',
  produced_by: { system: 'factory-app', version: gitSha.slice(0, 7) },
  produced_at: new Date().toISOString(),
  project_id: site,
  run_id: runId,
  inputs: [{ artefact: `${site}.blueprint.json`, sha256: sha(blueprintRaw) }],
  payload: {
    environment: String(args.env || 'staging'),
    base_url: String(args.base),
    blueprint_sha256: sha(blueprintRaw),
    git_sha: gitSha,
    migrations_applied: migrations,
    status: String(args.status || 'deployed'),
    previous_git_sha: args.previous ? String(args.previous) : null,
  },
}
// Self-check before writing (dependency-free). The deploy job has no toolchain — no pnpm, no
// node_modules — so it cannot run `seo-contracts validate`; this mirrors the envelope rules that
// matter at the boundary, and CI validates committed artefacts against the real contract.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const fail = (m) => {
  console.error(`✖ deploy-event refused: ${m}`)
  process.exit(1)
}
const walk = (v, path = '$') => {
  if (typeof v === 'string') {
    if (EMAIL.test(v)) fail(`email address not allowed in artefacts (${path})`)
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
}
walk(artefact)
if (!/^\d+\.\d+\.\d+$/.test(artefact.contract_version)) fail('contract_version is not semver')
if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(artefact.run_id)) fail('run_id is not a ULID')
if (!['local', 'ci', 'preview', 'staging', 'production'].includes(artefact.payload.environment))
  fail(`unknown environment "${artefact.payload.environment}"`)
if (!['deployed', 'rolled_back'].includes(artefact.payload.status))
  fail(`unknown status "${artefact.payload.status}"`)
if (!/^[0-9a-f]{7,40}$/.test(artefact.payload.git_sha)) fail('git_sha is not 7–40 hex')
if (!/^https?:\/\//.test(artefact.payload.base_url)) fail('base_url is not an absolute URL')
if (artefact.payload.status === 'rolled_back' && !artefact.payload.previous_git_sha)
  fail('a rolled_back event needs --previous <sha>')

const outDir = resolve(root, `apps/${site}/handoff/deploy`)
mkdirSync(outDir, { recursive: true })
const out = resolve(outDir, `${runId}.json`)
writeFileSync(out, JSON.stringify(artefact, null, 2) + '\n')
console.log(`✔ deploy-event ${runId} → ${out.replace(root + '/', '')}`)
