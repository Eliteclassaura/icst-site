/**
 * Native RFQ: the registry fixture (server-side). The CRM Factory serves the registry at GET /api/rfq/registry/ (contract §2)
 * and will publish its own fixture with the adapter patch; until then this builds the contract's §1.1 seeded structure from the
 * CT-accepted OGCS copy table (content/rfq/ogcs-native-rfq-copy-r1.tsv, sha 97e83b3d) plus the CT amendments of 2026-10-05,
 * so the UI is built and tested against the exact shape it will receive.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { COUNTRY_CODES } from './countries'
import type { Purpose, Question, Registry } from './model'
import { client } from '../client'
import { clientsRoot } from '../client/site/content'

/**
 * CT amendments to the OGCS seed: contract §1.1 (2026-10-05), and the Round 5 rulings (CT, 2026-10-05) the CRM seed will
 * serve — the privacy link text, the inline form's continue button, the intake-unavailable line, and `{{offices_link}}` in
 * place of the "call an the company office" phrase (its link text is `offices.link_text`).
 */
export const CT_STRING_AMENDMENTS: Record<string, string> = {
  'contact.email.q': 'Email',
  'contact.email.hint': 'A work email helps us reach the right team',
  'confirm.body_no_number': 'Request sent. Thank you. A member of our team will review your request and contact you.',
  'privacy.link_text': 'Privacy Policy',
  // 1.3a-F1: the inline form's first button opens the review screen (whose own button, `review.send`, sends), so it never says "Send request"
  'form.continue': 'Review and send',
  'panel.unavailable': 'Online requests are unavailable right now. Please contact one of {{offices_link}}.',
  'offices.link_text': 'our offices',
  // owner-confirmed response promise (CT 2026-10-05): shown on the confirmation, under the RFQ number
  'confirm.response_time': "We'll respond within one business day.",
  'err.rate_limited': 'Too many requests from this connection. Please wait a few minutes and try again, or call one of {{offices_link}}.',
  'err.server': "Something went wrong and your request wasn't sent. Please try again, or call one of {{offices_link}}.",
}

/**
 * RFQ-FIX-1: the OGCS strings for the quote-form fixes (outputs/H2O_OGCS_RFQ_FIX_1_STRINGS_2026-10-07, seal a4b21326),
 * verbatim. The phone error (audit R3); the confirmation's attachments line with the customer acknowledgement on or off;
 * the confirmation body with the response promise on or off (the server picks one per configuration, R15).
 */
export const RFQ_FIX_1_STRINGS: Record<string, string> = {
  "email.hint.suggest": "Did you mean {{suggestion}}?",
  "email.hint.use": "Use {{suggestion}}",
  "err.email_domain": "Please check your email address. We couldn't find that email domain.",
  "err.email_disposable": "Please use a permanent email address. We can't reply to temporary inbox addresses.",
  "err.phone": "Please check this phone number. Use digits and include your country code, for example +1 555 012 3456. You can also leave it blank.",
  "confirm.attachments.ack_on": "You can send photos or drawings by replying to our email.",
  "confirm.attachments.ack_off": "You can email photos or drawings to {{sales_email}}. Please include your RFQ number, {{rfq_number}}.",
  "confirm.body.promise_on": "Thank you. Your RFQ number is {{rfq_number}}. A member of our team will review your request and contact you within one business day.",
  "confirm.body.promise_off": "Thank you. Your RFQ number is {{rfq_number}}. A member of our team will review your request and contact you.",
}

/**
 * RFQ-FIX-1.1 (owner order via CT, 2026-10-08): the contact name is asked as two fields, first and last name, with email
 * and name first. Plain field labels as CT relayed them.
 */
export const FIELD_ORDER_STRINGS: Record<string, string> = {
  'contact.first_name.q': 'First name',
  'contact.last_name.q': 'Last name',
}

/**
 * CHAT-COPY-1 (owner request via CT, 2026-10-08): the corner chat asks in a friendly, conversational voice. OGCS rows, verbatim
 * (outputs/H2O_OGCS_CHAT_COPY_1_ROWS_2026-10-08, seal d8087e97, CHAT_COPY_1_ROWS.tsv sha 76e20511). Chat-only keys: the chat
 * looks up `chat.<key>` and falls back to `<key>`, so the inline /contact-us/ form labels are unchanged. Strings only.
 */
export const CHAT_COPY_1_STRINGS: Record<string, string> = {
  "chat.greeting": "Hi, and thanks for stopping by. A few quick questions and we'll prepare your quote.",
  "chat.resume.prompt": "Welcome back. Would you like to pick up where you left off?",
  "chat.contact.email.q": "What's your email address?",
  "chat.contact.email.hint": "A work email helps us send your request to the right team.",
  "chat.contact.first_name.q": "And your first name?",
  "chat.contact.last_name.q": "And your last name? You can skip this.",
  "chat.contact.company.q": "Which company are you with?",
  "chat.purpose.q": "What can we help you with?",
  "chat.parts.part.q": "Which part are you looking for?",
  "chat.parts.model.q": "Do you have a model, serial, or part number? You can skip this.",
  "chat.parts.qty.q": "How many do you need? You can skip this.",
  "chat.towers.cells.q": "How many cells does the tower have? You can skip this.",
  "chat.towers.site.q": "Where is the site? City or region is enough, and you can skip this.",
  "chat.service.issue.q": "Briefly, what's happening with the tower?",
  "chat.service.timing.q": "When would you like the work done? You can skip this.",
  "chat.service.issue.q_upgrade": "What would you like to improve? You can skip this.",
  "chat.other.q": "Tell us briefly what you need.",
  "chat.contact.phone.q": "What's the best phone number to reach you? This is optional.",
  "chat.contact.phone.hint": "Please include your country code.",
  "chat.contact.country.q": "Which country are you in?",
  "chat.notes.q": "Anything else we should know? You can skip this.",
  "chat.contact.intro": "Thanks. Where should we send your quote?",
  "chat.review.heading": "Please check your request",
  "chat.confirm.heading": "Thank you, your request is in",
  "chat.confirm.body": "Your RFQ number is {{rfq_number}}. A member of our team will review your request and be in touch.",
  "chat.confirm.attachments": "If you have photos or drawings, you can send them by replying to our email.",
  "chat.err.required": "Please answer this one so we can continue.",
  "chat.err.email": "That email address doesn't look quite right. Please try again, for example name@company.com.",
  "chat.err.email_domain": "We couldn't find that email domain. Could you check the spelling?",
  "chat.err.email_disposable": "Please use a permanent email address. We can't reply to temporary inboxes.",
  "chat.err.too_long": "That's a bit long. Please keep it under {{max}} characters.",
  "chat.err.rate_limited": "We're getting a lot of requests from this connection. Please wait a few minutes and try again, or call one of {{offices_link}}.",
  "chat.err.offline": "It looks like you're offline. Your answers are saved here. Reconnect and select Send request again.",
}

/**
 * CHAT-FLOW-1 (Security Auditor condition 4, owner-confirmed 2026-10-09): the one privacy line under the chat's email field.
 * The single place to change its wording; `{{privacy_policy_link}}` becomes the "Privacy Notice" link (/privacy-policy/, new
 * tab). It is part of noticeVersionOf, so a change here refuses clients still showing the old line (handlers.ts NOTICE_CHANGED).
 */
export const CHAT_NOTICE_LINE = 'We use this to respond to and follow up on your request. {{privacy_policy_link}}'

/**
 * 1.3a-F1 (CT-1 2026-10-15): the inline form marks what it asks for. A required question carries `form.required.mark`, an
 * optional one `form.optional.suffix` (unless its own label already says "(optional)"), and `form.required.note` explains the
 * mark once above the first field. The legal-final collection notice is NOT touched (its sentence on required fields is a
 * follow-up for the owner and legal), so these marks are what tells a visitor which fields they must fill.
 */
export const FORM_F1_STRINGS: Record<string, string> = {
  'form.required.mark': '*',
  'form.required.note': '* Required',
  'form.optional.suffix': '(optional)',
}

/**
 * CHAT-FLOW-1 (owner direction with the Typeform screenshots, via CT 2026-10-09): the corner chat asks the Typeform's
 * questions, one per step, numbered. CT's wording, verbatim. `_anon` keys are the same sentence when the name or the subject
 * was skipped. The just-in-time notice sits under the email field (CT routes it to the Auditor and Legal).
 */
export const CHAT_FLOW_1_STRINGS: Record<string, string> = {
  'chatflow.email.q': 'What is your email address?',
  'chatflow.email.notice': CHAT_NOTICE_LINE,
  'chatflow.first_name.q': 'Can I get your first name?',
  'chatflow.last_name.q': 'And your last name?',
  'chatflow.company.q': 'Great {{first}}. What company are you with?',
  'chatflow.company.q_anon': 'Great. What company are you with?',
  'chatflow.purpose.q': 'Awesome, {{first}}. What can we help with?',
  'chatflow.purpose.q_anon': 'Awesome. What can we help with?',
  'chatflow.purpose.chip.parts': 'Cooling Tower Parts',
  'chatflow.purpose.chip.new_tower': 'New Cooling Tower',
  'chatflow.purpose.chip.rebuild': 'Replacement',
  'chatflow.purpose.chip.repair': 'Repair & Maintenance',
  'chatflow.purpose.chip.upgrade': 'Thermal Upgrade',
  'chatflow.purpose.chip.other': 'Other',
  'chatflow.parts_part.q': 'What part are you looking for?',
  'chatflow.parts_part.chip.fans': 'Fans',
  'chatflow.parts_part.chip.fill_media': 'Fill Media',
  'chatflow.parts_part.chip.drift_eliminators': 'Drift Eliminators',
  'chatflow.parts_part.chip.nozzles': 'Nozzles',
  'chatflow.parts_part.chip.gear_boxes': 'Gear Boxes',
  'chatflow.parts_part.chip.motors': 'Motors',
  'chatflow.parts_part.chip.drive_shafts': 'Drive Shafts',
  'chatflow.parts_part.chip.fan_stacks': 'Fan Stacks',
  'chatflow.parts_part.chip.frp_members': 'FRP Members',
  'chatflow.parts_part.chip.hardware': 'Hardware',
  'chatflow.parts_part.chip.other': 'Other',
  'chatflow.details.q': 'Please provide any information you have on {{subject}}, below, so we can quote accurately',
  'chatflow.details.q_anon': 'Please provide any information you have, below, so we can quote accurately',
  'chatflow.urgent.q': 'Is this an urgent part request?',
  'chatflow.urgent.chip.yes': 'Yes',
  'chatflow.urgent.chip.no': 'No',
  'chatflow.phone.q': 'Please let us know your phone number',
  'chatflow.country.q': 'Can you please let us know the country of destination?',
  'chatflow.notes.q': "Anything else you'd like us to know?",
  'chatflow.ok': 'OK',
  'chatflow.enter': 'press Enter ↵',
  'chatflow.back': 'Back',
  'chatflow.skip': 'Skip',
  'chatflow.submit': 'Send request', // 1.3a-F1 (was "Submit")
  'chatflow.required': 'Required',
  'chatflow.progress': 'Question {{n}} of {{total}}',
  'chatflow.done.heading': 'Thank you {{first}}!',
  'chatflow.done.heading_anon': 'Thank you!',
  'chatflow.done.number': 'Your RFQ number is {{rfq_number}}.',
  'chatflow.submitting': 'Sending your request…',
  'chatflow.retry': 'Try again',
  // owner 2026-10-09: no upload step; files come by email after the request
  'chatflow.done.attachments': 'You can reply to our email with any drawings or PDFs.',
  'err.notice_changed': 'We have updated our privacy notice. Please read it below, then continue.',
}

/**
 * FORM-NOTICE-1: the quote-request collection notice, kept byte for byte at `clients/<slug>/content/rfq/form-notice-source.md` and pinned
 * here by SHA-256, so any change to the text is a visible decision (a changed file is used as is and logged). The pin below is the ICST
 * notice as approved by the owner on 23 Oct 2026 ("approved with defaults"; the marker is removed). Earlier, as a DRAFT, it carried the pending-approval marker, so a production deploy refuses to build the form until the owner or
 * counsel approve it (assertApprovedForProduction); after their edits, remove the marker and update this pin. Its short notice becomes
 * `privacy.note` (the link text "Privacy Notice" becomes `privacy.link_text`); its expanded notice becomes the "How we use your details" list.
 */
export const FORM_NOTICE_SHA256 = 'a7c4d73a2072004e54df345c846c3757f437586171f20f7bd8f4580fb5653cca'
export function formNoticeStrings(md: string): Record<string, string> {
  const section = (title: RegExp) => {
    const lines = md.split('\n')
    const i = lines.findIndex((l) => title.test(l))
    if (i < 0) throw new Error('FORM_NOTICE_SECTION_MISSING')
    const out: string[] = []
    for (const l of lines.slice(i + 1)) {
      if (l.startsWith('## ')) break
      out.push(l)
    }
    return { heading: lines[i]!, body: out }
  }
  const short = section(/^## Short notice/).body.find((l) => l.startsWith('> '))
  const linkRe = /\[([^\]]+)\]\(\/privacy-policy\/\)/
  if (!short || !linkRe.test(short)) throw new Error('FORM_NOTICE_SHORT_MISSING')
  const expanded = section(/^## Expanded notice/)
  const label = /"([^"]+)"/.exec(expanded.heading)?.[1]
  const items = expanded.body.filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
  if (!label || items.length === 0) throw new Error('FORM_NOTICE_EXPANDED_MISSING')
  return {
    'privacy.note': short.slice(2).replace(linkRe, '{{privacy_policy_link}}'),
    'privacy.link_text': linkRe.exec(short)![1]!,
    'privacy.details.link': label,
    'privacy.details.items': items.join('\n'),
  }
}

export const parseCopyTable = (tsv: string): Record<string, string> => {
  const [head, ...rows] = tsv.trimEnd().split('\n')
  const cols = head!.split('\t')
  return Object.fromEntries(rows.map((l) => l.split('\t')).map((r) => [r[cols.indexOf('id')]!, r[cols.indexOf('text_en')] ?? '']))
}

const chips = (strings: Record<string, string>, prefix: string) => Object.keys(strings).filter((k) => k.startsWith(prefix)).map((labelKey) => ({ value: labelKey.slice(prefix.length), labelKey }))
type Q = Omit<Question, 'errorKeys' | 'validation'> & { maxLength: number; pattern?: Question['validation']['pattern'] }
const question = ({ maxLength, pattern, ...q }: Q): Question => ({
  ...q,
  validation: { maxLength, ...(pattern ? { pattern } : {}) },
  errorKeys: { ...(q.required ? { required: 'err.required' } : {}), ...(pattern === 'email' ? { invalid: 'err.email' } : pattern === 'tel' ? { invalid: 'err.phone' } : {}), tooLong: 'err.too_long' },
})

/**
 * CHAT-FLOW-1: which privacy wording a visitor was shown — a short hash of the notice strings the surfaces display (the form's
 * short and expanded notice, the chat's just-in-time line). The client sends it with the submission and the intake event keeps
 * it, so each RFQ says which notice it saw. The registry version stays the question structure only (FORM-NOTICE-1.1).
 */
export const NOTICE_KEYS = ['privacy.note', 'privacy.link_text', 'privacy.details.link', 'privacy.details.items', 'chatflow.email.notice'] as const
export const noticeVersionOf = (strings: Record<string, string>): string =>
  `notice-${createHash('sha256').update(JSON.stringify(NOTICE_KEYS.map((k) => [k, strings[k] ?? '']))).digest('hex').slice(0, 8)}`

const PARTS_CHIPS = ['fans', 'fill_media', 'drift_eliminators', 'nozzles', 'gear_boxes', 'motors', 'drive_shafts', 'fan_stacks', 'frp_members', 'hardware', 'other']
/**
 * CHAT-FLOW-1: the chat's questions (flow.ts CHAT_ORDER). Owner 2026-10-09: email, first and last name, the service and (for
 * parts) the part are required; company, details, urgent, phone, country and notes can be skipped.
 */
function chatQuestions(): Question[] {
  const opt = { required: false, skippable: true }
  const req = { required: true }
  return [
    question({ id: 'email', step: 'contact', branches: ['all'], type: 'email', required: true, labelKey: 'chatflow.email.q', placeholderKey: 'contact.email.ph', pattern: 'email', maxLength: 254 }),
    question({ id: 'first_name', step: 'contact', branches: ['all'], type: 'text', ...req, labelKey: 'chatflow.first_name.q', maxLength: 80 }),
    question({ id: 'last_name', step: 'contact', branches: ['all'], type: 'text', ...req, labelKey: 'chatflow.last_name.q', maxLength: 80 }),
    question({ id: 'company', step: 'contact', branches: ['all'], type: 'text', ...opt, labelKey: 'chatflow.company.q', maxLength: 160 }),
    question({ id: 'purpose', step: 'purpose', branches: ['all'], type: 'chips', ...req, labelKey: 'chatflow.purpose.q', chips: ['parts', 'new_tower', 'rebuild', 'repair', 'upgrade', 'other'].map((v) => ({ value: v, labelKey: `chatflow.purpose.chip.${v}` })), maxLength: 16 }),
    question({ id: 'parts_part', step: 'details', branches: ['parts'], type: 'chips', ...req, labelKey: 'chatflow.parts_part.q', chips: PARTS_CHIPS.map((v) => ({ value: v, labelKey: `chatflow.parts_part.chip.${v}` })), maxLength: 24 }),
    question({ id: 'details', step: 'details', branches: ['all'], type: 'textarea', ...opt, labelKey: 'chatflow.details.q', maxLength: 2000 }),
    question({ id: 'urgent', step: 'details', branches: ['parts'], type: 'chips', ...opt, labelKey: 'chatflow.urgent.q', chips: ['yes', 'no'].map((v) => ({ value: v, labelKey: `chatflow.urgent.chip.${v}` })), maxLength: 4 }),
    question({ id: 'phone', step: 'contact', branches: ['all'], type: 'tel', ...opt, labelKey: 'chatflow.phone.q', hintKey: 'contact.phone.hint', pattern: 'tel', maxLength: 40 }),
    question({ id: 'country', step: 'contact', branches: ['all'], type: 'country', ...opt, labelKey: 'chatflow.country.q', placeholderKey: 'contact.country.search_ph', pattern: 'iso2', maxLength: 2 }),
    question({ id: 'notes', step: 'details', branches: ['all'], type: 'textarea', ...opt, labelKey: 'chatflow.notes.q', maxLength: 2000 }),
  ]
}

/** The contract §1.1 seeded structure, with strings from the copy table. */
export function registryFromCopy(tsv: string, formNotice?: string): Registry {
  const strings = { ...parseCopyTable(tsv), ...CT_STRING_AMENDMENTS, ...RFQ_FIX_1_STRINGS, ...FIELD_ORDER_STRINGS, ...CHAT_COPY_1_STRINGS, ...CHAT_FLOW_1_STRINGS, ...FORM_F1_STRINGS, ...(formNotice ? formNoticeStrings(formNotice) : {}) }
  const purposes: Purpose[] = [
    { value: 'new_tower', labelKey: 'purpose.chip.new_tower', branch: 'towers' },
    { value: 'repair', labelKey: 'purpose.chip.repair', branch: 'service' },
    { value: 'upgrade', labelKey: 'purpose.chip.upgrade', branch: 'towers', extraQuestions: ['service_issue_upgrade'] },
    { value: 'inspection', labelKey: 'purpose.chip.inspection', branch: 'service' },
    { value: 'rebuild', labelKey: 'purpose.chip.rebuild', branch: 'towers' },
    { value: 'parts', labelKey: 'purpose.chip.parts', branch: 'parts' },
    { value: 'other', labelKey: 'purpose.chip.other', branch: 'other' },
  ]
  const questions: Question[] = [
    question({ id: 'purpose', step: 'purpose', branches: ['all'], type: 'chips', required: true, labelKey: 'purpose.q', chips: purposes.map((p) => ({ value: p.value, labelKey: p.labelKey })), maxLength: 16 }),
    question({ id: 'parts_part', step: 'details', branches: ['parts'], type: 'text', required: true, labelKey: 'parts.part.q', placeholderKey: 'parts.part.ph', maxLength: 200 }),
    question({ id: 'parts_model', step: 'details', branches: ['parts'], type: 'text', required: false, labelKey: 'parts.model.q', placeholderKey: 'parts.model.ph', skippable: true, maxLength: 120 }),
    question({ id: 'parts_qty', step: 'details', branches: ['parts'], type: 'number_or_text', required: false, labelKey: 'parts.qty.q', skippable: true, maxLength: 60 }),
    question({ id: 'towers_type', step: 'details', branches: ['towers'], type: 'chips', required: true, labelKey: 'towers.type.q', chips: chips(strings, 'towers.type.chip.'), maxLength: 16 }),
    question({ id: 'towers_cells', step: 'details', branches: ['towers'], type: 'chips', required: false, labelKey: 'towers.cells.q', chips: chips(strings, 'towers.cells.chip.'), skippable: true, maxLength: 16 }),
    question({ id: 'towers_site', step: 'details', branches: ['towers'], type: 'text', required: false, labelKey: 'towers.site.q', placeholderKey: 'towers.site.ph', skippable: true, maxLength: 160 }),
    question({ id: 'service_issue', step: 'details', branches: ['service'], type: 'textarea', required: true, labelKey: 'service.issue.q', placeholderKey: 'service.issue.ph', maxLength: 2000 }),
    question({ id: 'service_issue_upgrade', step: 'details', branches: [], type: 'textarea', required: false, labelKey: 'service.issue.q_upgrade', placeholderKey: 'service.issue.ph', skippable: true, maxLength: 2000 }),
    question({ id: 'service_timing', step: 'details', branches: ['service'], type: 'chips', required: false, labelKey: 'service.timing.q', chips: chips(strings, 'service.timing.chip.'), skippable: true, maxLength: 16 }),
    question({ id: 'other_need', step: 'details', branches: ['other'], type: 'textarea', required: true, labelKey: 'other.q', maxLength: 2000 }),
    question({ id: 'notes', step: 'details', branches: ['all'], type: 'textarea', required: false, labelKey: 'notes.q', skippable: true, maxLength: 2000 }),
    question({ id: 'first_name', step: 'contact', branches: ['all'], type: 'text', required: true, labelKey: 'contact.first_name.q', maxLength: 80 }),
    question({ id: 'last_name', step: 'contact', branches: ['all'], type: 'text', required: false, labelKey: 'contact.last_name.q', skippable: true, maxLength: 80 }),
    question({ id: 'company', step: 'contact', branches: ['all'], type: 'text', required: true, labelKey: 'contact.company.q', maxLength: 160 }),
    question({ id: 'email', step: 'contact', branches: ['all'], type: 'email', required: true, labelKey: 'contact.email.q', placeholderKey: 'contact.email.ph', hintKey: 'contact.email.hint', pattern: 'email', maxLength: 254 }),
    question({ id: 'phone', step: 'contact', branches: ['all'], type: 'tel', required: false, labelKey: 'contact.phone.q', hintKey: 'contact.phone.hint', pattern: 'tel', skippable: true, maxLength: 40 }), // skippable: CT Round 5 ruling 2
    question({ id: 'country', step: 'contact', branches: ['all'], type: 'country', required: true, labelKey: 'contact.country.q', placeholderKey: 'contact.country.search_ph', pattern: 'iso2', maxLength: 2 }),
  ]
  const structure = { purposes, questions, chatQuestions: chatQuestions(), countries: [...COUNTRY_CODES] }
  return {
    registryVersion: `rfq-r1-${createHash('sha256').update(JSON.stringify(structure)).digest('hex').slice(0, 8)}`,
    noticeVersion: noticeVersionOf(strings),
    locale: 'en',
    fallbackLocale: 'en',
    enabled: true,
    steps: ['purpose', 'details', 'contact', 'review', 'confirm'],
    ...structure,
    // RFQ-FIX-1 (R4): 32 KB holds the longest flow in 3-byte script (Thai, Japanese) with full context and attribution
    limits: { maxBodyBytes: 32768, minSecondsToSubmit: 3 },
    strings,
  }
}

/**
 * FORM-NOTICE-1.1 (Auditor N1, N2): the notice file must never take quote submissions down. A missing or unparsable file
 * degrades to the existing `privacy.note` text from the copy table (the short notice and the Privacy Policy link, without the
 * expanded list) and logs a code; a file whose bytes differ from the approved hash is used as is and logged (never throws).
 * Codes only: no content is logged.
 */
export type RegistrySource = (relativePath: string) => Buffer
// Fork: the form copy is the client's own, read from `clients/<slug>/` (CLIENTS_DIR in an image), never from a default-site content folder.
/** The client's copy table: `clients/<slug>/content/rfq/<slug>-native-rfq-copy-r1.tsv`. */
const copyTablePath = (): string => `content/rfq/${client().slug}-native-rfq-copy-r1.tsv`
const diskSource: RegistrySource = (rel) => readFileSync(path.join(clientsRoot(), client().slug, rel))
// Server-side only (the registry is built on the server). One JSON line on stderr: a code and a short reason, never content.
const logNotice = (code: string, detail: string) => process.stderr.write(`${JSON.stringify({ level: 'error', code, detail })}\n`)

export function loadFormNotice(read: RegistrySource): string | undefined {
  let raw: Buffer
  try {
    raw = read('content/rfq/form-notice-source.md')
  } catch {
    logNotice('FORM_NOTICE_FALLBACK', 'FILE_UNREADABLE')
    return undefined
  }
  if (createHash('sha256').update(raw).digest('hex') !== FORM_NOTICE_SHA256) logNotice('FORM_NOTICE_SHA256_MISMATCH', 'USED_AS_IS')
  const text = raw.toString('utf8')
  try {
    formNoticeStrings(text)
  } catch (e) {
    logNotice('FORM_NOTICE_FALLBACK', String((e as Error).message).slice(0, 40))
    return undefined
  }
  return text
}

/**
 * Copy that still carries this marker has not been approved by the owner or counsel (the collection notice, the privacy note). A private
 * deploy may show it for review; under the production policy the form refuses to build rather than publish unapproved wording.
 */
export const PENDING_MARKER = 'OWNER/COUNSEL YES NEEDED'
export function assertApprovedForProduction(copy: string, notice: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  if (env.H2O_INDEXING_POLICY !== 'production') return
  if (copy.includes(PENDING_MARKER) || (notice ?? '').includes(PENDING_MARKER)) throw new Error('COPY_PENDING_APPROVAL: the quote-form notice or privacy note is not approved yet')
}

export const buildRegistry = (read: RegistrySource): Registry => {
  const copy = read(copyTablePath()).toString('utf8')
  const notice = loadFormNotice(read)
  assertApprovedForProduction(copy, notice)
  return registryFromCopy(copy, notice)
}

let cache: Registry | undefined
let source: RegistrySource = diskSource
/** Tests only: swap where the copy files are read from (`undefined` restores the disk) and drop the cached registry. */
export function setRegistrySourceForTests(read?: RegistrySource): void {
  cache = undefined
  source = read ?? diskSource
}
/** 4C-FIX.1 (Auditor N3): the fallback is NOT cached: a failed read is retried on the next request (the log line stays), so a
 * transient failure never leaves the form on the short notice until the process restarts. */
export const fixtureRegistry = (): Registry => {
  if (cache) return cache
  const notice = loadFormNotice(source)
  const copy = source(copyTablePath()).toString('utf8')
  assertApprovedForProduction(copy, notice)
  const reg = registryFromCopy(copy, notice)
  if (notice !== undefined) cache = reg
  return reg
}
