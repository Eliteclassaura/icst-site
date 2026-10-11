import { describe, expect, it } from 'vitest'
import { fromMismatchWarning } from '../profiles'
import { activeSender } from '../settings-page'

/** SENDER-UX-1: the Active sender card's data and the From/login mismatch advice. Pure. */
const gmail = { id: 'p1', name: 'Workspace', preset: 'GMAIL', use: 'TRANSACTIONAL', active: true, host: 'smtp.gmail.com', username: 'syed@h2ocooling.com', from_address: 'syed@h2ocooling.com', from_name: 'ICS Sales Team', last_check_state: 'OK', last_check_at: '2026-10-11T16:05:00.000Z', password_sealed: 'must-never-appear' }

describe('SENDER-UX-1 mismatch warning', () => {
  it('none when the From is the login (any case), advice when they differ, wording for Google', () => {
    expect(fromMismatchWarning('GMAIL', 'Syed@h2ocooling.com', 'syed@h2ocooling.com')).toBeNull()
    expect(fromMismatchWarning('GMAIL', '', 'a@h2ocooling.com')).toBeNull()
    const w = fromMismatchWarning('GMAIL', 'box@h2ocooling.com', 'syed@h2ocooling.com')!
    expect(w).toContain('Google may rewrite the From')
    expect(w).toContain('Send-as alias')
    expect(fromMismatchWarning('CUSTOM', 'box', 'syed@h2ocooling.com')!).toContain('may replace the From')
  })
})

describe('SENDER-UX-1 active sender', () => {
  it('shows who it sends as, how it signs in and the last check; never the password', () => {
    const a = activeSender([gmail], 'TRANSACTIONAL', false)
    expect(a).toMatchObject({ source: 'profile', viaFallback: false, fromName: 'ICS Sales Team', fromAddress: 'syed@h2ocooling.com', host: 'smtp.gmail.com', login: 'syed@h2ocooling.com', check: 'passed', checkedAt: '2026-10-11 16:05 UTC', warning: null })
    expect(JSON.stringify(a)).not.toContain('must-never-appear')
  })
  it('the Revenue Engine uses its own profile, else the inquiry-email one (marked shared), else the server default, else nothing', () => {
    expect(activeSender([gmail], 'REVENUE', false)).toMatchObject({ source: 'profile', viaFallback: true })
    expect(activeSender([gmail, { ...gmail, id: 'p2', use: 'REVENUE', name: 'Own' }], 'REVENUE', false)).toMatchObject({ viaFallback: false, name: 'Own' })
    expect(activeSender([{ ...gmail, active: false }], 'TRANSACTIONAL', true)).toEqual({ source: 'env' })
    expect(activeSender([], 'TRANSACTIONAL', false)).toEqual({ source: 'none' })
  })
  it('a failed or missing check and a mismatch are reported', () => {
    expect(activeSender([{ ...gmail, last_check_state: 'FAILED', last_check_code: 'EAUTH' }], 'TRANSACTIONAL', false)).toMatchObject({ check: 'failed', checkCode: 'EAUTH' })
    expect(activeSender([{ ...gmail, last_check_state: null, last_check_at: null }], 'TRANSACTIONAL', false)).toMatchObject({ check: 'unchecked', checkedAt: '' })
    expect(activeSender([{ ...gmail, username: 'box@h2ocooling.com' }], 'TRANSACTIONAL', false)).toMatchObject({ warning: expect.stringContaining('Send-as alias') })
  })
})
