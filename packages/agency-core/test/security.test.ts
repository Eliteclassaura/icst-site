import { describe, expect, it } from 'vitest'
import { securityDefaults } from '../src/cms/security'

const containsFunction = (value: unknown): boolean => {
  if (typeof value === 'function') return true
  if (value === null || typeof value !== 'object') return false
  return Object.values(value).some(containsFunction)
}

describe('securityDefaults', () => {
  it('keeps the rate-limit configuration serializable for Payload admin client config', () => {
    const defaults = securityDefaults({ serverURL: 'https://staging.example' })

    expect(defaults.rateLimit).not.toHaveProperty('skip')
    expect(containsFunction(defaults)).toBe(false)
  })
})
