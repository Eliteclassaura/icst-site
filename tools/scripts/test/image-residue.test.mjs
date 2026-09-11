// Regression cover for the C8 production-image content assertion in .github/workflows/ci.yml.
//
// The contract (docs/deployment-coolify-cloudflare.md, docs/release-plan.md) is first-party residue
// prevention, enforced through .dockerignore — which cannot reach inside published npm packages. A
// dependency that ships its own test/ directory (thread-stream does) is therefore not a C8 violation,
// but Factory test source in the image still is.
//
// The shell expression is read out of ci.yml rather than copied here, so this test cannot drift from
// the gate it covers.

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const line = workflow.split('\n').find((l) => l.includes('check "test files"'))
const expression = line?.match(/'(.*)'\s*$/)?.[1]

const tree = (...paths) => {
  const root = mkdtempSync(join(tmpdir(), 'c8-image-'))
  for (const rel of paths) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, '')
  }
  return root
}

const run = (root) => execFileSync('sh', ['-c', expression.replace('/app', root)], { encoding: 'utf8' })

test('the C8 test-file assertion is present in ci.yml', () => {
  assert.ok(line, 'ci.yml no longer contains a `check "test files"` line')
  assert.ok(expression, 'the assertion expression could not be read out of ci.yml')
  assert.match(expression, /-not -path "\*\/node_modules\/\*"/)
})

test('first-party test source in the image is still caught', () => {
  const root = tree('apps/syed-ai/src/blocks/hero.test.ts', 'apps/syed-ai/e2e/health.spec.ts')
  const found = run(root)
  assert.match(found, /hero\.test\.ts/)
  assert.match(found, /health\.spec\.ts/)
})

test('a dependency shipping its own tests is not reported as Factory residue', () => {
  const root = tree('node_modules/.pnpm/thread-stream@3.2.0/node_modules/thread-stream/test/ts.test.ts')
  assert.equal(run(root).trim(), '')
})

test('dependency tests are ignored but first-party tests beside them are not', () => {
  const root = tree(
    'node_modules/.pnpm/thread-stream@3.2.0/node_modules/thread-stream/test/ts.test.ts',
    'apps/syed-ai/src/blocks/hero.test.ts',
  )
  const found = run(root)
  assert.match(found, /hero\.test\.ts/)
  assert.doesNotMatch(found, /thread-stream/)
})
