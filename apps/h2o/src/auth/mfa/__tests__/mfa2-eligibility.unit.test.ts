import { ADMINS } from '@factory/agency-core/cms/kernel'
import { describe, expect, it } from 'vitest'
import { ADMIN_ROLES, emailCodeEligible, isAdminUser } from '../eligibility'

describe('MFA-2 eligibility (admins are TOTP-only, hard-coded)', () => {
  it('refuses both admin roles, however they are cased or combined', () => {
    for (const r of ADMIN_ROLES) expect(emailCodeEligible({ role: r })).toBe(false)
    expect(emailCodeEligible({ role: 'Platform-Admin' })).toBe(false)
    expect(emailCodeEligible({ roles: ['sales', 'client-admin'] })).toBe(false)
    expect(isAdminUser({ roles: ['sales', 'platform-admin'] })).toBe(true)
  })
  it('fails closed on missing or unknown roles', () => {
    expect(emailCodeEligible(null)).toBe(false)
    expect(emailCodeEligible({})).toBe(false)
    expect(emailCodeEligible({ roles: [] })).toBe(false)
  })
  it('allows listed non-admin roles', () => {
    for (const r of ['sales', 'editor', 'search-analyst', 'viewer']) expect(emailCodeEligible({ roles: [r] })).toBe(true)
    expect(emailCodeEligible({ roles: ['sales', 'viewer'] })).toBe(true)
  })
  it('ignores any user-level setting that tries to opt an admin in', () => {
    expect(emailCodeEligible({ role: 'platform-admin', mfa_email_enabled: true } as never)).toBe(false)
  })
  it('matches agency-core ADMINS', () => {
    expect([...ADMIN_ROLES].sort()).toEqual([...ADMINS].sort())
  })
})
