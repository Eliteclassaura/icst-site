/**
 * H2O Phase 2C-min — Typeform V1 conversion adapter.
 *
 * Opt-in and reusable: nothing here runs unless a caller renders the CTA, and the CTA renders
 * nothing interactive unless configuration validates. Quote/contact-only commerce is preserved —
 * this module has no price, no cart, no checkout and no purchase control, and it never reads or
 * writes `commerce_mode`, `public_price` or any other catalog field.
 */
export {
  APPROVED_TYPEFORM_HOSTS,
  FORM_ID_PATTERN,
  resolveTypeformConfig,
  typeformConfigFromEnv,
} from './config'
export type { ConfigResolution, ConfigUnavailableReason, TypeformConfig } from './config'

export { buildSafeContext, MAX_TOTAL_CONTEXT_BYTES, SAFE_CONTEXT_KEYS } from './context'
export type { DroppedField, DropReason, SafeContext, SafeContextKey } from './context'

export { baseFormUrl, buildFormUrl, MAX_FORM_URL_LENGTH, resolveFormUrl } from './url'

export { acceptMessage, KNOWN_UNMAPPED_TYPES } from './messages'
export type { IncomingMessage, MessageAcceptance } from './messages'

export { CONVERSION_EVENTS, createEventRecorder, EVENT_PAYLOAD_KEYS, EVENT_SEMANTICS } from './events'
export type {
  ConversionEvent,
  ConversionEventName,
  ConversionEventSink,
  EventRecorder,
  EventSemantics,
} from './events'

export {
  mergeTypeformCsp,
  TYPEFORM_CSP_ADDITIONS,
  TYPEFORM_IFRAME_REFERRER_POLICY,
  TYPEFORM_IFRAME_SANDBOX,
} from './csp'

export { closeDialog, handleKey, initialDialogState, openDialog } from './dialog'
export type { DialogState, FocusTarget, KeyOutcome, OpenOptions } from './dialog'

export {
  containsSensitiveValue,
  hasControlCharacter,
  isEmittableValue,
  SENSITIVE_CATEGORIES,
  sensitiveCategory,
} from './sensitive'
