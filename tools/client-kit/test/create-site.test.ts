import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildMatcher, loadBlocklists } from '../src/blocklist.ts'
import { createSite } from '../src/create-site.ts'
import { loadManifest } from '../src/load.ts'
import { scanTree } from '../src/scan.ts'
import { clientsCopy } from './helpers.ts'

const site = { slug: 'acme-pumps', name: 'Acme Pumps', legal: 'Acme Pumps Co., Ltd.', short: 'Acme', domain: 'acmepumps.test', tenant: 'ACME' }

test('create-site scaffolds a valid client with its own starter blocklist', () => {
  const root = clientsCopy()
  const dest = createSite(root, site)
  const m = loadManifest(dest)
  assert.equal(m.client.slug, 'acme-pumps')
  assert.equal(m.domains.canonical, 'https://acmepumps.test')
  assert.equal(m.client.legalName, 'Acme Pumps Co., Ltd.')
  const bl = JSON.parse(readFileSync(path.join(dest, 'blocklist.json'), 'utf8'))
  assert.deepEqual(bl.entries.map((e: { value: string }) => e.value), ['Acme Pumps', 'Acme Pumps Co., Ltd.', 'acmepumps.test'])
  assert.ok(!readFileSync(path.join(dest, 'manifest.json'), 'utf8').includes('__'), 'no template token is left behind')
})

test('create-site refuses an existing client, a bad slug, and leaves nothing behind on failure', () => {
  const root = clientsCopy()
  assert.throws(() => createSite(root, { ...site, slug: 'h2o' }), /already exists/)
  assert.throws(() => createSite(root, { ...site, slug: 'Bad Slug' }), /slug/)
  assert.throws(() => createSite(root, { ...site, slug: '_x1' }), /slug/)
  assert.throws(() => createSite(root, { ...site, slug: 'acme-two', domain: 'not a host' }), /Invalid manifest/)
  assert.equal(existsSync(path.join(root, 'acme-two')), false)
})

test('a new client that keeps the template\'s synthetic offices fails the lint (the fakes are on the example blocklist)', () => {
  const root = clientsCopy()
  const dest = createSite(root, site)
  const m = buildMatcher(loadBlocklists(root).filter((l) => l.client !== 'acme-pumps'), 'output')
  const found = scanTree(dest, m, { exclude: /(^|\/)blocklist\.json$/ })
  assert.ok(found.some((f) => f.file === 'manifest.json'), 'the leftover 1 Sample Street / +1-555-0100 is caught')
})

test('the template is itself not a client: its folder starts with _ and carries no blocklist', () => {
  const root = clientsCopy()
  assert.equal(existsSync(path.join(root, '_template', 'blocklist.json')), false)
  writeFileSync(path.join(root, '_template', 'note.txt'), 'x')
  assert.ok(loadBlocklists(root).every((l) => !l.client.startsWith('_')))
})
