/**
 * H2O compile-boundary prover (2A.1B R1).
 *
 * Computes which `@factory/agency-core` modules enter H2O's TypeScript program, by walking import and
 * re-export edges with TypeScript's own parser and resolving `@factory/agency-core/*` specifiers through
 * the package's `exports` map. It reports the edge that introduced each module, so a leak names its cause
 * rather than merely appearing.
 *
 * Run from the repository root, after `pnpm install`:
 *
 *     node verify/module_closure.mjs
 *
 * Exit 0 when the boundary is isolated; exit 1 when any forbidden module is reachable.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = process.cwd()
const CORE = path.join(ROOT, 'packages/agency-core')
const require_ = createRequire(import.meta.url)
let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript/lib/typescript.js'))
} catch {
  ts = require_('typescript')
}

const exportsMap = JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8')).exports

const FORBIDDEN = [
  'src/cms/index.ts',
  'src/cms/collections/index.ts',
  'src/cms/collections/crm.ts',
  'src/cms/collections/editorial.ts',
  'src/cms/crm.ts',
  'src/cms/editorial.ts',
  'src/cms/globals/index.ts',
  'src/cms/hooks/slug-redirect.ts',
]

function specifiers(file) {
  const sf = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  const out = []
  for (const st of sf.statements) {
    if (
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      st.moduleSpecifier &&
      ts.isStringLiteral(st.moduleSpecifier)
    )
      out.push(st.moduleSpecifier.text)
  }
  return out
}

function resolve(spec, fromFile) {
  if (spec.startsWith('@factory/agency-core')) {
    const sub = spec === '@factory/agency-core' ? '.' : '.' + spec.slice('@factory/agency-core'.length)
    const target = exportsMap[sub]
    if (!target) return { kind: 'UNRESOLVED_EXPORT', spec }
    return { kind: 'file', file: path.join(CORE, target) }
  }
  if (spec.startsWith('.')) {
    const base = path.resolve(path.dirname(fromFile), spec)
    for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')])
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return { kind: 'file', file: c }
    return { kind: 'MISSING', spec, from: fromFile }
  }
  return { kind: 'external', spec }
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '.next') walk(p, acc)
    } else if (/\.tsx?$/.test(e.name) && !p.includes('/migrations/')) acc.push(p)
  }
  return acc
}

const entries = walk(path.join(ROOT, 'apps/h2o/src'))
const seen = new Set(),
  why = new Map(),
  queue = [...entries],
  problems = []
for (const e of entries) why.set(e, 'H2O SOURCE')
while (queue.length) {
  const f = queue.shift()
  if (seen.has(f)) continue
  seen.add(f)
  for (const s of specifiers(f)) {
    const r = resolve(s, f)
    if (r.kind === 'file') {
      if (!why.has(r.file)) why.set(r.file, `${path.relative(ROOT, f)}  ->  '${s}'`)
      if (!seen.has(r.file)) queue.push(r.file)
    } else if (r.kind !== 'external') problems.push(r)
  }
}

const core = [...seen].filter((f) => f.startsWith(CORE)).sort()
console.log('=== agency-core modules in the H2O TypeScript program ===')
for (const f of core) console.log(`  ${path.relative(CORE, f).padEnd(46)} <- ${why.get(f)}`)
console.log(`\ncount: ${core.length}`)

const leaks = FORBIDDEN.filter((x) => core.some((f) => path.relative(CORE, f) === x))
if (problems.length) console.log('\nunresolved specifiers:', problems)
if (leaks.length) {
  console.log(`\nH2O_2A1B_COMPILE_BOUNDARY_STILL_NOT_ISOLATED`)
  for (const l of leaks) {
    const f = core.find((f) => path.relative(CORE, f) === l)
    console.log(`  LEAK ${l}  introduced by: ${why.get(f)}`)
  }
  process.exit(1)
}
console.log('\nforbidden modules present: NONE — boundary isolated')
