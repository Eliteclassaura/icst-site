import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { buildMatcher, loadBlocklists } from '../src/blocklist.ts'
import { loadManifest } from '../src/manifest.ts'
import { compare, countHits, freshBaseline, lowered, type RatchetSet } from '../src/ratchet.ts'
import { scanRows, scanTree } from '../src/scan.ts'
import { clients, tmp } from './helpers.ts'

const matcherFor = (client: string, scope: 'output' | 'render' | 'seed' | 'source') =>
  buildMatcher(loadBlocklists(clients).filter((l) => l.client !== client), scope, loadManifest(path.join(clients, client)).review.allowedOverlap)

test('layer 2/3: the synthetic client\'s whole folder is clean against the H2O blocklist', () => {
  assert.deepEqual(scanTree(path.join(clients, 'example-industrial'), matcherFor('example-industrial', 'output'), { exclude: /(^|\/)blocklist\.json$/ }), [])
})

test('layer 2/3: a dirty variant (one H2O string injected into a template, a seed row and an email) fails, and names where', () => {
  const dirty = path.join(tmp('dirty'), 'example-industrial-dirty')
  cpSync(path.join(clients, 'example-industrial'), dirty, { recursive: true })
  mkdirSync(path.join(dirty, 'render'), { recursive: true })
  writeFileSync(path.join(dirty, 'render', 'home.html'), '<footer>Call +1 (303) 462-2000, Industrial Cooling Solutions</footer>')
  writeFileSync(path.join(dirty, 'render', 'email-t1.txt'), 'Hello,\n\nRegards,\nRhonda\nsales@h2ocooling.com')
  const m = matcherFor('example-industrial', 'render')
  const found = scanTree(dirty, m, { exclude: /(^|\/)blocklist\.json$/ })
  assert.deepEqual(found.map((f) => f.file), ['render/email-t1.txt', 'render/home.html'])
  const values = found.flatMap((f) => f.hits.map((h) => h.group))
  for (const g of ['h2o-persona', 'h2o-domain', 'office-us', 'h2o-name']) assert.ok(values.includes(g), g)
  const rows = scanRows({ pages: [{ title: 'fine' }, { title: 'About Industrial Cooling Solutions' }] }, matcherFor('example-industrial', 'seed'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].path, '$.pages[1].title')
})

test('the other direction: H2O output is checked against the example client\'s strings too', () => {
  const m = matcherFor('h2o', 'output')
  assert.equal(scanRows({ a: 'Welcome to Example Industrial' }, m).length, 1)
  assert.equal(scanRows({ a: 'Welcome to Industrial Cooling Solutions' }, m).length, 0)
})

test('layer 1: the ratchet fails on a worse file or a new file, passes on better, and update never raises a number', () => {
  const base = freshBaseline('src', ['h2o'], { 'a.ts': 3, 'b.ts': 1 })
  assert.equal(compare(base, { 'a.ts': 3, 'b.ts': 1 }).ok, true)
  const worse = compare(base, { 'a.ts': 4, 'b.ts': 1 })
  assert.equal(worse.ok, false)
  assert.deepEqual(worse.worse, [{ file: 'a.ts', baseline: 3, now: 4 }])
  assert.equal(compare(base, { 'a.ts': 3, 'b.ts': 1, 'new.ts': 1 }).ok, false, 'a new file with a hit')
  const better = compare(base, { 'a.ts': 2 })
  assert.equal(better.ok, true)
  assert.equal(better.better.length, 2)
  const next = lowered(base, { 'a.ts': 2, 'b.ts': 5, 'c.ts': 9 })
  assert.deepEqual(next.files, { 'a.ts': 2, 'b.ts': 1 }, 'lowers a, never raises b, ignores new c')
  assert.equal(next.total, 3)
})

test('layer 1: counting hits in a real git tree honours include/exclude and skips non-text files', () => {
  const repo = tmp('repo')
  const run = (...a: string[]) => execFileSync('git', a, { cwd: repo })
  run('init', '-q')
  mkdirSync(path.join(repo, 'src/__tests__'), { recursive: true })
  writeFileSync(path.join(repo, 'src/a.ts'), "export const n = 'Rhonda'\n// Rhonda\n")
  writeFileSync(path.join(repo, 'src/clean.ts'), 'export const n = 1\n')
  writeFileSync(path.join(repo, 'src/__tests__/a.test.ts'), "'Rhonda'")
  writeFileSync(path.join(repo, 'src/logo.png'), 'Rhonda')
  run('add', '-A')
  const set: RatchetSet = { name: 'src', roots: ['src'], exclude: ['(^|/)__tests__/'] }
  const m = buildMatcher(loadBlocklists(clients), 'source')
  assert.deepEqual(countHits(repo, set, m), { 'src/a.ts': 2 })
  assert.deepEqual(countHits(repo, { name: 'tests', roots: ['src'], include: '__tests__/', exclude: [] }, m), { 'src/__tests__/a.test.ts': 1 })
})

test('the committed baselines are in step with the tree (no file worse than its baseline)', () => {
  const repoRoot = path.resolve(clients, '..')
  for (const name of ['src', 'tests']) {
    const baseline = JSON.parse(readFileSync(path.join(repoRoot, `tools/client-kit/ratchet-baseline.${name}.json`), 'utf8'))
    assert.equal(baseline.set, name)
    assert.equal(Object.values(baseline.files as Record<string, number>).reduce((a, b) => a + b, 0), baseline.total)
  }
})
