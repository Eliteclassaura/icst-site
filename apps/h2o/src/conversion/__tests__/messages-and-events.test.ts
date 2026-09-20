import { describe, expect, it, vi } from 'vitest'
import {
  CONVERSION_EVENTS,
  createEventRecorder,
  EVENT_SEMANTICS,
  type ConversionEvent,
} from '../events'
import { acceptMessage, KNOWN_UNMAPPED_TYPES } from '../messages'

const ORIGIN = 'https://form.typeform.com'
const FRAME = { name: 'the-embed-window' }

describe('cross-origin message contract', () => {
  it('accepts a ready message from the configured origin and the embed window', () => {
    expect(acceptMessage({ data: { type: 'form-ready' }, origin: ORIGIN, source: FRAME }, ORIGIN, FRAME)).toEqual(
      { accepted: true, event: 'form_loaded', submissionToken: null },
    )
  })

  it.each([
    ['a different origin', 'https://evil.example'],
    ['a suffix lookalike', 'https://form.typeform.com.evil.example'],
    ['a prefix lookalike', 'https://evilform.typeform.com'],
    ['a subdomain', 'https://a.form.typeform.com'],
    ['plain http', 'http://form.typeform.com'],
    ['a wildcard', '*'],
    ['the null origin', 'null'],
    ['an empty origin', ''],
  ])('refuses a forged message from %s', (_label, origin) => {
    expect(acceptMessage({ data: { type: 'form-submit' }, origin, source: FRAME }, ORIGIN, FRAME)).toEqual({
      accepted: false,
      reason: 'ORIGIN_MISMATCH',
    })
  })

  it('refuses a message from the right origin but the wrong window', () => {
    const otherFrame = { name: 'some-other-frame' }
    expect(
      acceptMessage({ data: { type: 'form-submit' }, origin: ORIGIN, source: otherFrame }, ORIGIN, FRAME),
    ).toEqual({ accepted: false, reason: 'SOURCE_MISMATCH' })
  })

  it('refuses every message before the iframe exists', () => {
    expect(acceptMessage({ data: { type: 'form-ready' }, origin: ORIGIN, source: FRAME }, ORIGIN, null)).toEqual(
      { accepted: false, reason: 'SOURCE_MISMATCH' },
    )
  })

  it.each([
    ['a string payload', 'form-submit'],
    ['null', null],
    ['no type', { responseId: 'r1' }],
    ['a numeric type', { type: 7 }],
    ['a type nobody sends', { type: 'form-please-do-this' }],
  ])('ignores an unrecognised payload: %s', (_label, data) => {
    expect(acceptMessage({ data, origin: ORIGIN, source: FRAME }, ORIGIN, FRAME)).toEqual({
      accepted: false,
      reason: 'PAYLOAD_UNRECOGNISED',
    })
  })
})

/**
 * The raw wire vocabulary, exactly as Typeform's own embed library sends it. R1 mapped
 * `form-screen-changed` to `form_started` — it is the question-navigation message, so a respondent
 * moving through five questions logged five starts — and mapped `form-theme-ready`, a type that
 * does not exist (the real one is `form-theme`, and it carries theme data).
 */
describe('raw Typeform message vocabulary', () => {
  const send = (type: string, extra: Record<string, unknown> = {}) =>
    acceptMessage({ data: { type, ...extra }, origin: ORIGIN, source: FRAME }, ORIGIN, FRAME)

  it.each([
    ['form-ready', 'form_loaded'],
    ['form-started', 'form_started'],
    ['form-submit', 'form_submitted'],
  ])('maps the genuine raw type %s to %s', (type, event) => {
    const verdict = send(type)
    expect(verdict.accepted).toBe(true)
    if (!verdict.accepted) return
    expect(verdict.event).toBe(event)
  })

  it('recognises the real form-started message as the start, not a screen change', () => {
    const verdict = send('form-started')
    expect(verdict).toEqual({ accepted: true, event: 'form_started', submissionToken: null })
  })

  it('does not accept form-screen-changed at all', () => {
    expect(send('form-screen-changed')).toEqual({ accepted: false, reason: 'TYPE_NOT_MAPPED' })
  })

  it('cannot increment form_started from screen changes, however many arrive', () => {
    const emitted: string[] = []
    const recorder = createEventRecorder((e) => emitted.push(e.name))
    for (let i = 0; i < 25; i += 1) {
      const verdict = send('form-screen-changed', { ref: `question-${i}` })
      if (verdict.accepted) recorder.record(verdict.event)
    }
    expect(emitted).toEqual([])

    // One genuine start still counts exactly once.
    const start = send('form-started')
    if (start.accepted) recorder.record(start.event)
    expect(emitted).toEqual(['form_started'])
  })

  it('no longer maps form-theme-ready, which Typeform does not send', () => {
    expect(send('form-theme-ready')).toEqual({ accepted: false, reason: 'PAYLOAD_UNRECOGNISED' })
  })

  it('does not map the real form-theme message either — it is not a load signal', () => {
    expect(send('form-theme')).toEqual({ accepted: false, reason: 'TYPE_NOT_MAPPED' })
  })

  it.each(KNOWN_UNMAPPED_TYPES.map((t) => [t]))(
    'knows %s is a real Typeform type and still refuses to act on it',
    (type) => {
      expect(send(type)).toEqual({ accepted: false, reason: 'TYPE_NOT_MAPPED' })
    },
  )

  it('lets the dialog own closing: form-close from the frame emits nothing', () => {
    const emitted: string[] = []
    const recorder = createEventRecorder((e) => emitted.push(e.name))
    const verdict = send('form-close')
    if (verdict.accepted) recorder.record(verdict.event)
    expect(emitted).toEqual([])
  })

  it('reads the submission token from Typeform\'s own responseId key only', () => {
    expect(send('form-submit', { responseId: 'resp-1' })).toEqual({
      accepted: true,
      event: 'form_submitted',
      submissionToken: 'resp-1',
    })
    // `response_id` is not a key Typeform sends; R1 accepted it, which was invented surface.
    expect(send('form-submit', { response_id: 'resp-1' })).toEqual({
      accepted: true,
      event: 'form_submitted',
      submissionToken: null,
    })
  })
})

describe('cross-origin message contract, continued', () => {
  it('reads a submission token only from a submit message', () => {
    expect(
      acceptMessage(
        { data: { responseId: 'resp-1', type: 'form-submit' }, origin: ORIGIN, source: FRAME },
        ORIGIN,
        FRAME,
      ),
    ).toEqual({ accepted: true, event: 'form_submitted', submissionToken: 'resp-1' })
    expect(
      acceptMessage(
        { data: { responseId: 'resp-1', type: 'form-ready' }, origin: ORIGIN, source: FRAME },
        ORIGIN,
        FRAME,
      ),
    ).toEqual({ accepted: true, event: 'form_loaded', submissionToken: null })
  })
})

describe('event contract', () => {
  it('defines exactly the seven required events', () => {
    expect([...CONVERSION_EVENTS].sort()).toEqual([
      'fallback_opened',
      'form_closed',
      'form_error',
      'form_loaded',
      'form_opened',
      'form_started',
      'form_submitted',
    ])
  })

  it('treats no event as a lead or as revenue, and only submission as a conversion', () => {
    const semantics = Object.values(EVENT_SEMANTICS)
    expect(semantics).not.toContain('lead')
    expect(semantics).not.toContain('revenue')
    expect(semantics.filter((s) => s === 'conversion')).toHaveLength(1)
    expect(EVENT_SEMANTICS.form_submitted).toBe('conversion')
    expect(EVENT_SEMANTICS.form_opened).toBe('engagement')
    expect(EVENT_SEMANTICS.form_started).toBe('engagement')
  })

  it('emits only allowlisted, non-PII payload keys and counts what it refused', () => {
    const seen: ConversionEvent[] = []
    const recorder = createEventRecorder((event) => seen.push(event))
    recorder.record('form_opened', {
      cta_placement: 'product-hero',
      customer_email: 'jane@example.com',
      page_path: '/products/x/',
      product_id: '4711',
      visitor_name: 'Jane Buyer',
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.payload).toEqual({
      cta_placement: 'product-hero',
      page_path: '/products/x/',
      product_id: '4711',
    })
    expect(seen[0]?.redacted).toBe(2)
    expect(JSON.stringify(seen)).not.toContain('jane@example.com')
    expect(JSON.stringify(seen)).not.toContain('Jane Buyer')
  })

  it('refuses a sensitive value even inside an allowlisted key', () => {
    const seen: ConversionEvent[] = []
    const recorder = createEventRecorder((event) => seen.push(event))
    recorder.record('form_error', { error_code: 'contact sales@example.com' })
    expect(seen[0]?.payload).toEqual({})
    expect(seen[0]?.redacted).toBe(1)
  })

  it('never emits the submission token', () => {
    const seen: ConversionEvent[] = []
    const recorder = createEventRecorder((event) => seen.push(event))
    recorder.record('form_submitted', { product_id: '4711', submission_token: 'resp-1' })
    expect(seen[0]?.payload).toEqual({ product_id: '4711' })
    expect(seen[0]?.redacted).toBe(0)
    expect(JSON.stringify(seen)).not.toContain('resp-1')
  })

  it('emits a submission once per token, however many times the embed reports it', () => {
    const seen: ConversionEvent[] = []
    const recorder = createEventRecorder((event) => seen.push(event))
    expect(recorder.record('form_submitted', { submission_token: 'resp-1' })).not.toBeNull()
    expect(recorder.record('form_submitted', { submission_token: 'resp-1' })).toBeNull()
    expect(recorder.record('form_submitted', { submission_token: 'resp-1' })).toBeNull()
    expect(seen.filter((e) => e.name === 'form_submitted')).toHaveLength(1)
  })

  it('emits a second submission when it is genuinely a different response', () => {
    const seen: ConversionEvent[] = []
    const recorder = createEventRecorder((event) => seen.push(event))
    recorder.record('form_submitted', { submission_token: 'resp-1' })
    recorder.record('form_submitted', { submission_token: 'resp-2' })
    expect(seen.filter((e) => e.name === 'form_submitted')).toHaveLength(2)
  })

  it('emits at most one untokenised submission', () => {
    const seen: ConversionEvent[] = []
    const recorder = createEventRecorder((event) => seen.push(event))
    recorder.record('form_submitted')
    recorder.record('form_submitted')
    expect(seen.filter((e) => e.name === 'form_submitted')).toHaveLength(1)
  })

  it('does not dedupe the engagement events', () => {
    const seen: ConversionEvent[] = []
    const recorder = createEventRecorder((event) => seen.push(event))
    recorder.record('form_opened')
    recorder.record('form_closed')
    recorder.record('form_opened')
    expect(seen).toHaveLength(3)
  })

  it('survives a sink that throws, so analytics cannot break the conversion path', () => {
    const sink = vi.fn(() => {
      throw new Error('analytics is down')
    })
    const recorder = createEventRecorder(sink)
    expect(() => recorder.record('form_opened')).not.toThrow()
    expect(sink).toHaveBeenCalledTimes(1)
  })
})
