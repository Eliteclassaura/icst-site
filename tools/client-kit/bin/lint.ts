#!/usr/bin/env node
/**
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin/lint.ts ratchet <src|tests> <check|init|update|rebase>
 *   node ... lint.ts scan <dir> --client <slug> --scope <output|render|seed|source> [--exclude regex]
 *   node ... lint.ts rows <file.json> --client <slug> --scope seed
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMatcher, loadBlocklists, SCOPES, type Scope } from '../src/blocklist.ts'
import { loadManifest, ManifestError } from '../src/manifest.ts'
import { compare, countHits, freshBaseline, lowered, type Baseline, type RatchetSet } from '../src/ratchet.ts'
import { scanRows, scanTree } from '../src/scan.ts'

const out = (m: string) => process.stdout.write(`${m}\n`)
const here = path.dirname(fileURLToPath(import.meta.url))
const kit = path.resolve(here, '..')
const repo = path.resolve(kit, '../..')
const clients = path.join(repo, 'clients')

const args = process.argv.slice(2)
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : undefined
}
const die = (m: string, code = 2): never => {
  console.error(m)
  process.exit(code)
}

/** Blocklist of every OTHER client for a target client, minus that client's declared overlap. */
function matcherFor(client: string, scope: Scope) {
  const manifest = loadManifest(path.join(clients, client))
  const others = loadBlocklists(clients).filter((l) => l.client !== client)
  return buildMatcher(others, scope, manifest.review.allowedOverlap)
}

try {
  const [sub, third] = args
  if (sub === 'ratchet') {
    const setName = third ?? die('usage: lint ratchet <src|tests> <check|init|update|rebase>')
    const action = args[2] ?? 'check'
    const config = JSON.parse(readFileSync(path.join(kit, 'ratchet.config.json'), 'utf8')) as { sets: RatchetSet[] }
    const set = config.sets.find((s) => s.name === setName) ?? die(`unknown set ${setName}`)
    const lists = loadBlocklists(clients)
    const matcher = buildMatcher(lists, 'source')
    const now = countHits(repo, set, matcher)
    const file = path.join(kit, `ratchet-baseline.${setName}.json`)
    const clientsNow = lists.map((l) => l.client).sort().join(',')
    if (action === 'rebase') {
      // Adding a client to the blocklist set legitimately changes the counts. Rebase is only allowed when the set changed, so it cannot hide a regression.
      const old = JSON.parse(readFileSync(file, 'utf8')) as Baseline
      if (old.blocklistClients.join(',') === clientsNow) die('rebase is only for a changed blocklist set; the set is unchanged, so use check/update', 1)
      writeFileSync(file, `${JSON.stringify(freshBaseline(setName, lists.map((l) => l.client), now), null, 1)}\n`)
      out(`rebased on blocklist set [${clientsNow}]: ${Object.keys(now).length} files, ${Object.values(now).reduce((a, b) => a + b, 0)} hits`)
    } else if (action === 'init') {
      if (existsSync(file)) die(`${file} exists; use update (it can only lower counts)`)
      writeFileSync(file, `${JSON.stringify(freshBaseline(setName, lists.map((l) => l.client), now), null, 1)}\n`)
      out(`baseline written: ${Object.keys(now).length} files, ${Object.values(now).reduce((a, b) => a + b, 0)} hits`)
    } else {
      const baseline = JSON.parse(readFileSync(file, 'utf8')) as Baseline
      if (baseline.blocklistClients.join(',') !== clientsNow) die(`the blocklist set changed (baseline [${baseline.blocklistClients.join(',')}], now [${clientsNow}]); run: ratchet ${setName} rebase`, 1)
      const r = compare(baseline, now)
      if (action === 'update') {
        writeFileSync(file, `${JSON.stringify(lowered(baseline, now), null, 1)}\n`)
        out(`baseline lowered: ${r.better.length} file(s) improved; total ${r.total.baseline} -> ${r.total.now}`)
        if (r.worse.length) die(`NOT written for ${r.worse.length} worsened file(s); the ratchet never rises:\n${r.worse.map((w) => `  ${w.file}: ${w.baseline} -> ${w.now}`).join('\n')}`, 1)
      } else {
        for (const w of r.worse) console.error(`WORSE  ${w.file}: ${w.baseline} -> ${w.now}`)
        out(`${setName}: total ${r.total.baseline} -> ${r.total.now}; improved ${r.better.length}; worse ${r.worse.length}${r.better.length ? ' (run update to lock the improvement in)' : ''}`)
        if (!r.ok) process.exit(1)
      }
    }
  } else if (sub === 'scan') {
    const dir = third ?? die('usage: lint scan <dir> --client <slug> --scope <scope>')
    const client = flag('client') ?? die('--client is required')
    const scope = flag('scope') as Scope
    if (!SCOPES.includes(scope)) die(`--scope must be one of ${SCOPES.join(', ')}`)
    const ex = flag('exclude')
    const found = scanTree(path.resolve(dir), matcherFor(client, scope), { exclude: ex ? new RegExp(ex) : undefined })
    for (const f of found) for (const h of f.hits.slice(0, 5)) console.error(`HIT  ${f.file}:${h.line}  [${h.client}/${h.group ?? h.kind}] ${h.text}`)
    const n = found.reduce((a, f) => a + f.hits.length, 0)
    out(`${found.length} file(s), ${n} hit(s)`)
    if (n) process.exit(1)
  } else if (sub === 'rows') {
    const file = third ?? die('usage: lint rows <file.json> --client <slug> --scope seed')
    const client = flag('client') ?? die('--client is required')
    const scope = (flag('scope') ?? 'seed') as Scope
    const found = scanRows(JSON.parse(readFileSync(file, 'utf8')), matcherFor(client, scope))
    for (const f of found) console.error(`HIT  ${f.path}  [${f.hits[0].client}/${f.hits[0].group ?? f.hits[0].kind}] ${f.hits[0].text}`)
    out(`${found.length} value(s) with hits`)
    if (found.length) process.exit(1)
  } else die('commands: ratchet | scan | rows')
} catch (e) {
  if (e instanceof ManifestError) die(e.message, 1)
  throw e
}
