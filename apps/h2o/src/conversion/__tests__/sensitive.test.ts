/**
 * The shared sensitive-value primitive, and the proof that both callers use it.
 *
 * R1 had two copies of this screen and they had already drifted: the event-side copy lacked the JWT
 * and provider-token patterns and checked no control characters, so a value the safe-context
 * contract refused could still reach analytics. These tests pin the categories and then assert the
 * two callers agree on every one of them, in both directions.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildSafeContext } from '../context'
import { createEventRecorder, type ConversionEvent } from '../events'
import {
  containsSensitiveValue,
  hasControlCharacter,
  isEmittableValue,
  SENSITIVE_CATEGORIES,
  sensitiveCategory,
} from '../sensitive'

const ADAPTER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** One representative value per category. Every one must be refused by both callers. */
const SENSITIVE_VALUES: Array<[string, string]> = [
  ['EMAIL', 'jane.buyer@example.com'],
  ['PHONE', '+1 555 123 4567'],
  ['PAYMENT_CARD', '4111 1111 1111 1111'],
  ['CREDENTIAL_KEYWORD', 'Bearer abcdefghijkl'],
  ['JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'],
  ['PROVIDER_TOKEN', 'sk-abcdefghijklmnop'],
  ['PRIVATE_KEY', '-----BEGIN RSA PRIVATE KEY-----'],
]

describe('the sensitive-value primitive', () => {
  it('screens for every category it claims to', () => {
    expect(SENSITIVE_CATEGORIES).toEqual([
      'EMAIL',
      'PHONE',
      'PAYMENT_CARD',
      'CREDENTIAL_KEYWORD',
      'JWT',
      'PROVIDER_TOKEN',
      'PRIVATE_KEY',
    ])
  })

  it.each(SENSITIVE_VALUES)('detects %s', (category, value) => {
    expect(sensitiveCategory(value)).toBe(category)
    expect(containsSensitiveValue(value)).toBe(true)
    expect(isEmittableValue(value)).toBe(false)
  })

  it('reports the category without ever containing the value', () => {
    const category = sensitiveCategory('jane.buyer@example.com')
    expect(category).toBe('EMAIL')
    expect(category).not.toContain('jane')
    expect(category).not.toContain('example.com')
  })

  it('detects control characters, including the ones that split a URL or a log line', () => {
    for (const code of [0x00, 0x07, 0x09, 0x0a, 0x0d, 0x1f, 0x7f]) {
      expect(hasControlCharacter(`ok${String.fromCharCode(code)}`)).toBe(true)
      expect(isEmittableValue(`ok${String.fromCharCode(code)}`)).toBe(false)
    }
  })

  it('leaves ordinary catalog values alone', () => {
    for (const value of [
      'Amarillo CF83-425X Drive Shaft',
      'amarillo-cf83-425x',
      '/products/amarillo-cf83-425x/',
      'product-hero',
      '4711',
    ]) {
      expect(containsSensitiveValue(value)).toBe(false)
      expect(isEmittableValue(value)).toBe(true)
    }
  })
})

describe('no drift between the context screen and the event screen', () => {
  it('both modules import the one primitive and define no patterns of their own', () => {
    for (const file of ['context.ts', 'events.ts']) {
      const text = readFileSync(path.join(ADAPTER_DIR, file), 'utf8')
      expect(text).toMatch(/from '\.\/sensitive'/)
      // A second copy of the screen would show up as a regex literal for one of these categories.
      expect(text).not.toMatch(/@\[A-Za-z0-9\.-\]\+/)
      expect(text).not.toMatch(/bearer\|token\|secret/i)
      expect(text).not.toMatch(/SENSITIVE_PATTERNS/)
    }
  })

  it.each(SENSITIVE_VALUES)('refuses %s in the context AND in an event payload', (_category, value) => {
    const context = buildSafeContext({ product_title: value })
    expect(context.fields).toEqual([])
    expect(context.dropped.map((d) => d.reason)).toContain('SENSITIVE_VALUE')

    const seen: ConversionEvent[] = []
    createEventRecorder((e) => seen.push(e)).record('form_error', { error_code: value })
    expect(seen[0]?.payload).toEqual({})
    expect(seen[0]?.redacted).toBe(1)
  })

  it('refuses a control character in the context AND in an event payload', () => {
    const value = `ok${String.fromCharCode(13)}${String.fromCharCode(10)}Set-Cookie: a=b`
    const context = buildSafeContext({ product_title: value })
    expect(context.fields).toEqual([])
    expect(context.dropped.map((d) => d.reason)).toContain('UNSAFE_CHARACTERS')

    const seen: ConversionEvent[] = []
    createEventRecorder((e) => seen.push(e)).record('form_error', { error_code: value })
    expect(seen[0]?.payload).toEqual({})
    expect(seen[0]?.redacted).toBe(1)
  })

  it('accepts the same ordinary value on both sides, so the screen is not simply refusing everything', () => {
    const context = buildSafeContext({ product_title: 'Amarillo CF83-425X Drive Shaft' })
    expect(context.fields).toEqual([['product_title', 'Amarillo CF83-425X Drive Shaft']])

    const seen: ConversionEvent[] = []
    createEventRecorder((e) => seen.push(e)).record('form_opened', { product_slug: 'amarillo-cf83-425x' })
    expect(seen[0]?.payload).toEqual({ product_slug: 'amarillo-cf83-425x' })
    expect(seen[0]?.redacted).toBe(0)
  })

  it('still never emits the submission token, whatever it looks like', () => {
    const seen: ConversionEvent[] = []
    const recorder = createEventRecorder((e) => seen.push(e))
    recorder.record('form_submitted', { product_id: '4711', submission_token: 'resp-abc-123' })
    expect(seen[0]?.payload).toEqual({ product_id: '4711' })
    expect(JSON.stringify(seen)).not.toContain('resp-abc-123')
  })
})
