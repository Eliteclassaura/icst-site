import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { loadManifest, validateManifest } from '../src/manifest.ts'
import { clients } from './helpers.ts'

const raw = (slug: string) => JSON.parse(readFileSync(path.join(clients, slug, 'manifest.json'), 'utf8'))
const issues = (v: unknown) => {
  const r = validateManifest(v)
  assert.equal(r.ok, false)
  return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`)
}

test('the synthetic client and the H2O regression manifest are valid', () => {
  assert.equal(loadManifest(path.join(clients, 'example-industrial')).client.slug, 'example-industrial')
  assert.equal(loadManifest(path.join(clients, 'h2o')).offices.map((o) => o.key).join(), 'US,TH')
})

test('unknown fields, missing fields and wrong types are all reported, none silently accepted', () => {
  const m = raw('example-industrial')
  m.extra = 1
  delete m.seo
  m.client.slug = 'X'
  const out = issues(m)
  assert.ok(out.some((x) => x.startsWith('$.extra')))
  assert.ok(out.some((x) => x.startsWith('$.seo')))
  assert.ok(out.some((x) => x.startsWith('$.client.slug')))
})

test('secret-looking field names are refused (only ops.secretsRef is a reference)', () => {
  const m = raw('example-industrial')
  m.ops.smtpPassword = 'x'
  m.email.apiKey = 'y'
  const out = issues(m)
  assert.ok(out.some((x) => x.includes('smtpPassword') && x.includes('secret-looking')))
  assert.ok(out.some((x) => x.includes('apiKey')))
})

test('the canonical origin must be https with no path; an http or pathed origin fails', () => {
  for (const bad of ['http://example.test', 'https://example.test/path', 'example.test']) {
    const m = raw('example-industrial')
    m.domains.canonical = bad
    assert.ok(issues(m).some((x) => x.startsWith('$.domains.canonical')), bad)
  }
})

test('references must resolve: routing offices exist, sender domains belong to the client, module flags agree', () => {
  const m = raw('example-industrial')
  m.routing.unknownCountry = 'NOPE'
  m.routing.rules[0].office = 'GONE'
  m.email.senders[0].address = 'sales@someone-else.test'
  m.crm.modules.library = true
  const out = issues(m)
  assert.ok(out.some((x) => x.startsWith('$.routing.unknownCountry')))
  assert.ok(out.some((x) => x.startsWith('$.routing.rules[0].office')))
  assert.ok(out.some((x) => x.startsWith('$.email.senders[0].address')))
  assert.ok(out.some((x) => x.startsWith('$.crm.modules.library')))
})

test('duplicate office keys, bad tel links and bad time zones are refused', () => {
  const m = raw('example-industrial')
  m.offices[1].key = m.offices[0].key
  m.offices[0].phones[0].tel = '+15550100'
  m.offices[1].timeZone = 'nowhere'
  const out = issues(m)
  assert.ok(out.some((x) => x.includes('duplicate')))
  assert.ok(out.some((x) => x.includes('tel:')))
  assert.ok(out.some((x) => x.includes('time zone')))
})

test('loadManifest throws with every issue and never returns a partial manifest', () => {
  assert.throws(() => loadManifest(path.join(clients, 'does-not-exist')), /Invalid manifest/)
})

test('a provisional client must say what is unconfirmed; tracking is explicit and cannot be left out', () => {
  const m = raw('example-industrial')
  m.client.status = 'provisional'
  m.client.statusNote = null
  delete m.site.tracking
  const out = issues(m)
  assert.ok(out.some((x) => x.startsWith('$.client.statusNote')))
  assert.ok(out.some((x) => x.startsWith('$.site.tracking')))
})
