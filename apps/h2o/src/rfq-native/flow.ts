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

/** The questions this visitor is asked, in order: purpose; the branch's details, then its extra questions; notes; contact. */
export function questionsFor(reg: Registry, answers: Answers): Question[] {
  const byStep = (step: Question['step']) => reg.questions.filter((q) => q.step === step)
  const purpose = reg.purposes.find((p) => p.value === answers.purpose)
  const purposeQ = byStep('purpose')
  const contact = byStep('contact')
  if (!purpose) return [...purposeQ, ...contact]
  const details = byStep('details')
  const branch = details.filter((q) => q.branches.includes(purpose.branch))
  const extra = (purpose.extraQuestions ?? []).map((id) => reg.questions.find((q) => q.id === id)).filter((q): q is Question => Boolean(q))
  const all = details.filter((q) => q.branches.includes('all'))
  return [...purposeQ, ...branch, ...extra, ...all, ...contact]
}

/** The next question not yet answered or skipped; undefined when the visitor can review. */
export const nextQuestion = (reg: Registry, answers: Answers): Question | undefined => questionsFor(reg, answers).find((q) => !(q.id in answers))

/** Keep only the answers the current flow asks for. */
export function prune(reg: Registry, answers: Answers): Answers {
  const ids = new Set(questionsFor(reg, answers).map((q) => q.id))
  return Object.fromEntries(Object.entries(answers).filter(([k]) => ids.has(k)))
}

/** Record an answer (trimmed; '' = skipped). */
export const answer = (reg: Registry, answers: Answers, id: string, value: string): Answers => prune(reg, { ...answers, [id]: value.trim() })

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
export function migrate(reg: Registry, answers: Answers): Answers {
  const kept = Object.fromEntries(Object.entries(answers).filter(([id, v]) => {
    const q = reg.questions.find((x) => x.id === id)
    return q && (q.type !== 'chips' || v === '' || q.chips?.some((c) => c.value === v))
  }))
  return prune(reg, kept)
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i
const TEL = /^\+?[0-9 ().-]{4,40}$/

/** The error key (and placeholder values) for one answer, or null. `surface` picks the chat or form "required" wording. */
export function validate(reg: Registry, q: Question, value: string | undefined, surface: 'chat' | 'form' = 'chat'): { key: string; values?: Record<string, string> } | null {
  const v = (value ?? '').trim()
  const required = surface === 'form' ? 'err.required.form' : (q.errorKeys.required ?? 'err.required')
  if (!v) return q.required ? { key: required } : null
  if (v.length > q.validation.maxLength) return { key: q.errorKeys.tooLong, values: { max: String(q.validation.maxLength) } }
  if (q.validation.pattern === 'email' && !EMAIL.test(v)) return { key: q.errorKeys.invalid ?? 'err.email' }
  if (q.validation.pattern === 'tel' && !TEL.test(v)) return { key: q.errorKeys.invalid ?? required }
  if (q.validation.pattern === 'iso2' && !reg.countries.includes(v)) return { key: q.errorKeys.invalid ?? required }
  if (q.type === 'chips' && !q.chips?.some((c) => c.value === v)) return { key: q.errorKeys.invalid ?? required }
  return null
}

/** Every error in the flow (the inline form checks everything at once; the chat checks as it goes). */
export function validateAll(reg: Registry, answers: Answers, surface: 'chat' | 'form'): Record<string, { key: string; values?: Record<string, string> }> {
  const out: Record<string, { key: string; values?: Record<string, string> }> = {}
  for (const q of questionsFor(reg, answers)) {
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
export const submittedAnswers = (reg: Registry, answers: Answers): Record<string, string> =>
  Object.fromEntries(questionsFor(reg, answers).filter((q) => answers[q.id]).map((q) => [q.id, answers[q.id]!]))

/** Ready to send: every question asked, none invalid. */
export const complete = (reg: Registry, answers: Answers): boolean => !nextQuestion(reg, answers) && Object.keys(validateAll(reg, answers, 'chat')).length === 0
