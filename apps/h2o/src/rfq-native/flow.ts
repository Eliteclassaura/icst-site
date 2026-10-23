/**
 * Native RFQ: the question flow as a pure engine (no React, no DOM, no network), on the contract registry (§1). Both surfaces
 * — the corner chat and the inline form — run on it, so they ask the same questions in the same order with the same rules.
 *
 * Answers are keyed by question id. A question the visitor skipped is held as an empty value, so "not yet asked" and
 * "skipped" never look alike; skipped answers are omitted from the submission (contract §4). Changing the purpose prunes the
 * answers of the branch left behind.
 */
import { countryName } from './countries'
import type { Question, Registry } from './model'

export type Answers = Record<string, string>
/** CHAT-FLOW-1: which flow — the corner chat's own questions, or the inline form's (the default everywhere). */
export type Surface = 'chat' | 'form'

/**
 * CHAT-FLOW-1 (owner, CT 2026-10-09): the corner chat asks like the old Typeform, one question per step, in this order.
 * Required (owner 2026-10-09): email, first and last name, the service and, for parts, the part (registry.ts chatQuestions).
 * `parts_part` and `urgent` are asked for a parts request only. Ids the CRM already reads keep
 * their names (`purpose`, `parts_part`, `urgent`, `notes`), so the RFQ record, the alert and the sheet fill as before.
 */
export const CHAT_ORDER = ['email', 'first_name', 'last_name', 'company', 'purpose', 'parts_part', 'details', 'urgent', 'phone', 'country', 'notes'] as const
const PARTS_ONLY = new Set(['parts_part', 'urgent'])
function chatFlow(reg: Registry, answers: Answers): Question[] {
  const parts = answers.purpose === 'parts'
  return CHAT_ORDER.filter((id) => parts || !PARTS_ONLY.has(id)).map((id) => reg.chatQuestions!.find((q) => q.id === id)).filter((q): q is Question => Boolean(q))
}

/** RFQ-FIX-1.1 (owner order, CT 2026-10-08): who is asking comes first — email, first name, last name, company. */
export const LEAD_CONTACT = ['email', 'first_name', 'last_name', 'company'] as const

/**
 * The questions this visitor is asked, in order (RFQ-FIX-1.1, owner order): email, first name, last name, company; then
 * purpose (interest) with its branch's details and extra questions; then phone and country; then the message (notes).
 * Every surface — the chat, the inline form, the review — follows this one order.
 */
export function questionsFor(reg: Registry, answers: Answers, surface: Surface = 'form'): Question[] {
  if (surface === 'chat' && reg.chatQuestions?.length) return chatFlow(reg, answers)
  const byStep = (step: Question['step']) => reg.questions.filter((q) => q.step === step)
  const purpose = reg.purposes.find((p) => p.value === answers.purpose)
  const purposeQ = byStep('purpose')
  const contact = byStep('contact')
  const lead = LEAD_CONTACT.map((id) => contact.find((q) => q.id === id)).filter((q): q is Question => Boolean(q))
  const rest = contact.filter((q) => !(LEAD_CONTACT as readonly string[]).includes(q.id))
  if (!purpose) return [...lead, ...purposeQ, ...rest]
  const details = byStep('details')
  const branch = details.filter((q) => q.branches.includes(purpose.branch))
  const extra = (purpose.extraQuestions ?? []).map((id) => reg.questions.find((q) => q.id === id)).filter((q): q is Question => Boolean(q))
  const all = details.filter((q) => q.branches.includes('all'))
  return [...lead, ...purposeQ, ...branch, ...extra, ...rest, ...all]
}

/** RFQ-FIX-1.1: the browser autocomplete token for a question (empty: none). */
export const autocompleteFor = (q: Question): string =>
  ({ email: 'email', first_name: 'given-name', last_name: 'family-name', company: 'organization', phone: 'tel', country: 'country-name' } as Record<string, string>)[q.id] ?? 'off'

/** The next question not yet answered or skipped; undefined when the visitor can review. */
export const nextQuestion = (reg: Registry, answers: Answers, surface: Surface = 'form'): Question | undefined => questionsFor(reg, answers, surface).find((q) => !(q.id in answers))

/** Keep only the answers the current flow asks for. */
export function prune(reg: Registry, answers: Answers, surface: Surface = 'form'): Answers {
  const ids = new Set(questionsFor(reg, answers, surface).map((q) => q.id))
  return Object.fromEntries(Object.entries(answers).filter(([k]) => ids.has(k)))
}

/** Record an answer (trimmed; '' = skipped). */
export const answer = (reg: Registry, answers: Answers, id: string, value: string, surface: Surface = 'form'): Answers => prune(reg, { ...answers, [id]: value.trim() }, surface)

/** Ask a question again (the review "Edit" link, or a server validation error). */
export function reopen(answers: Answers, id: string): Answers {
  const next = { ...answers }
  delete next[id]
  return next
}

/**
 * A draft from another registry version (contract §2): keep the answers whose question still exists (and, for chips,
 * whose value still exists), then continue at the first unanswered question.
 */
export function migrate(reg: Registry, answers: Answers, surface: Surface = 'form'): Answers {
  const pool = surface === 'chat' && reg.chatQuestions?.length ? reg.chatQuestions : reg.questions
  const kept = Object.fromEntries(Object.entries(answers).filter(([id, v]) => {
    const q = pool.find((x) => x.id === id)
    return q && (q.type !== 'chips' || v === '' || q.chips?.some((c) => c.value === v))
  }))
  return prune(reg, kept, surface)
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i
/**
 * RFQ-FIX-1 (audit R3): a phone number, after `normalizePhone`: digits with spaces, brackets, dots, hyphens or slashes, an
 * optional leading +, and an optional extension (`x12`, `ext. 4`, `extension 4`); at least 4 digits before the extension.
 */
const TEL = /^\+?[0-9 ()./-]{4,40}?(?:\s*(?:x|ext\.?|extension)\s*[0-9]{1,6})?$/i
const telDigits = (v: string) => (v.replace(/(?:x|ext\.?|extension)\s*[0-9]{1,6}$/i, '').match(/[0-9]/g) ?? []).length

/** RFQ-FIX-1 (R3): full-width digits and punctuation (Japanese / Thai keyboards) read as their ASCII forms (NFKC). */
export const normalizePhone = (v: string): string => v.normalize('NFKC').replace(/\s+/g, ' ').trim()

/**
 * RFQ-FIX-1 (audit R9): control characters never travel. C0 controls (NUL included) other than tab and newline, DEL, the C1
 * range and the bidirectional overrides/isolates are removed, and so is any unpaired surrogate (1.3c-8: not valid text);
 * CR LF and CR become LF. Client and server both apply it.
 */
export const stripControls = (v: string): string =>
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')

/** The error key (and placeholder values) for one answer, or null. `surface` picks the chat or form "required" wording. */
export function validate(reg: Registry, q: Question, value: string | undefined, surface: 'chat' | 'form' = 'chat'): { key: string; values?: Record<string, string> } | null {
  const v = (value ?? '').trim()
  const required = surface === 'form' ? 'err.required.form' : (q.errorKeys.required ?? 'err.required')
  if (!v) return q.required ? { key: required } : null
  if (v.length > q.validation.maxLength) return { key: q.errorKeys.tooLong, values: { max: String(q.validation.maxLength) } }
  if (q.validation.pattern === 'email' && !EMAIL.test(v)) return { key: q.errorKeys.invalid ?? 'err.email' }
  if (q.validation.pattern === 'tel') {
    const n = normalizePhone(v)
    if (!TEL.test(n) || telDigits(n) < 4) return { key: q.errorKeys.invalid ?? required }
  }
  if (q.validation.pattern === 'iso2' && !reg.countries.includes(v)) return { key: q.errorKeys.invalid ?? required }
  if (q.type === 'chips' && !q.chips?.some((c) => c.value === v)) return { key: q.errorKeys.invalid ?? required }
  return null
}

/** Every error in the flow (the inline form checks everything at once; the chat checks as it goes). */
export function validateAll(reg: Registry, answers: Answers, surface: 'chat' | 'form'): Record<string, { key: string; values?: Record<string, string> }> {
  const out: Record<string, { key: string; values?: Record<string, string> }> = {}
  for (const q of questionsFor(reg, answers, surface)) {
    const e = validate(reg, q, answers[q.id], surface)
    if (e) out[q.id] = e
  }
  return out
}

/** How an answer reads back: the chip's label, the country's name, or the visitor's own words. */
export function displayValue(reg: Registry, q: Question, value: string | undefined): string {
  if (!value) return ''
  if (q.type === 'country') return countryName(value, reg.locale)
  const chip = q.chips?.find((c) => c.value === value)
  return chip ? (reg.strings[chip.labelKey] ?? value) : value
}

export type ReviewGroup = { id: 'request' | 'contact'; items: Array<{ id: string; labelKey: string; value: string }> }
/** The review screen: the request (purpose and details), then the contact details; answered questions only. */
export function reviewGroups(reg: Registry, answers: Answers): ReviewGroup[] {
  const items = (steps: Array<Question['step']>) => questionsFor(reg, answers).filter((q) => steps.includes(q.step) && answers[q.id]).map((q) => ({ id: q.id, labelKey: q.labelKey, value: displayValue(reg, q, answers[q.id]) }))
  return [{ id: 'request', items: items(['purpose', 'details']) }, { id: 'contact', items: items(['contact']) }]
}

/** The submitted answers (contract §4): the flow's questions only, skipped ones omitted. */
export const submittedAnswers = (reg: Registry, answers: Answers, surface: Surface = 'form'): Record<string, string> =>
  Object.fromEntries(questionsFor(reg, answers, surface).filter((q) => answers[q.id]).map((q) => [q.id, sentValue(q, answers[q.id]!)]))
/** RFQ-FIX-1: what travels for one answer — controls removed, a phone in its normalised form (R3, R9). */
export const sentValue = (q: Question, v: string): string => (q.validation.pattern === 'tel' ? normalizePhone(stripControls(v)) : stripControls(v).trim())

/** Ready to send: every question asked, none invalid. */
export const complete = (reg: Registry, answers: Answers, surface: Surface = 'form'): boolean => !nextQuestion(reg, answers, surface) && Object.keys(validateAll(reg, answers, surface)).length === 0

/**
 * CHAT-FLOW-1: a chat question as the visitor reads it (and as the alert lists it): `{{first}}` is the first name and
 * `{{subject}}` the part (parts) or the chosen service. Without that answer the `<labelKey>_anon` wording is used, so a
 * skipped name never leaves "Great . What company…".
 */
export function questionText(reg: Registry, q: Question, answers: Answers): string {
  const raw = reg.strings[q.labelKey] ?? ''
  const parts = answers.purpose === 'parts'
  const subjectQ = parts ? reg.chatQuestions?.find((x) => x.id === 'parts_part') : reg.chatQuestions?.find((x) => x.id === 'purpose')
  const subjectValue = parts ? answers.parts_part : answers.purpose
  const subject = subjectQ && subjectValue ? displayValue(reg, subjectQ, subjectValue) : ''
  const values: Record<string, string> = { first: (answers.first_name ?? '').trim(), subject }
  const missing = [...raw.matchAll(/\{\{(\w+)\}\}/g)].some((m) => !values[m[1]!])
  const key = missing && reg.strings[`${q.labelKey}_anon`] !== undefined ? `${q.labelKey}_anon` : q.labelKey
  return (reg.strings[key] ?? '').replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? '')
}
