import { describe, expect, it } from 'vitest'
import { checkProfileShape, customHostPatterns, hostAllowed } from '../profiles'

/** CRM-C-S1-2: a sending profile's host is default-deny. Pure rules; the DB behaviour is in c-s1-2.dbtest.ts. */
const OK = { name: 'Workspace', preset: 'GMAIL', use: 'TRANSACTIONAL', host: 'smtp.gmail.com', port: 587, tls_servername: 'smtp.gmail.com', username: 'syed@h2ocooling.com', from_address: 'syed@h2ocooling.com', from_name: 'ICS Sales Team' }

describe('CRM-C-S1-2 host allowlist', () => {
  it('default deny: only the Google Workspace host passes with nothing configured', () => {
    expect(hostAllowed('smtp.gmail.com', {})).toBe(true)
    expect(hostAllowed('SMTP.GMAIL.COM.', {})).toBe(true)
    for (const h of ['mail.attacker.example', 'smtp.gmail.com.attacker.example', 'evilsmtp.gmail.com', 'gmail.com', '']) expect(hostAllowed(h, {}), h).toBe(false)
  })

  it('exact names and *.suffix patterns, case-insensitive; a bare suffix does not match its pattern', () => {
    const env = { H2O_SMTP_CUSTOM_HOSTS: ' mail.partner.example , *.relay.example ' }
    expect(customHostPatterns(env)).toEqual(['mail.partner.example', '*.relay.example'])
    expect(hostAllowed('mail.partner.example', env)).toBe(true)
    expect(hostAllowed('MAIL.Partner.example', env)).toBe(true)
    expect(hostAllowed('x.mail.partner.example', env)).toBe(false)
    expect(hostAllowed('a.relay.example', env)).toBe(true)
    expect(hostAllowed('a.b.relay.example', env)).toBe(true)
    expect(hostAllowed('relay.example', env)).toBe(false)
    expect(hostAllowed('notrelay.example', env)).toBe(false)
  })

  it('an operator-listed internal host (the future Stalwart) is already operator-approved', () => {
    expect(hostAllowed('stalwart', { H2O_SMTP_INTERNAL_HOSTS: 'stalwart' })).toBe(true)
    expect(hostAllowed('stalwart', {})).toBe(false)
  })

  it('the rule is on the host, not the preset label, and the message tells the admin what to do', () => {
    const p = checkProfileShape({ ...OK, preset: 'STALWART', host: 'mail.attacker.example', tls_servername: 'mail.attacker.example' }, {})
    expect(p).toMatchObject({ code: 'PROFILE_HOST_NOT_ALLOWED' })
    expect(p?.message).toContain('Ask the server operator to allow this host.')
    expect(checkProfileShape({ ...OK, preset: 'CUSTOM', host: 'mail.attacker.example', tls_servername: 'mail.attacker.example' }, {})?.code).toBe('PROFILE_HOST_NOT_ALLOWED')
    expect(checkProfileShape({ ...OK, preset: 'CUSTOM', host: 'mail.partner.example', tls_servername: 'mail.partner.example' }, { H2O_SMTP_CUSTOM_HOSTS: 'mail.partner.example' })).toBeNull()
  })

  it('the Gmail/Workspace preset is unaffected', () => {
    expect(checkProfileShape(OK, {})).toBeNull()
  })
})
