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

/**
 * CT amendments to the OGCS seed: contract §1.1 (2026-10-05), and the Round 5 rulings (CT, 2026-10-05) the CRM seed will
 * serve — the privacy link text, the inline form's continue button, the intake-unavailable line, and `{{offices_link}}` in
 * place of the "call an ICS office" phrase (its link text is `offices.link_text`).
 */
export const CT_STRING_AMENDMENTS: Record<string, string> = {
  'contact.email.q': 'Email',
  'contact.email.hint': 'A work email helps us reach the right team',
  'confirm.body_no_number': 'Request sent. Thank you. A member of our team will review your request and contact you.',
  'privacy.link_text': 'Privacy Policy',
  'form.continue': 'Continue',
  'panel.unavailable': 'Online requests are unavailable right now. Please contact one of {{offices_link}}.',
  'offices.link_text': 'our offices',
  // owner-confirmed response promise (CT 2026-10-05): shown on the confirmation, under the RFQ number
  'confirm.response_time': "We'll respond within one business day.",
  'err.rate_limited': 'Too many requests from this connection. Please wait a few minutes and try again, or call one of {{offices_link}}.',
  'err.server': "Something went wrong and your request wasn't sent. Please try again, or call one of {{offices_link}}.",
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
  errorKeys: { ...(q.required ? { required: 'err.required' } : {}), ...(pattern === 'email' ? { invalid: 'err.email' } : {}), tooLong: 'err.too_long' },
})

/** The contract §1.1 seeded structure, with strings from the copy table. */
export function registryFromCopy(tsv: string): Registry {
  const strings = { ...parseCopyTable(tsv), ...CT_STRING_AMENDMENTS }
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
    question({ id: 'name', step: 'contact', branches: ['all'], type: 'text', required: true, labelKey: 'contact.name.q', maxLength: 120 }),
    question({ id: 'company', step: 'contact', branches: ['all'], type: 'text', required: true, labelKey: 'contact.company.q', maxLength: 160 }),
    question({ id: 'email', step: 'contact', branches: ['all'], type: 'email', required: true, labelKey: 'contact.email.q', placeholderKey: 'contact.email.ph', hintKey: 'contact.email.hint', pattern: 'email', maxLength: 254 }),
    question({ id: 'phone', step: 'contact', branches: ['all'], type: 'tel', required: false, labelKey: 'contact.phone.q', hintKey: 'contact.phone.hint', pattern: 'tel', skippable: true, maxLength: 40 }), // skippable: CT Round 5 ruling 2
    question({ id: 'country', step: 'contact', branches: ['all'], type: 'country', required: true, labelKey: 'contact.country.q', placeholderKey: 'contact.country.search_ph', pattern: 'iso2', maxLength: 2 }),
  ]
  const structure = { purposes, questions, countries: [...COUNTRY_CODES] }
  return {
    registryVersion: `rfq-r1-${createHash('sha256').update(JSON.stringify(structure)).digest('hex').slice(0, 8)}`,
    locale: 'en',
    fallbackLocale: 'en',
    enabled: true,
    steps: ['purpose', 'details', 'contact', 'review', 'confirm'],
    ...structure,
    limits: { maxBodyBytes: 16384, minSecondsToSubmit: 3 },
    strings,
  }
}

let cache: Registry | undefined
export const fixtureRegistry = (): Registry => (cache ??= registryFromCopy(readFileSync(path.join(process.cwd(), 'content/rfq/ogcs-native-rfq-copy-r1.tsv'), 'utf8')))
