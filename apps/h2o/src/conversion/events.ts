/**
 * H2O Phase 2C-min — conversion event contract.
 *
 * Seven events, no PII, and one piece of semantics stated in the type system rather than in a
 * comment somebody can ignore: **an open or a start is not a lead, and a submission is a conversion
 * event, not proven opportunity or revenue.** `EVENT_SEMANTICS` is exported so a downstream
 * consumer has to look at it, and the tests assert no event is ever labelled revenue-bearing.
 *
 * The recorder is a pure function of its inputs plus a small amount of dedupe state. It never
 * throws: an analytics sink that throws inside a click handler breaks the conversion path it was
 * supposed to measure.
 *
 * The PII screen is the shared `sensitive.ts` primitive — the same function the safe-context
 * contract uses. R1 kept a second, shorter copy here, which is exactly how two copies of a control
 * drift: this one lacked the JWT and provider-token patterns and did not check control characters.
 */
import { isEmittableValue } from './sensitive'

export const CONVERSION_EVENTS = [
  'form_opened',
  'form_loaded',
  'form_started',
  'form_submitted',
  'form_closed',
  'form_error',
  'fallback_opened',
] as const

export type ConversionEventName = (typeof CONVERSION_EVENTS)[number]

/**
 * What each event is allowed to mean. `conversion` marks the single event that records a completed
 * submission. Nothing here is `lead` or `revenue`; 2C-min cannot know either, and the Revenue
 * Engine and CRM are not part of this increment.
 */
export type EventSemantics = 'conversion' | 'diagnostic' | 'engagement'

export const EVENT_SEMANTICS: Record<ConversionEventName, EventSemantics> = {
  fallback_opened: 'diagnostic',
  form_closed: 'engagement',
  form_error: 'diagnostic',
  form_loaded: 'diagnostic',
  form_opened: 'engagement',
  form_started: 'engagement',
  form_submitted: 'conversion',
}

/** Keys an event payload may carry. Same discipline as the context allowlist: nothing else travels. */
export const EVENT_PAYLOAD_KEYS = [
  'cta_placement',
  'error_code',
  'page_path',
  'product_id',
  'product_slug',
] as const

export type EventPayloadKey = (typeof EVENT_PAYLOAD_KEYS)[number]

export type ConversionEvent = {
  name: ConversionEventName
  payload: Partial<Record<EventPayloadKey, string>>
  /** How many properties were refused before emission. Non-zero is a finding, not a nuisance. */
  redacted: number
}

export type ConversionEventSink = (event: ConversionEvent) => void

const MAX_PAYLOAD_VALUE_LENGTH = 160

const isAllowedKey = (key: string): key is EventPayloadKey =>
  (EVENT_PAYLOAD_KEYS as readonly string[]).includes(key)

const isEmittable = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_PAYLOAD_VALUE_LENGTH &&
  isEmittableValue(value)

export type EventRecorder = {
  /**
   * Emit an event. Returns what was emitted, or null when the event was suppressed as a duplicate.
   * The sink is passed per call rather than captured at construction, so a caller can change its
   * analytics handler without discarding the dedupe state that makes submissions count once.
   */
  record: (
    name: ConversionEventName,
    payload?: Readonly<Record<string, unknown>>,
    sink?: ConversionEventSink,
  ) => ConversionEvent | null
}

/**
 * Create a recorder.
 *
 * Dedupe: `form_submitted` is emitted at most once per submission token, and at most once per
 * recorder when the embed gives us no token. Typeform's embed can deliver a submit message more
 * than once — on a retry, or when two listeners are attached — and double-counting a conversion is
 * a reporting defect, so the recorder refuses rather than trusting the caller to.
 */
export const createEventRecorder = (defaultSink?: ConversionEventSink): EventRecorder => {
  const seenSubmissions = new Set<string>()
  let submittedWithoutToken = false

  const record = (
    name: ConversionEventName,
    payload: Readonly<Record<string, unknown>> = {},
    sink: ConversionEventSink | undefined = defaultSink,
  ): ConversionEvent | null => {
    if (name === 'form_submitted') {
      const raw = payload.submission_token
      const token = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
      if (token === null) {
        if (submittedWithoutToken) return null
        submittedWithoutToken = true
      } else {
        if (seenSubmissions.has(token)) return null
        seenSubmissions.add(token)
      }
    }

    const clean: Partial<Record<EventPayloadKey, string>> = {}
    let redacted = 0
    for (const [key, value] of Object.entries(payload)) {
      // The submission token is dedupe state, not analytics. It is never emitted.
      if (key === 'submission_token') continue
      if (!isAllowedKey(key) || !isEmittable(value)) {
        redacted += 1
        continue
      }
      clean[key] = value
    }

    const event: ConversionEvent = { name, payload: clean, redacted }
    try {
      sink?.(event)
    } catch {
      // A failing sink must not take the conversion path down with it.
    }
    return event
  }

  return { record }
}
