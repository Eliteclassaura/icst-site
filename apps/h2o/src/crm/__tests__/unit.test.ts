import { describe, expect, it } from 'vitest'
import { isUuidV7, rfqNumberFor, RFQ_NUMBER_PATTERN, uuidv7, uuidv7Timestamp } from '../ids'
import { emailKey, isConsumerDomain, nameKey, normalizeDomain, normalizeWebDomain } from '../normalize'
import {
  amountDisplay,
  confirmedRevenueByCurrency,
  economicsProblems,
  pipelineByCurrency,
  revenueTruthFor,
} from '../economics'
import { activeFromLedger, clearRule, evaluateSend, type LedgerRow } from '../suppression'
import { signTypeformBody, verifyTypeformSignature } from '../intake/typeform/verify'
import { intakeConfigFromEnv, parseFieldMap } from '../intake/typeform/config'
import { parseTypeformDelivery, validateContext } from '../intake/typeform/parse'
import { MOTION_DETAIL_TO_MOTION, OPPORTUNITY_MOTION } from '../vocabulary'
import { typeformDelivery, SYNTHETIC_FIELD_MAP, SYNTHETIC_SECRET } from '../fixtures/synthetic'
import { sameValue } from '../guards'

describe('canonical identity', () => {
  it('uuidv7 is RFC 9562 v7, time-ordered and unique', () => {
    const t = Date.UTC(2026, 8, 24)
    const ids = Array.from({ length: 2000 }, () => uuidv7(t))
    expect(ids.every(isUuidV7)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(uuidv7Timestamp(ids[0]!)).toBe(t)
    expect(uuidv7(t + 1) > uuidv7(t)).toBe(true)
  })
  it('rfq_number is derived once, from server values, in a stable format', () => {
    const id = uuidv7(Date.UTC(2026, 8, 24))
    const n = rfqNumberFor(id, new Date('2026-09-24T12:00:00Z'))
    expect(n).toMatch(RFQ_NUMBER_PATTERN)
    expect(n.startsWith('RFQ-20260924-')).toBe(true)
    expect(rfqNumberFor(id, new Date('2026-09-24T12:00:00Z'))).toBe(n) // deterministic for the same inputs
    expect(() => rfqNumberFor('not-a-uuid', new Date())).toThrow()
  })
})

describe('identity normalisation (E0.1: lowercase only, no alias folding)', () => {
  it('keeps dots and +tags; lowercases; IDNA-normalises the domain', () => {
    expect(emailKey('J.Doe+RFQ@Example.COM')!.matchKey).toBe('j.doe+rfq@example.com')
    expect(emailKey('jdoe@example.com')!.matchKey).not.toBe(emailKey('j.doe@example.com')!.matchKey)
    expect(emailKey(' user@Bücher.example ')!.domain).toBe('xn--bcher-kva.example')
  })
  it('rejects non-addresses rather than guessing', () => {
    for (const bad of ['', 'no-at', 'a@b', 'a b@example.com', '<x>@example.com', null, 42])
      expect(emailKey(bad)).toBeNull()
  })
  it('www. is stripped only from web domains, never from mail domains', () => {
    expect(normalizeWebDomain('WWW.Example.com')).toBe('example.com')
    expect(normalizeDomain('www.example.com')).toBe('www.example.com')
  })
  it('consumer mailbox domains are recognised', () => {
    for (const d of ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com'])
      expect(isConsumerDomain(d)).toBe(true)
    expect(isConsumerDomain('northwind.example.com')).toBe(false)
  })
  it('name keys flag, and are diacritic/case-insensitive', () => {
    expect(nameKey('José', 'García')).toBe(nameKey('jose', 'GARCIA'))
    expect(nameKey(null, undefined)).toBeNull()
  })
})

describe('E3 economics — unknown is not zero', () => {
  it('flags every inconsistent combination', () => {
    expect(economicsProblems({ amount: 5, amount_status: 'NOT_ENTERED' })).toContain(
      'AMOUNT_WITHOUT_KNOWN_STATUS',
    )
    expect(economicsProblems({ amount: null, amount_status: 'KNOWN' })).toContain(
      'KNOWN_STATUS_WITHOUT_AMOUNT',
    )
    expect(economicsProblems({ amount: 5, amount_status: 'KNOWN' })).toContain(
      'KNOWN_AMOUNT_WITHOUT_CURRENCY',
    )
    expect(economicsProblems({ amount: 0, amount_status: 'KNOWN', currency: 'USD' })).toContain(
      'ZERO_WITHOUT_EXPLICIT_SOURCE',
    )
    expect(
      economicsProblems({
        amount: 0,
        amount_status: 'KNOWN',
        currency: 'USD',
        source_record_explicit_zero: true,
      }),
    ).toEqual([])
    expect(economicsProblems({ currency: 'usd' })).toContain('CURRENCY_MALFORMED')
    expect(economicsProblems({ probability: 101 })).toContain('PROBABILITY_OUT_OF_RANGE')
    expect(
      economicsProblems({
        revenue_verification_state: 'CONFIRMED',
        stage: 'NEGOTIATION',
        amount_status: 'KNOWN',
        amount: 1,
        currency: 'USD',
      }),
    ).toContain('CONFIRMED_REVENUE_REQUIRES_WON_AND_KNOWN')
  })
  it('revenue truth follows E3 exactly', () => {
    expect(revenueTruthFor({})).toBe('REVENUE_UNKNOWN')
    expect(revenueTruthFor({ amount_status: 'NOT_ENTERED' })).toBe('VALUE_NOT_ENTERED')
    expect(revenueTruthFor({ amount_status: 'KNOWN', amount: 9, currency: 'USD' })).toBe(
      'OPPORTUNITY_VALUE_KNOWN',
    )
    expect(revenueTruthFor({ stage: 'WON', amount_status: 'KNOWN', amount: 9, currency: 'USD' })).toBe(
      'OPPORTUNITY_VALUE_KNOWN',
    )
    expect(
      revenueTruthFor({
        stage: 'WON',
        amount_status: 'KNOWN',
        amount: 9,
        currency: 'USD',
        revenue_verification_state: 'CONFIRMED',
      }),
    ).toBe('WON_REVENUE_CONFIRMED')
    expect(revenueTruthFor({ stage: 'LOST', amount_status: 'KNOWN', amount: 9 })).toBe('LOST_NO_REVENUE')
  })
  it('display never renders unknown as $0 and never invents a currency symbol', () => {
    for (const s of ['UNKNOWN', 'NOT_ENTERED', 'WITHHELD_OR_NOT_AVAILABLE'] as const)
      expect(amountDisplay({ amount_status: s })).not.toMatch(/\$|\b0\b/)
    expect(amountDisplay({ amount_status: 'KNOWN', amount: 1500, currency: 'JPY' })).toBe('JPY 1,500')
    expect(
      amountDisplay({
        amount_status: 'KNOWN',
        amount: 0,
        currency: 'USD',
        source_record_explicit_zero: true,
      }),
    ).toBe('USD 0 (explicit zero)')
  })
  it('pipeline is per currency, unknowns counted not summed; confirmed revenue counts each opportunity once', () => {
    const p = pipelineByCurrency([
      { amount_status: 'KNOWN', amount: 10, currency: 'USD' },
      { amount_status: 'KNOWN', amount: 5, currency: 'EUR' },
      { amount_status: 'NOT_ENTERED' },
      {},
    ])
    expect(p.byCurrency).toEqual({ USD: { total: 10, count: 1 }, EUR: { total: 5, count: 1 } })
    expect(p.unknownValueCount).toBe(2)
    const won = {
      id: 'o1',
      stage: 'WON' as const,
      amount_status: 'KNOWN' as const,
      amount: 100,
      currency: 'USD',
      revenue_verification_state: 'CONFIRMED',
    }
    // Two touches pointing at one opportunity must not double its revenue (E3 multi-touch dedupe).
    expect(
      confirmedRevenueByCurrency([won, won, { ...won, id: 'o2', revenue_verification_state: 'UNVERIFIED' }]),
    ).toEqual({ USD: 100 })
  })
})

describe('suppression evaluation (fail-closed)', () => {
  const row = (
    id: string,
    reason: LedgerRow['reason'],
    scope: LedgerRow['scope'] = 'MARKETING_EMAIL',
    action: LedgerRow['action'] = 'APPLY',
    clears: string | null = null,
  ): LedgerRow => ({ id, reason, scope, action, clears })
  const ok = { marketing_eligibility: 'ELIGIBLE', jurisdiction: 'VERIFIED_US' }
  it('no suppression + eligible + resolved jurisdiction is the only allow', () => {
    expect(evaluateSend([], ok, 'SEQUENCE_OUTREACH')).toEqual({ allowed: true })
    expect(
      evaluateSend([], { marketing_eligibility: 'UNKNOWN', jurisdiction: 'VERIFIED_US' }, 'SEQUENCE_OUTREACH')
        .allowed,
    ).toBe(false)
    expect(
      evaluateSend([], { marketing_eligibility: 'ELIGIBLE', jurisdiction: 'COUNTRY_UNKNOWN' }, 'BROADCAST')
        .allowed,
    ).toBe(false)
    expect(evaluateSend([], {}, 'PERSONAL').allowed).toBe(false)
  })
  it('hard suppressions block every purpose including transactional', () => {
    for (const r of ['DO_NOT_CONTACT', 'LEGAL_PROHIBITION', 'HARD_BOUNCE', 'INVALID_ADDRESS'] as const) {
      const d = evaluateSend([row('1', r)], ok, 'TRANSACTIONAL')
      expect(d.allowed).toBe(false)
      expect((d as { blockedBy: string[] }).blockedBy).toContain(`SUPPRESSED_${r}`)
    }
  })
  it('a CLEAR of a never-clearable reason does not clear it', () => {
    expect(
      activeFromLedger([
        row('1', 'HARD_BOUNCE', 'ALL_EMAIL'),
        row('2', 'HARD_BOUNCE', 'ALL_EMAIL', 'CLEAR', '1'),
      ]),
    ).toHaveLength(1)
    expect(
      activeFromLedger([
        row('1', 'MANUAL_SUPPRESSION'),
        row('2', 'MANUAL_SUPPRESSION', 'MARKETING_EMAIL', 'CLEAR', '1'),
      ]),
    ).toHaveLength(0)
    expect(clearRule('COMPLAINT')).toBe('RECONSENT_REQUIRED')
    expect(clearRule('INVALID_ADDRESS')).toBe('NEVER')
  })
  it('transactional is never allowed by this gate alone (active transaction is a later runtime check)', () => {
    expect(evaluateSend([], ok, 'TRANSACTIONAL').allowed).toBe(false)
  })
})

describe('Typeform signature verification', () => {
  const body = JSON.stringify(typeformDelivery())
  it('accepts the exact signed bytes and nothing else', () => {
    const sig = signTypeformBody(body, SYNTHETIC_SECRET)
    expect(verifyTypeformSignature(body, sig, SYNTHETIC_SECRET)).toEqual({ ok: true })
    expect(verifyTypeformSignature(body + ' ', sig, SYNTHETIC_SECRET).ok).toBe(false)
    expect(verifyTypeformSignature(body, sig, 'test-a-different-secret-0000000000').ok).toBe(false)
    expect(verifyTypeformSignature(body, null, SYNTHETIC_SECRET)).toEqual({
      ok: false,
      reason: 'SIGNATURE_MISSING',
    })
    expect(verifyTypeformSignature(body, 'sha1=abc', SYNTHETIC_SECRET)).toEqual({
      ok: false,
      reason: 'SIGNATURE_MALFORMED',
    })
    expect(verifyTypeformSignature(body, sig, '')).toEqual({ ok: false, reason: 'SECRET_MISSING' })
  })
})

describe('intake configuration fails closed', () => {
  it('requires a secret and a well-formed form id; the flag defaults off', () => {
    expect(intakeConfigFromEnv({})).toEqual({ ok: false, reason: 'SECRET_MISSING' })
    expect(intakeConfigFromEnv({ H2O_CRM_TYPEFORM_WEBHOOK_SECRET: 'short' })).toEqual({
      ok: false,
      reason: 'SECRET_TOO_SHORT',
    })
    expect(intakeConfigFromEnv({ H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET })).toEqual({
      ok: false,
      reason: 'FORM_ID_MISSING',
    })
    expect(
      intakeConfigFromEnv({
        H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
        H2O_TYPEFORM_FORM_ID: 'bad/id',
      }),
    ).toEqual({ ok: false, reason: 'FORM_ID_MALFORMED' })
    const ok = intakeConfigFromEnv({
      H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
      H2O_TYPEFORM_FORM_ID: 'SynthForm01',
    })
    expect(ok.ok && ok.value.enabled).toBe(false)
    expect(ok.ok && ok.value.fieldMap).toBeNull()
  })
  it('refuses a malformed or ambiguous field map instead of guessing', () => {
    expect(parseFieldMap('{')).toBe('MALFORMED')
    expect(parseFieldMap(JSON.stringify({ a: 'email', b: 'email' }))).toBe('MALFORMED')
    expect(parseFieldMap(JSON.stringify({ a: 'salary' }))).toBe('MALFORMED')
    expect(parseFieldMap(JSON.stringify({ a: 'email', b: 'other:plant_name' }))).toEqual({
      a: 'email',
      b: 'other:plant_name',
    })
  })
})

describe('Typeform parsing', () => {
  it('maps answers by ref only; unmapped refs are counted, not used', () => {
    const r = parseTypeformDelivery(
      typeformDelivery({ extraAnswers: [{ type: 'text', text: 'ignored', field: { ref: 'ref_unknown' } }] }),
      { ...SYNTHETIC_FIELD_MAP },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.mapped.email).toBe('avery.synthetic@northwind.example.com')
    expect(r.value.unmappedRefs).toContain('ref_unknown')
    expect(JSON.stringify(r.value.mapped)).not.toContain('ignored')
  })
  it('without a map, nothing is mapped at all', () => {
    const r = parseTypeformDelivery(typeformDelivery(), null)
    expect(
      r.ok && Object.values(r.value.mapped).filter((v) => v !== null && !(typeof v === 'object')).length,
    ).toBe(0)
  })
  it('rejects a malformed envelope with a code', () => {
    expect(parseTypeformDelivery([], null)).toMatchObject({ ok: false, code: 'NOT_JSON_OBJECT' })
    expect(parseTypeformDelivery({ event_type: 'form_response' }, null)).toMatchObject({
      ok: false,
      code: 'EVENT_ID_MISSING',
    })
    expect(
      parseTypeformDelivery(
        { event_id: 'e1', event_type: 'form_response', form_response: { form_id: 'f1' } },
        null,
      ),
    ).toMatchObject({ ok: false, code: 'RESPONSE_TOKEN_MISSING' })
  })
  it('re-validates hidden context server-side', () => {
    const v = validateContext({
      page_path: '//evil.example',
      product_path: '/a/../b',
      cta_placement: 'ok',
      stolen: 'x',
      product_title: '<script>',
    })
    expect(v.context).toEqual({ cta_placement: 'ok' })
    expect(v.rejected.sort()).toEqual(
      ['page_path:INVALID', 'product_path:INVALID', 'product_title:INVALID', 'stolen:NOT_ALLOWLISTED'].sort(),
    )
  })
})

describe('vocabulary integrity', () => {
  it('every Control Tower motion maps to exactly one frozen E0.1 motion', () => {
    expect(Object.keys(MOTION_DETAIL_TO_MOTION)).toHaveLength(12)
    for (const m of Object.values(MOTION_DETAIL_TO_MOTION)) expect(OPPORTUNITY_MOTION).toContain(m)
  })
  it('write-once comparison treats array rows by content, relations by id', () => {
    expect(sameValue([{ id: 'r1', domain: 'a.example' }], [{ id: 'r1', domain: 'b.example' }])).toBe(false)
    expect(sameValue({ id: 'x', updatedAt: '1', name: 'A' }, 'x')).toBe(true)
  })
})
