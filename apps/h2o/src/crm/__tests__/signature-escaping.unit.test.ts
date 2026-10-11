import { describe, expect, it } from 'vitest'
import { renderTemplate } from '../../email/templates'
import { textToHtml } from '../../email/messages'
import { replyHtml } from '../reply'
import { sanitizeSignature } from '../signatureText'

/**
 * SIGNATURES-1 (Security Auditor note): a lone "<" or "&" in a signature is kept as typed in the TEXT part and is ESCAPED in
 * the HTML part, on every send path (manual reply: replyHtml; sequence and acknowledgement: textToHtml).
 */
const TYPED = 'R&D Team <Ops & Sales\nIndustrial Cooling Solutions'
const ESCAPED = 'R&amp;D Team &lt;Ops &amp; Sales<br>Industrial Cooling Solutions'

describe('SIGNATURES-1 signature characters in the HTML part', () => {
  it('the sanitiser keeps a lone < and & as typed (it drops only complete tags)', () => {
    const r = sanitizeSignature(TYPED)
    expect(r).toMatchObject({ ok: true, value: { text: TYPED } })
    expect(sanitizeSignature('<b>R&D</b> Team')).toMatchObject({ ok: true, value: { text: 'R&D Team' } })
  })

  it('a merged template keeps them as text in the text part', () => {
    const out = renderTemplate({ subject: 'Hello', body: 'Hi,\n\nThanks.\n\n{{email_signature}}', purpose: 'TRANSACTIONAL' }, { email_signature: TYPED })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.text).toContain('R&D Team <Ops & Sales')
  })

  it('manual reply HTML escapes them, and the only angle brackets left are our own tags', () => {
    const html = replyHtml(`Thanks.\n\n${TYPED}`)
    expect(html).toContain(ESCAPED)
    expect(html).not.toContain('R&D')
    expect(html).not.toContain('<Ops')
    const body = html.slice(html.indexOf('<body'))
    expect([...body.matchAll(/<(?!\/?(?:p|br|body|html)\b)[^>]*>/g)]).toEqual([])
  })

  it('sequence and acknowledgement HTML (textToHtml) escape them too', () => {
    const html = textToHtml(`Thanks.\n\n${TYPED}\n\nunsubscribe here: https://example.test/u`)
    expect(html).toContain(ESCAPED)
    expect(html).not.toContain('R&D')
    expect(html).not.toContain('<Ops')
  })
})
