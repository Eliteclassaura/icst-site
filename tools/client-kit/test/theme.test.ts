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
  for (const slug of ['example-industrial', '_template', 'icst']) {
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

test('ICST is light only: no system-dark and no forced-dark block, nothing derived, and the pending list says so', () => {
  const t = loadTokens(path.join(clients, 'icst'))
  assert.deepEqual(t.modes, ['light'])
  assert.equal(t.dark, null)
  const css = renderTokensCss(t)
  assert.ok(!css.includes('prefers-color-scheme'))
  assert.ok(!css.includes('data-theme="dark"'))
  assert.ok(css.includes('No dark theme'))
  assert.ok(t.pending.some((x) => x.token === 'dark'))
  assert.equal(readFileSync(path.join(clients, 'icst/theme/tokens.css'), 'utf8'), css)
})

test('ICST values: error is the CT-ruled #b42318 at 6.5:1 or better; the pending warning is emitted only because it is listed', () => {
  const t = loadTokens(path.join(clients, 'icst'))
  assert.equal(t.light.error, '#b42318')
  assert.ok(contrast('#b42318', t.light.surface as string) >= 6.5)
  assert.ok(t.pending.some((x) => x.token === 'light.warning'))
})

test('a null token must be listed in pending; a dark theme must match modes; dark is never derived silently', () => {
  const t = raw()
  t.light.warning = null
  let r = validateTokens(t)
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.issues.some((i) => i.path === '$.light.warning'))
  t.pending = [{ token: 'light.warning', reason: 'awaiting DD' }]
  assert.equal(validateTokens(t).ok, true)
  assert.ok(!renderTokensCss((validateTokens(t) as { ok: true; tokens: never }).tokens).split('@media')[0].includes('--client-warning'), 'the light block omits the pending token')
  const lightOnly = raw()
  lightOnly.modes = ['light']
  r = validateTokens(lightOnly)
  assert.ok(!r.ok && r.issues.some((i) => i.path === '$.dark'))
  const missingDark = raw()
  missingDark.dark = null
  r = validateTokens(missingDark)
  assert.ok(!r.ok && r.issues.some((i) => i.path === '$.dark'))
})

test('derived states are contrast-checked: a pale accentDeep fails with the derived ratio', () => {
  const t = raw()
  t.light.accentDeep = '#9bbfae'
  const r = validateTokens(t)
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.issues.some((i) => i.message.startsWith('derived ')))
  const ok = renderTokensCss(loadTokens(path.join(clients, 'example-industrial')))
  for (const v of ['accent-hover', 'accent-active', 'link', 'link-hover', 'focus-ring']) assert.ok(ok.includes(`--client-${v}:`), v)
})
