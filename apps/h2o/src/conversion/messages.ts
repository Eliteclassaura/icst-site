/**
 * H2O Phase 2C-min — cross-document message contract.
 *
 * The embedded form runs in another origin, so everything it says arrives as a `postMessage` and is
 * untrusted until proved otherwise. Two checks decide that, and both must pass:
 *
 *   1. `event.origin` is **string-equal** to the configured origin. Not `endsWith`, not a regex,
 *      not a wildcard — `https://form.typeform.com.attacker.example` ends with nothing useful but
 *      passes a careless suffix test, and `*` passes everything.
 *   2. `event.source` is the window of the iframe we created. Origin alone is not identity: any
 *      document from that origin, in any frame on the page, could otherwise speak for our embed.
 *
 * A message that fails either check is ignored. It is not logged with its contents and it does not
 * produce an event, because an attacker-controlled payload is not analytics.
 */
import type { ConversionEventName } from './events'

/**
 * The raw wire vocabulary, taken from Typeform's own embed library rather than guessed.
 *
 * R1 mapped two types that do not survive contact with the evidence:
 *
 *   - `form-screen-changed` was mapped to `form_started`. It is Typeform's **question-navigation**
 *     message (`onQuestionChanged` — "fires when user navigates between form questions"), so it
 *     fires on every screen. Treating it as a start inflated starts by the number of questions a
 *     respondent moved through. It is now ignored: no authorized H2O event means question
 *     navigation, and 2C-min may not invent one.
 *   - `form-theme-ready` did not exist. The real type is `form-theme`, it carries theme data, and
 *     it says nothing about the form being ready. It is removed rather than remapped.
 *
 * `form-started` is the genuine start message (`onStarted` — "fires on the form 'submission start'
 * event") and is what `form_started` now means.
 */
const TYPE_MAP: Readonly<Record<string, ConversionEventName>> = {
  'form-ready': 'form_loaded',
  'form-started': 'form_started',
  'form-submit': 'form_submitted',
}

/**
 * Types Typeform really sends that H2O deliberately does not act on. Listing them is not decoration:
 * it is the difference between "we have never heard of this" and "we know what this is and chose to
 * ignore it", and it stops a future author quietly mapping one to an event nobody authorized.
 *
 * `form-close` is here because the H2O dialog owns closing: `form_closed` is emitted by our own
 * close path, and also emitting it from the frame would double-count.
 */
export const KNOWN_UNMAPPED_TYPES: readonly string[] = [
  'duplicate-detected',
  'form-close',
  'form-height-changed',
  'form-screen-changed',
  'form-theme',
  'redirect-after-submit',
  'thank-you-screen-button-click',
  'thank-you-screen-redirect',
  'welcome-screen-hidden',
]

export type IncomingMessage = {
  data: unknown
  origin: string
  source: unknown
}

export type MessageAcceptance =
  | {
      accepted: false
      reason: 'ORIGIN_MISMATCH' | 'PAYLOAD_UNRECOGNISED' | 'SOURCE_MISMATCH' | 'TYPE_NOT_MAPPED'
    }
  | { accepted: true; event: ConversionEventName; submissionToken: string | null }

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

/**
 * Decide whether a message may be acted on.
 *
 * `expectedSource` is the iframe's `contentWindow`. When it is null — which happens only before the
 * iframe has mounted — every message is refused, because there is nothing legitimate to hear from
 * yet.
 */
export const acceptMessage = (
  message: IncomingMessage,
  expectedOrigin: string,
  expectedSource: unknown,
): MessageAcceptance => {
  if (message.origin !== expectedOrigin) return { accepted: false, reason: 'ORIGIN_MISMATCH' }
  if (expectedSource === null || expectedSource === undefined || message.source !== expectedSource)
    return { accepted: false, reason: 'SOURCE_MISMATCH' }

  const data = message.data
  if (data === null || typeof data !== 'object') return { accepted: false, reason: 'PAYLOAD_UNRECOGNISED' }

  const record = data as Record<string, unknown>
  const type = readString(record.type)
  if (type === null) return { accepted: false, reason: 'PAYLOAD_UNRECOGNISED' }

  const event = TYPE_MAP[type]
  if (event === undefined) {
    // A type we know Typeform sends but do not act on is reported differently from one we have
    // never seen. Neither produces an event; the distinction is for the reader, not the analytics.
    return {
      accepted: false,
      reason: KNOWN_UNMAPPED_TYPES.includes(type) ? 'TYPE_NOT_MAPPED' : 'PAYLOAD_UNRECOGNISED',
    }
  }

  // Only the submit message carries a response id, and only for dedupe. It is never emitted.
  // `responseId` is Typeform's own key; R1 also accepted a `response_id` spelling that Typeform
  // does not send, which was invented surface and is gone.
  const submissionToken = event === 'form_submitted' ? readString(record.responseId) : null

  return { accepted: true, event, submissionToken }
}
