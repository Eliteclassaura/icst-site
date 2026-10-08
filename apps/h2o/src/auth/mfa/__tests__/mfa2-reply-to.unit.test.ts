import { describe, expect, it } from 'vitest'
import { DEFAULT_SALES_ADDRESS } from '../../../email/config'

describe('MFA-2 sign-in code email Reply-To', () => {
  it('the default public sales address is sales@h2ocooling.com (owner ruling 2026-10-08; never .org)', () => {
    expect(DEFAULT_SALES_ADDRESS).toBe('sales@h2ocooling.com')
    expect(DEFAULT_SALES_ADDRESS.endsWith('.org')).toBe(false)
  })
})
