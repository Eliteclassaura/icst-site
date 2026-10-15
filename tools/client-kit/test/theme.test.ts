import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { contrast, loadTokens, renderTokensCss, validateTokens } from '../src/theme.ts'
import { clients } from './helpers.ts'

const raw = () => JSON.parse(readFileSync(path.join(clients, 'example-industrial/theme/tokens.json'), 'utf8'))

test('WCAG contrast maths: black on white is 21:1, same colour is 1:1', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21)
  assert.equal(contrast('#777777', '#777777'), 1)
})

test('the synthetic tokens are valid and the committed tokens.css is exactly what the generator writes', () => {
  for (const slug of ['example-industrial', '_template']) {
    assert.equal(readFileSync(path.join(clients, slug, 'theme/tokens.css'), 'utf8'), renderTokensCss(loadTokens(path.join(clients, slug))), slug)
  }
})

test('generated CSS has light, system-dark and forced-dark blocks and is deterministic', () => {
  const css = renderTokensCss(loadTokens(path.join(clients, 'example-industrial')))
  assert.ok(css.includes('@media (prefers-color-scheme: dark)'))
  assert.ok(css.includes(':root:not([data-theme="light"])'))
  assert.ok(css.includes(':root[data-theme="dark"]'))
  assert.equal(css, renderTokensCss(loadTokens(path.join(clients, 'example-industrial'))))
})

test('fail closed: a missing token, a non-hex colour or an unknown key stops the build', () => {
  const t = raw()
  delete t.light.accent
  t.dark.text = 'white'
  t.extra = 1
  const r = validateTokens(t)
  assert.equal(r.ok, false)
  const out = r.ok ? [] : r.issues.map((i) => i.path)
  assert.ok(out.includes('$.light.accent'))
  assert.ok(out.includes('$.dark.text'))
  assert.ok(out.includes('$.extra'))
})

test('fail closed: low contrast text, a button label too close to its accent or a faint accent is reported with the ratio', () => {
  const t = raw()
  t.light.text = '#bbbbbb'
  t.light.accentOn = '#2f7a55'
  t.dark.accent = '#222222'
  const r = validateTokens(t)
  assert.equal(r.ok, false)
  const out = r.ok ? [] : r.issues.map((i) => `${i.path} ${i.message}`)
  assert.ok(out.some((x) => x.startsWith('$.light.text') && x.includes(':1')))
  assert.ok(out.some((x) => x.startsWith('$.light.accentOn')))
  assert.ok(out.some((x) => x.startsWith('$.dark.accent')))
})

test('ICST has no tokens yet (pending the Design Director): loading them throws instead of guessing', () => {
  assert.throws(() => loadTokens(path.join(clients, 'icst')), /Invalid theme tokens/)
})
