#!/usr/bin/env node
/**
 * Runner for the design CLI.
 *
 * Registry blocks import their own `.css`, which Node cannot load, and the Lexical renderer
 * resolves out of `@factory/agency-core`'s own tree — the two reasons the C5.5 spike had to be
 * pre-bundled. So the CLI is bundled with esbuild (`.css` → empty module, everything else inlined
 * so no runtime resolution is needed) into a gitignored file and executed from there.
 *
 * The bundle step is deterministic and cheap (~1 s); it is not cached, because a stale cache
 * silently rendering yesterday's blocks is exactly the failure a design bundle must not have.
 *
 *   node tools/design-bundle/run.mjs bundle --site syed-ai [--fonts inline|shared] [--check]
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const outDir = join(here, '.build')
const outFile = join(outDir, 'cli.mjs')

mkdirSync(outDir, { recursive: true })
await build({
  entryPoints: [join(here, 'src/cli.ts')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  jsx: 'automatic',
  packages: 'bundle',
  external: ['node:*'],
  loader: { '.css': 'empty' },
  // react-dom/server.node reaches for CommonJS `require('util')`; give the ESM bundle a real one.
  banner: {
    js: "import{createRequire as __createRequire}from'node:module';const require=__createRequire(import.meta.url);",
  },
  logLevel: 'warning',
  // React server rendering reads this to pick the production build.
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
})

const res = spawnSync(process.execPath, [outFile, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, FACTORY_ROOT: root },
})
rmSync(outDir, { recursive: true, force: true })
process.exit(res.status ?? 1)
