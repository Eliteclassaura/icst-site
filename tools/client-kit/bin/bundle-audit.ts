#!/usr/bin/env node
/**
 * KIT-0 H6b: how much of another client's material does an entry point drag into a build? Bundles each entry with esbuild
 * (externals kept external, CSS ignored), then reports reachable source files, bytes by area and no-client-strings hits for
 * `--client <slug>` in the bundle text. It is an approximation of what a real `next build` output carries, cheap enough to run anywhere.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin/bundle-audit.ts --client icst apps/h2o/src/proxy.ts apps/h2o/src/payload.config.ts
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import type * as EsbuildModule from 'esbuild'
import { fileURLToPath } from 'node:url'
import { buildMatcher, loadBlocklists, scanText } from '../src/blocklist.ts'
import { loadManifest } from '../src/load.ts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2)
const ci = args.indexOf('--client')
const client = ci >= 0 ? args[ci + 1] : undefined
const entries = args.filter((a, i) => !a.startsWith('--') && i !== ci + 1)
if (!client || entries.length === 0) {
  process.stderr.write('usage: bundle-audit --client <slug> <entry.ts>...\n')
  process.exit(2)
}
const require = createRequire(path.join(repo, 'apps/h2o/package.json'))
const esbuild = require('esbuild') as typeof EsbuildModule
const manifest = loadManifest(path.join(repo, 'clients', client))
const matcher = buildMatcher(loadBlocklists(path.join(repo, 'clients')).filter((l) => l.client !== client), 'output', manifest.review.allowedOverlap)
const tmp = mkdtempSync(path.join(os.tmpdir(), 'bundle-audit-'))
try {
  for (const entry of entries) {
    const outfile = path.join(tmp, `${path.basename(entry)}.js`)
    const r = await esbuild.build({
      entryPoints: [path.join(repo, entry)],
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      loader: { '.css': 'empty' },
      metafile: true,
      outfile,
      logLevel: 'error',
      absWorkingDir: path.join(repo, 'apps/h2o'),
    })
    const out = Object.values(r.metafile.outputs)[0]
    const areas = new Map<string, number>()
    for (const [k, v] of Object.entries(out.inputs)) {
      const rel = path.relative(repo, path.resolve(path.join(repo, 'apps/h2o'), k)).split(path.sep)
      const area = rel.slice(0, rel[0] === 'apps' ? 4 : 2).join('/')
      areas.set(area, (areas.get(area) ?? 0) + v.bytesInOutput)
    }
    const hits = scanText(readFileSync(outfile, 'utf8'), matcher)
    const byGroup = new Map<string, number>()
    for (const h of hits) byGroup.set(`${h.client}/${h.group ?? h.kind}`, (byGroup.get(`${h.client}/${h.group ?? h.kind}`) ?? 0) + 1)
    process.stdout.write(`${entry}: ${Object.keys(out.inputs).length} input files, ${hits.length} hit(s) for ${client}\n`)
    for (const [a, b] of [...areas].sort((x, y) => y[1] - x[1]).slice(0, 8)) process.stdout.write(`  ${String(b).padStart(9)} bytes  ${a}\n`)
    for (const [g, n] of [...byGroup].sort((x, y) => y[1] - x[1])) process.stdout.write(`  hits ${String(n).padStart(5)}  ${g}\n`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
