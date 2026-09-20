import { describe, expect, it } from 'vitest'
import { resolveTypeformConfig, typeformConfigFromEnv } from '../config'

const ORIGIN = 'https://form.typeform.com'
const ID = 'aB3xY9Qz'

describe('configuration contract — fail closed', () => {
  it('accepts a well-formed form id and approved origin', () => {
    const result = resolveTypeformConfig({ H2O_TYPEFORM_FORM_ID: ID, H2O_TYPEFORM_ORIGIN: ORIGIN })
    expect(result).toEqual({ ok: true, value: { formId: ID, origin: ORIGIN } })
  })

  it('refuses a missing form id', () => {
    expect(resolveTypeformConfig({ H2O_TYPEFORM_ORIGIN: ORIGIN })).toEqual({
      ok: false,
      reason: 'FORM_ID_MISSING',
    })
    expect(resolveTypeformConfig({ H2O_TYPEFORM_FORM_ID: '   ', H2O_TYPEFORM_ORIGIN: ORIGIN })).toEqual({
      ok: false,
      reason: 'FORM_ID_MISSING',
    })
  })

  it.each([
    ['too short', 'ab12'],
    ['too long', 'a'.repeat(33)],
    ['path traversal', '../../etc/passwd'],
    ['slash', 'abc/def123'],
    ['absolute url', 'https://evil.example/to/x'],
    ['protocol-relative', '//evil.example'],
    ['query smuggling', 'abc123?next=https://evil.example'],
    ['fragment smuggling', 'abc123#https://evil.example'],
    ['whitespace inside', 'abc 123def'],
    ['dot separator', 'abc.123def'],
    ['unicode lookalike', 'аbc123def'],
  ])('refuses a malformed form id: %s', (_label, value) => {
    expect(resolveTypeformConfig({ H2O_TYPEFORM_FORM_ID: value, H2O_TYPEFORM_ORIGIN: ORIGIN })).toEqual({
      ok: false,
      reason: 'FORM_ID_MALFORMED',
    })
  })

  it('refuses a missing origin', () => {
    expect(resolveTypeformConfig({ H2O_TYPEFORM_FORM_ID: ID })).toEqual({
      ok: false,
      reason: 'ORIGIN_MISSING',
    })
  })

  it.each([
    ['unapproved host', 'https://evil.example', 'ORIGIN_NOT_APPROVED'],
    ['suffix lookalike', 'https://form.typeform.com.evil.example', 'ORIGIN_NOT_APPROVED'],
    ['prefix lookalike', 'https://notform.typeform.com', 'ORIGIN_NOT_APPROVED'],
    ['subdomain of approved host', 'https://a.form.typeform.com', 'ORIGIN_NOT_APPROVED'],
    ['plain http', 'http://form.typeform.com', 'ORIGIN_NOT_HTTPS'],
    ['javascript scheme', 'javascript:alert(1)', 'ORIGIN_MALFORMED'],
    ['data scheme', 'data:text/html,<script>', 'ORIGIN_MALFORMED'],
    ['carries a path', 'https://form.typeform.com/to/abc123', 'ORIGIN_MALFORMED'],
    ['carries a query', 'https://form.typeform.com/?x=1', 'ORIGIN_MALFORMED'],
    ['carries credentials', 'https://user:pw@form.typeform.com', 'ORIGIN_MALFORMED'],
    ['not a url', 'form.typeform.com', 'ORIGIN_MALFORMED'],
    ['wildcard', '*', 'ORIGIN_MALFORMED'],
  ])('refuses an unapproved origin: %s', (_label, value, reason) => {
    expect(resolveTypeformConfig({ H2O_TYPEFORM_FORM_ID: ID, H2O_TYPEFORM_ORIGIN: value })).toEqual({
      ok: false,
      reason,
    })
  })

  it('never falls back to a default form id or origin', () => {
    const empty = resolveTypeformConfig({})
    expect(empty.ok).toBe(false)
    expect(JSON.stringify(empty)).not.toMatch(/typeform\.com/)
  })

  it('reads only the two documented environment variables', () => {
    const env = {
      H2O_TYPEFORM_FORM_ID: ID,
      H2O_TYPEFORM_ORIGIN: ORIGIN,
      TYPEFORM_FORM_ID: 'shouldNotBeUsed',
      TYPEFORM_ORIGIN: 'https://evil.example',
    } as unknown as NodeJS.ProcessEnv
    expect(typeformConfigFromEnv(env)).toEqual({ ok: true, value: { formId: ID, origin: ORIGIN } })
  })
})
