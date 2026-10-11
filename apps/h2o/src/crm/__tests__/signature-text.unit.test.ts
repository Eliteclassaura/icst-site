import { describe, expect, it } from 'vitest'
import { addressPhoneWarnings, sanitizeSignature } from '../signatureText'

describe('SIGNATURES-1 signatureText', () => {
  it('drops tags and control characters, trims lines, keeps the words', () => {
    const r = sanitizeSignature('  <i>Hi</i>\u0007  there \r\n\r\n\r\n  Team  ')
    expect(r).toEqual({ ok: true, value: { text: 'Hi there\n\nTeam', warnings: [] } })
  })
  it('empty and missing become empty text', () => {
    expect(sanitizeSignature(undefined)).toMatchObject({ ok: true, value: { text: '' } })
    expect(sanitizeSignature('   ')).toMatchObject({ ok: true, value: { text: '' } })
  })
  it('limits lines and line length', () => {
    expect(sanitizeSignature('a\nb\nc\nd\ne\nf\ng').ok).toBe(false)
    expect(sanitizeSignature('x'.repeat(121)).ok).toBe(false)
    expect(sanitizeSignature(5).ok).toBe(false)
  })
  it('advisory for phone and address, none for the default text', () => {
    expect(addressPhoneWarnings('Call +66 2 661 7723')).toHaveLength(1)
    expect(addressPhoneWarnings('12 Main Street')).toHaveLength(1)
    expect(addressPhoneWarnings('P.O. Box 5')).toHaveLength(1)
    expect(addressPhoneWarnings('ICS Sales Team\nIndustrial Cooling Solutions')).toEqual([])
  })
})
