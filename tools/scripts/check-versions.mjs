// Verifies docs/versions.md against the lockfile and runtime (release-plan C1 acceptance).
// Every "| package | version |" row in the Application / Dev-test tables must match pnpm-lock.yaml.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import YAML from 'yaml'

const root = resolve(import.meta.dirname, '../..')
const md = readFileSync(resolve(root, 'docs/versions.md'), 'utf8')
const lock = YAML.parse(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8'))

const resolved = new Map()
for (const imp of Object.values(lock.importers ?? {})) {
  for (const sec of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(imp[sec] ?? {})) {
      const v = String(spec.version).split('(')[0]
      resolved.set(name, v)
    }
  }
}

const rows = [...md.matchAll(/^\|\s*(@?[a-z0-9./_-]+)\s*\|\s*\*{0,2}([0-9][^\s|*]*)\*{0,2}/gm)]
const problems = []
let checked = 0
for (const [, name, version] of rows) {
  if (!resolved.has(name)) continue
  checked++
  if (resolved.get(name) !== version)
    problems.push(`${name}: versions.md says ${version}, lockfile has ${resolved.get(name)}`)
}
const node = process.version.slice(1)
const nodeRow = md.match(/\|\s*Node\.js\s*\|\s*([0-9.]+)/)?.[1]
if (nodeRow && nodeRow.split('.')[0] !== node.split('.')[0])
  problems.push(`Node major mismatch: versions.md ${nodeRow}, runtime ${node}`)
const pnpm = execSync('pnpm -v').toString().trim()
const pnpmRow = md.match(/\|\s*pnpm\s*\|\s*([0-9.]+)/)?.[1]
if (pnpmRow && pnpmRow !== pnpm) problems.push(`pnpm: versions.md ${pnpmRow}, runtime ${pnpm}`)

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`versions.md matches lockfile for ${checked} packages; node ${node}, pnpm ${pnpm}`)
