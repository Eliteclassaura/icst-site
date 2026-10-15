import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMatcher, loadBlocklists, scanText, validateBlocklist, type Blocklist, type Entry } from '../src/blocklist.ts'
import { clients } from './helpers.ts'

const all = ['source', 'output', 'seed', 'render'] as Entry['scopes']
const list = (entries: Array<Partial<Entry> & Pick<Entry, 'value' | 'kind'>>, client = 'acme'): Blocklist => ({ schemaVersion: 1, client, entries: entries.map((e) => ({ scopes: all, ...e })) })
const hits = (text: string, l: Blocklist, scope: 'output' | 'source' = 'output', allowed: string[] = []) => scanText(text, buildMatcher([l], scope, allowed)).map((h) => h.value)

test('word entries need word boundaries: ICS matches "ICS" but not "ICSI", "topics" or ICS_FOO', () => {
  const l = list([{ value: 'ICS', kind: 'word' }])
  assert.deepEqual(hits('Contact ICS today', l), ['ICS'])
  assert.deepEqual(hits('ics.', l), ['ICS'])
  assert.deepEqual(hits('ICSI topics ICS_FOO', l), [])
})

test('text entries ignore case and runs of whitespace, including line breaks', () => {
  const l = list([{ value: 'Industrial Cooling Solutions', kind: 'text' }])
  assert.equal(hits('industrial   cooling\nsolutions', l).length, 1)
})

test('domain entries match the host and subdomains, not look-alikes', () => {
  const l = list([{ value: 'acme.com', kind: 'domain' }])
  assert.equal(hits('mail sales@acme.com and www.acme.com', l).length, 2)
  assert.equal(hits('notacme.com and acme.company', l).length, 0)
})

test('phone entries match any separator style and an optional plus, not a longer number', () => {
  const l = list([{ value: '+1 303 462 2000', kind: 'phone' }])
  for (const t of ['+1-303-462-2000', '1 (303) 462 2000', 'tel:+13034622000', '+1.303.462.2000']) assert.equal(hits(t, l).length, 1, t)
  assert.equal(hits('9913034622000', l).length, 0)
})

test('scopes are honoured: a source-only entry is not looked for in output', () => {
  const l = list([{ value: 'acme-token', kind: 'word', scopes: ['source'] }])
  assert.equal(hits('acme-token', l, 'output').length, 0)
  assert.equal(hits('acme-token', l, 'source').length, 1)
})

test('allowedOverlap removes an entry by value or by group, per pair', () => {
  const l = list([
    { value: 'Serm-Mit Tower', kind: 'text', group: 'office-th' },
    { value: 'ICS', kind: 'word', group: 'ics-brand' },
  ])
  assert.equal(hits('Serm-Mit Tower, ICS', l).length, 2)
  assert.deepEqual(hits('Serm-Mit Tower, ICS', l, 'output', ['office-th']), ['ICS'])
  assert.deepEqual(hits('Serm-Mit Tower, ICS', l, 'output', ['ics']), ['Serm-Mit Tower'])
  assert.deepEqual(hits('Serm-Mit Tower, ICS', l, 'output', ['ics', 'office-th']), [])
})

test('hits report the line and the matched text; entries too short to be safe are refused', () => {
  const m = buildMatcher([list([{ value: 'Rhonda', kind: 'word' }])], 'output')
  const h = scanText('a\nb\nSigned, Rhonda', m)
  assert.equal(h[0].line, 3)
  assert.equal(validateBlocklist(list([{ value: 'ab', kind: 'text' }])).ok, false)
  assert.equal(validateBlocklist(list([{ value: '12345', kind: 'phone' }])).ok, false)
})

test('the committed blocklists load and name their own client folder', () => {
  const lists = loadBlocklists(clients)
  assert.deepEqual(lists.map((l) => l.client).sort(), ['example-industrial', 'h2o'])
})
