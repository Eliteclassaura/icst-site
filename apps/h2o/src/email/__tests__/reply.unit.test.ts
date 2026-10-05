import { describe, expect, it } from 'vitest'
import { REPLY_TOKEN_RE, newReplyToken, replyHtml, replyToAddress, validateReply } from '../../crm/reply'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz'

describe('M2 reply tokens and addresses', () => {
  it('tokens are 26 base32 characters, distinct', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const t = newReplyToken()
      expect(t).toMatch(REPLY_TOKEN_RE)
      seen.add(t)
    }
    expect(seen.size).toBe(2000)
  })
  it('the Reply-To is the role address with the token as sub-address', () => {
    expect(replyToAddress('rfq@example.test', TOKEN)).toBe(`rfq+${TOKEN}@example.test`)
    expect(replyToAddress('rfq+old@example.test', TOKEN)).toBe(`rfq+${TOKEN}@example.test`)
    expect(replyToAddress('rfq@example.test', 'bad token')).toBeNull()
    expect(replyToAddress('not-an-address', TOKEN)).toBeNull()
  })
  it('the HTML part is generated from the text and escaped (a person never writes HTML)', () => {
    expect(replyHtml('Hi <b>there</b>\n\nLine 1\nLine 2')).toContain(
      '<p>Hi &lt;b&gt;there&lt;/b&gt;</p><p>Line 1<br>Line 2</p>',
    )
  })
  it('validation: attachments refused first; subject one line; bounded body', () => {
    const base = {
      rfqId: '0192f5e0-0000-7000-8000-000000000001',
      token: '0192f5e0-0000-7000-8000-000000000002',
      subject: 's',
      body: 'b',
    }
    expect(validateReply({ ...base, attachments: 2 })).toMatchObject({
      ok: false,
      code: 'ATTACHMENTS_NOT_SUPPORTED',
    })
    expect(validateReply({ ...base, subject: 'a\r\nBcc: x@example.test' })).toMatchObject({
      ok: true,
      subject: 'a Bcc: x@example.test',
    })
    expect(validateReply({ ...base, subject: 'x'.repeat(201) })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(validateReply({ ...base, rfqId: 'nope' })).toMatchObject({ ok: false, code: 'INVALID_ID' })
  })
})
