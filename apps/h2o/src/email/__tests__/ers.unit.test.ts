import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { definitionHash, parseSteps } from '../../crm/ers/admin'
import { afterBusinessDays, businessDaysBetween, inWindow, nextWindowOpen } from '../../crm/ers/calendar'
import { floorExit, joinItems } from '../../crm/ers/engine'
import { capForDay, ERS_DEFAULTS, hourlyCap, settingsFrom } from '../../crm/ers/settings'
import { unsubscribeToken, verifyUnsubscribeToken } from '../../crm/ers/unsubscribe'
import { LINTER_SHA256, lintCopy, ruleCount } from '../copy-lint'
import { isHardBounce, parseDeliveryStatus } from '../dsn'
import { isAddressBounce } from '../ers-admission'
import { renderTemplate, SEED_TEMPLATES } from '../templates'

/**
 * Revenue Engine slice 1 — unit tests: the frozen linter (byte identity, counts, the seed copy), DSN parsing, the
 * business calendar, caps and warm-up, step parsing, unsubscribe tokens, bounce classification, the definition hash.
 */
const E11 = SEED_TEMPLATES.filter((t) => t.code.startsWith('E11_'))
// Owner rule 2026-10-06: the team signature only, no phone number, no postal address.
const SIGNATURE = 'ICS Sales Team\nsales@h2ocooling.com'
const values = { first_name: 'Avery', rfq_reference: 'RFQ-20261005-SYN00001', missing_information_list: joinItems(['the current design specification', 'the requested project schedule']), sequence_signature: SIGNATURE }

describe('copy-risk linter (ICS_COPY_RISK_LINTER_V2, frozen)', () => {
  it('is byte-identical to the accepted package and loads all 313 rules', () => {
    const file = readFileSync(path.join(__dirname, '..', 'data', 'ICS_COPY_RISK_LINTER_V2.json'))
    expect(createHash('sha256').update(file).digest('hex')).toBe(LINTER_SHA256)
    expect(ruleCount()).toBe(313)
  })
  it('the E1.1 copy passes at the template stage and, rendered with the owner signature, holds nothing', () => {
    expect(E11.map((t) => t.code)).toEqual(['E11_QUAL_1', 'E11_QUAL_2', 'E11_MISS_1', 'E11_MISS_2'])
    for (const t of E11) {
      expect(lintCopy(t.subject, t.body, 'TEMPLATE').decision, t.code).toBe('PASS')
      const r = renderTemplate(t, values)
      expect(r.ok, t.code).toBe(true)
      if (!r.ok) continue
      const final = lintCopy(r.subject, r.text, 'FINAL')
      expect(final.decision, t.code).toBe('PASS')
      expect(final.hits.filter((h) => h.severity === 'BLOCK' || h.severity === 'REVIEW')).toEqual([])
      expect(final.not_evaluated).toBe(62)
      // Owner decision 2026-10-05: the team signs, never a person; the copy is otherwise E1.1 R2 verbatim.
      expect(r.text).toContain(SIGNATURE)
      expect(r.text).not.toMatch(/Rhonda/)
      expect(r.text.split('\n').filter((l) => /^\+?[\d ()-]{7,}$/.test(l.trim()))).toEqual([]) // no phone line
    }
  })
  it('holds on BLOCK and REVIEW (ruling 6); word boundaries; subject-only thread rules; unresolved placeholders', () => {
    expect(lintCopy('Hello', 'We offer guaranteed performance on every tower.', 'FINAL')).toMatchObject({ decision: 'HOLD' })
    expect(lintCopy('Re: your RFQ', 'Hello', 'FINAL').hits.map((h) => h.rule_id)).toContain('ICS_V2_0001')
    expect(lintCopy('Hello', 're: in the body is fine', 'FINAL').hits.map((h) => h.rule_id)).not.toContain('ICS_V2_0001')
    const review = lintCopy('Hello', 'You must respond by Friday.', 'FINAL')
    expect(review.hits.find((h) => h.rule_id === 'ICS_V2_0041')?.severity).toBe('REVIEW')
    expect(review.decision).toBe('HOLD')
    expect(lintCopy('Hello', 'Thanks for the rebid.', 'FINAL').hits.map((h) => h.rule_id).filter((id) => lintCopy('x', 'bid', 'FINAL').hits.some((h) => h.rule_id === id))).toEqual([])
    expect(lintCopy('Hello', 'Hi {{first_name}}', 'TEMPLATE').decision).toBe('PASS')
    expect(lintCopy('Hello', 'Hi {{first_name}}', 'FINAL')).toMatchObject({ decision: 'HOLD', hits: [expect.objectContaining({ rule_id: 'ICS_V2_0187', severity: 'BLOCK' })] })
  })
})

describe('RFC 3464 delivery status', () => {
  const dsn = ['Reporting-MTA: dns; mx.example.test', '', 'Final-Recipient: rfc822; gone@example.test', 'Action: failed', 'Status: 5.1.1', '', 'Final-Recipient: rfc822;policy@example.test', 'Action: failed', 'Status: 5.7.1 (blocked)', '', 'Final-Recipient: rfc822; slow@example.test', 'Action: delayed', 'Status: 4.4.1'].join('\r\n')
  it('parses per-recipient blocks; only failed 5.x.x (not 5.7.x) is a hard bounce', () => {
    const r = parseDeliveryStatus(dsn)
    expect(r.map((x) => [x.recipient, x.action, x.status])).toEqual([
      ['gone@example.test', 'failed', '5.1.1'],
      ['policy@example.test', 'failed', '5.7.1'],
      ['slow@example.test', 'delayed', '4.4.1'],
    ])
    expect(r.filter(isHardBounce).map((x) => x.recipient)).toEqual(['gone@example.test'])
  })
  it('a send-time refusal is an address bounce only for 551 or a 5.1.x refusal at RCPT (SEND-FIX-1a R4-03)', () => {
    expect(isAddressBounce({ responseCode: 550, response: '550 5.1.1 The email account does not exist' })).toBe(true)
    expect(isAddressBounce({ responseCode: 550, response: '550 5.7.1 Message rejected by policy' })).toBe(false)
    expect(isAddressBounce({ responseCode: 553 })).toBe(false) // R4-03: a bare 553 is no longer enough
    expect(isAddressBounce({ responseCode: 553, response: '553 5.1.3 Bad recipient address syntax' })).toBe(true)
    expect(isAddressBounce({ responseCode: 551 })).toBe(true)
    expect(isAddressBounce({ responseCode: 421 })).toBe(false)
  })
})

describe('business calendar (office zone, holidays)', () => {
  const cal = { zone: 'America/Denver', holidays: new Set(['2026-10-16']) }
  it('WAIT N business days lands on the window opening of the Nth business day, skipping weekends and holidays', () => {
    // Wed 2026-10-14 10:00 MDT; Fri 10-16 is a holiday → +1 = Thu 15th, +2 = Mon 19th, +3 = Tue 20th.
    const wed = new Date('2026-10-14T16:00:00Z')
    expect(afterBusinessDays(wed, 1, cal, 9).toISOString()).toBe('2026-10-15T15:00:00.000Z')
    expect(afterBusinessDays(wed, 2, cal, 9).toISOString()).toBe('2026-10-19T15:00:00.000Z')
    expect(afterBusinessDays(wed, 3, cal, 9).toISOString()).toBe('2026-10-20T15:00:00.000Z')
    // Across the November DST change: 09:00 MST is 16:00Z.
    expect(afterBusinessDays(new Date('2026-10-30T16:00:00Z'), 1, cal, 9).toISOString()).toBe('2026-11-02T16:00:00.000Z')
  })
  it('window: Mon–Fri 09–17 local; the next opening; business days elapsed', () => {
    expect(inWindow(new Date('2026-10-14T16:00:00Z'), cal, 9, 17)).toBe(true) // 10:00
    expect(inWindow(new Date('2026-10-14T23:30:00Z'), cal, 9, 17)).toBe(false) // 17:30
    expect(inWindow(new Date('2026-10-16T16:00:00Z'), cal, 9, 17)).toBe(false) // holiday
    expect(nextWindowOpen(new Date('2026-10-14T23:30:00Z'), cal, 9, 17).toISOString()).toBe('2026-10-15T15:00:00.000Z')
    expect(nextWindowOpen(new Date('2026-10-15T12:00:00Z'), cal, 9, 17).toISOString()).toBe('2026-10-15T15:00:00.000Z') // 06:00 → 09:00
    expect(businessDaysBetween(new Date('2026-10-12T16:00:00Z'), new Date('2026-10-20T16:00:00Z'), cal)).toBe(5) // Mon..Mon, minus Fri holiday
  })
})

describe('caps and warm-up (CT ruling 7)', () => {
  it('defaults: 55/day, hourly ceil(55/8)=7, per domain 5/day 2/hour; warm-up 10→55 every 5 business days', () => {
    expect([ERS_DEFAULTS.dailyCap, hourlyCap(55, ERS_DEFAULTS), ERS_DEFAULTS.domainDailyCap, ERS_DEFAULTS.domainHourlyCap]).toEqual([55, 7, 5, 2])
    const steps = [0, 4, 5, 9, 10, 15, 20, 25, 100].map((d) => capForDay(ERS_DEFAULTS, true, d))
    expect(steps).toEqual([10, 10, 20, 20, 30, 40, 50, 55, 55])
    expect(capForDay(ERS_DEFAULTS, false, 0)).toBe(55)
    expect(capForDay(ERS_DEFAULTS, true, null)).toBe(10)
  })
  it('settings from the global: empty values take the ruled defaults; the floor has no toggle', () => {
    const s = settingsFrom({ daily_cap: 40, compliance: { warmup: false } })
    expect([s.dailyCap, s.compliance.warmup, s.signature.signer, s.signature.email]).toEqual([40, false, 'ICS Sales Team', 'sales@h2ocooling.com'])
    // Owner rule 2026-10-06: no postal-address footer toggle, and the signature has no phone option.
    expect(Object.keys(s.compliance).sort()).toEqual(['business_hours', 'warmup'])
    expect(Object.keys(s.signature).sort()).toEqual(['email', 'signer'])
    const stored = settingsFrom({ compliance: { address_footer: true }, postal_address: '100 Synthetic Way', signature: { include_office_phone: true } })
    expect(JSON.stringify(stored)).not.toMatch(/Synthetic Way|address_footer|include_office_phone|postal/i)
  })
})

describe('enrollment and sequence helpers', () => {
  it('suppression reasons map to exits', () => {
    expect([floorExit(['UNSUBSCRIBED']), floorExit(['HARD_BOUNCE']), floorExit(['COMPLAINT']), floorExit(['DO_NOT_CONTACT']), floorExit([])]).toEqual(['UNSUBSCRIBED', 'BOUNCED', 'COMPLAINT', 'SUPPRESSED', null])
  })
  it('missing items read as a sentence', () => {
    expect([joinItems([]), joinItems(['a']), joinItems(['a', 'b']), joinItems(['a', 'b', 'c'])]).toEqual(['', 'a', 'a and b', 'a, b and c'])
  })
  it('draft steps: WAIT / EMAIL / TASK lines, with clear errors', () => {
    const ok = parseSteps('WAIT 1\nEMAIL E11_QUAL_1\n\nTASK 2 Call the customer')
    expect(ok).toMatchObject({ ok: true, steps: [{ type: 'WAIT', business_days: 1 }, { type: 'EMAIL', templateCode: 'E11_QUAL_1' }, { type: 'TASK', task_due_days: 2, task_title: 'Call the customer' }] })
    expect(parseSteps('SEND now')).toMatchObject({ ok: false })
    expect(parseSteps('WAIT 90')).toMatchObject({ ok: false })
  })
  it('the definition hash changes with any step, template approval hash, purpose or toggle', () => {
    const seq = { message_purpose: 'ACCOUNT_RELATIONSHIP', language: 'EN', compliance: {} }
    const steps = [{ step_key: 'A', type: 'EMAIL' as const, template: 't1', template_hash: 'h1' }]
    const h = definitionHash(seq, steps)
    expect(definitionHash(seq, [{ ...steps[0]!, template_hash: 'h2' }])).not.toBe(h)
    expect(definitionHash({ ...seq, compliance: { warmup: 'OFF' } }, steps)).not.toBe(h)
    expect(definitionHash({ ...seq }, steps)).toBe(h)
  })
  it('unsubscribe tokens: unforgeable, no address in them', () => {
    const prev = process.env.PAYLOAD_SECRET
    process.env.PAYLOAD_SECRET = 'unit-test-secret-000000000000000000000000'
    try {
      const id = '0190a5b2-1111-7222-8333-444455556666'
      const t = unsubscribeToken(id)
      expect(verifyUnsubscribeToken(t)).toBe(id)
      expect(verifyUnsubscribeToken(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'))).toBeNull()
      expect(verifyUnsubscribeToken(`0190a5b2-1111-7222-8333-444455556667.${t.split('.')[1]}`)).toBeNull()
      expect(t).not.toMatch(/@/)
    } finally {
      process.env.PAYLOAD_SECRET = prev
    }
  })
})
