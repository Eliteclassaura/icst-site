import { describe, expect, it } from 'vitest'
import { tokensIn } from '../../crm/inbound'
import { replyToAddress } from '../../crm/reply'
import { DEFAULT_SENDER_NAME, readEmailConfig, REPLY_TAG_RE } from '../config'
import type { JmapEmail } from '../jmap'

/**
 * T-R3 (CT, 2026-10-06): an optional fixed Reply-To tag (H2O_REPLY_TAG) so one mail filter catches every CRM reply
 * (CT verified Gmail `to:(<role>+<tag>)` matches `<role>+<tag>.<token>@…`), old untagged tokens keep linking, and the
 * default sender name is "ICST Sales Team". Synthetic addresses only.
 */
const TOKEN = 'abcdefghijklmnopqrstuvwxyz'.slice(0, 26).replace(/[01890]/g, 'a')
const ctx = { roleLocal: 'rfq', domain: 'example.test' }
const mail = (...to: string[]) => ({ id: 'x', to: to.map((email) => ({ email })) }) as unknown as JmapEmail

describe('T-R3: reply tag', () => {
  it('Reply-To: untagged by default; `<role>+<tag>.<token>` with a valid tag; an invalid tag is never used', () => {
    expect(replyToAddress('rfq@example.test', TOKEN)).toBe(`rfq+${TOKEN}@example.test`)
    expect(replyToAddress('rfq@example.test', TOKEN, null)).toBe(`rfq+${TOKEN}@example.test`)
    expect(replyToAddress('rfq@example.test', TOKEN, 'h2ocrm')).toBe(`rfq+h2ocrm.${TOKEN}@example.test`)
    expect(replyToAddress('rfq+desk@example.test', TOKEN, 'h2ocrm')).toBe(`rfq+h2ocrm.${TOKEN}@example.test`)
    for (const bad of ['H2O', 'ab', 'h2o.crm', 'a'.repeat(17), 'h2o crm']) expect(replyToAddress('rfq@example.test', TOKEN, bad), bad).toBe(`rfq+${TOKEN}@example.test`)
  })
  it('inbound accepts the tagged and the untagged form (and any valid tag), for our role and domain only', () => {
    expect(tokensIn(mail(`rfq+h2ocrm.${TOKEN}@example.test`), ctx)).toEqual([TOKEN])
    expect(tokensIn(mail(`RFQ+H2OCRM.${TOKEN.toUpperCase()}@Example.TEST`), ctx)).toEqual([TOKEN])
    expect(tokensIn(mail(`rfq+${TOKEN}@example.test`), ctx)).toEqual([TOKEN])
    expect(tokensIn(mail(`rfq+oldtag.${TOKEN}@example.test`), ctx)).toEqual([TOKEN])
    expect(tokensIn(mail(`rfq+h2ocrm.${TOKEN}@example.test`, `rfq+${TOKEN}@example.test`), ctx)).toEqual([TOKEN]) // one token, once
    expect(tokensIn(mail(`sales+h2ocrm.${TOKEN}@example.test`), ctx)).toEqual([])
    expect(tokensIn(mail(`rfq+h2ocrm.${TOKEN}@example.com`), ctx)).toEqual([])
    // A malformed tagged token is passed through unchanged, so it is UNKNOWN_TOKEN (never linked).
    expect(tokensIn(mail(`rfq+h2ocrm.${TOKEN}x@example.test`), ctx)).toEqual([`h2ocrm.${TOKEN}x`])
  })
  it('H2O_REPLY_TAG: optional; [a-z0-9]{3,16}; invalid is a configuration error and mail is off', () => {
    const base = { H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: 'a@example.test', H2O_EMAIL_FROM: 'ICST Sales Team <rfq@example.test>' }
    expect(readEmailConfig(base).replyTag).toBeNull()
    expect(readEmailConfig({ ...base, H2O_REPLY_TAG: ' h2ocrm ' })).toMatchObject({ replyTag: 'h2ocrm', errors: [] })
    for (const bad of ['H2O', 'ab', 'h2o.crm', 'a'.repeat(17), 'h2o crm']) {
      const c = readEmailConfig({ ...base, H2O_REPLY_TAG: bad })
      expect(c.errors, bad).toContain('REPLY_TAG_INVALID')
      expect(c.mode, bad).toBe('off')
      expect(REPLY_TAG_RE.test(bad), bad).toBe(false)
    }
  })
  it('the default sender name is "ICST Sales Team" (owner, 2026-10-06); a configured name still wins', () => {
    expect(DEFAULT_SENDER_NAME).toBe('ICST Sales Team')
    expect(readEmailConfig({ H2O_EMAIL_FROM: 'rfq@example.test' }).fromName).toBe('ICST Sales Team')
    expect(readEmailConfig({ H2O_EMAIL_FROM: 'Someone Else <rfq@example.test>' }).fromName).toBe('Someone Else')
  })
})
