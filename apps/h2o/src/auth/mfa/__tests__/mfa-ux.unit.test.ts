import { describe, expect, it } from 'vitest'
import { attemptsLeft, groupKey, lockMessage, recoveryCodesFilename, recoveryCodesText, recoveryLowWarning, wrongCodeMessage } from '../ux'

/** MFA-UX-1: the two-factor page words and the recovery-code file. Synthetic values only. */
describe('MFA-UX-1 messages', () => {
  it('tries left: counts down to 0 and never below', () => {
    expect(attemptsLeft(0, 5)).toBe(5)
    expect(attemptsLeft(4, 5)).toBe(1)
    expect(attemptsLeft(5, 5)).toBe(0)
    expect(attemptsLeft(9, 5)).toBe(0)
  })

  it('a wrong code says what to do; the tries left appear only when 3 or fewer remain', () => {
    expect(wrongCodeMessage('MISMATCH', 4, 15)).toBe('That code is not right. Check the time on your phone and try again.')
    expect(wrongCodeMessage('MISMATCH', 3, 15)).toBe('That code is not right. Check the time on your phone and try again. 3 tries left before a 15-minute pause.')
    expect(wrongCodeMessage('MISMATCH', 2, 15)).toMatch(/ 2 tries left before a 15-minute pause\.$/)
    expect(wrongCodeMessage('MISMATCH', 1, 15)).toMatch(/ 1 try left before a 15-minute pause\.$/)
    expect(wrongCodeMessage('REPLAY', 4, 15)).toBe('That code was already used. Wait for the next one.')
    expect(wrongCodeMessage('FORMAT', 4, 15)).toBe('Enter the 6-digit code from your authenticator app.')
  })

  it('the lock says how long, in whole minutes rounded up (at least 1)', () => {
    expect(lockMessage(900)).toBe('Too many wrong codes. Try again in 15 minutes.')
    expect(lockMessage(841)).toBe('Too many wrong codes. Try again in 15 minutes.')
    expect(lockMessage(840)).toBe('Too many wrong codes. Try again in 14 minutes.')
    expect(lockMessage(60)).toBe('Too many wrong codes. Try again in 1 minute.')
    expect(lockMessage(61)).toBe('Too many wrong codes. Try again in 2 minutes.')
    expect(lockMessage(1)).toBe('Too many wrong codes. Try again in 1 minute.')
    expect(lockMessage(0)).toBe('Too many wrong codes. Try again in 1 minute.')
  })

  it('the setup key shows in groups of four', () => {
    expect(groupKey('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP')
    expect(groupKey('ABCDEFGHIJ')).toBe('ABCD EFGH IJ')
    expect(groupKey('')).toBe('')
  })

  it('a low recovery-code count warns; plenty says nothing', () => {
    expect(recoveryLowWarning(9)).toBeNull()
    expect(recoveryLowWarning(4)).toBeNull()
    expect(recoveryLowWarning(3)).toMatch(/^Only 3 recovery codes are left\./)
    expect(recoveryLowWarning(1)).toMatch(/^Only 1 recovery code is left\./)
    expect(recoveryLowWarning(0)).toMatch(/^That was your last recovery code\./)
  })
})

describe('MFA-UX-1 recovery-code file', () => {
  const at = new Date('2026-10-07T09:05:30Z')
  const codes = ['abcde-fghij', 'klmno-pqrst']
  it('names the file by UTC day', () => {
    expect(recoveryCodesFilename(at)).toBe('h2o-crm-recovery-codes-2026-10-07.txt')
  })
  it('holds the account, the time, the instructions and every code on its own CRLF line', () => {
    const text = recoveryCodesText(codes, 'owner.synthetic@example.test', at)
    const lines = text.split('\r\n')
    expect(lines[0]).toBe('H2O CRM two-factor recovery codes')
    expect(lines).toContain('Account: owner.synthetic@example.test')
    expect(lines).toContain('Created: 2026-10-07 09:05 UTC')
    expect(lines).toContain('abcde-fghij')
    expect(lines).toContain('klmno-pqrst')
    expect(lines.indexOf('abcde-fghij')).toBe(lines.indexOf('klmno-pqrst') - 1)
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text).not.toMatch(/[^\r]\n/)
    expect(text).toMatch(/works once/)
  })
})
