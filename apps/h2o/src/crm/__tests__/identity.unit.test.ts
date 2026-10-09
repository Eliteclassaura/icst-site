import { describe, expect, it } from 'vitest'
import { coalesceKey, identityBase, purposeNeedsRfq, rfqIdentity, slotIdentity } from '../ers/identity'

/** ENGINE-SCOPE-1b: purpose, scope and cycle are separate parts of an enrollment's identity. */
describe('enrollment identity', () => {
  it('an inquiry anchors a response and a quote follow-up only', () => {
    expect(purposeNeedsRfq('RFQ_RESPONSE')).toBe(true)
    expect(purposeNeedsRfq('QUOTE_FOLLOWUP')).toBe(true)
    for (const p of ['RELATIONSHIP', 'COHORT', 'PUBLICATION']) expect(purposeNeedsRfq(p), p).toBe(false)
  })

  it('the key is sequence : contact : purpose : scope kind : scope ref : cycle; the base leaves the cycle out', () => {
    const i = rfqIdentity('seq1', 'c1', 'rfq1')
    expect(identityBase(i)).toBe('seq1:c1:RFQ_RESPONSE:RFQ:rfq1')
    expect(coalesceKey(i, 1)).toBe('seq1:c1:RFQ_RESPONSE:RFQ:rfq1:1')
    expect(coalesceKey(i, 2)).toBe('seq1:c1:RFQ_RESPONSE:RFQ:rfq1:2')
  })

  it('the same contact and sequence with another inquiry is another identity; another purpose too', () => {
    expect(identityBase(rfqIdentity('s', 'c', 'r1'))).not.toBe(identityBase(rfqIdentity('s', 'c', 'r2')))
    expect(identityBase({ ...rfqIdentity('s', 'c', 'r1'), purpose: 'QUOTE_FOLLOWUP' })).not.toBe(identityBase(rfqIdentity('s', 'c', 'r1')))
  })

  it('a publication slot is program : slot : publication, so each month is its own identity', () => {
    const a = slotIdentity('s', 'c', 'E2', 3, 'pub-2026-10')
    expect(a.scopeRef).toBe('E2:3:pub-2026-10')
    expect(identityBase(a)).not.toBe(identityBase(slotIdentity('s', 'c', 'E2', 4, 'pub-2026-11')))
  })
})
