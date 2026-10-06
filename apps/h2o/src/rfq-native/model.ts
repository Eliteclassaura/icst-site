/**
 * Native RFQ: the registry model, exactly as H2O_NATIVE_RFQ_REGISTRY_CONTRACT_R1 §1 defines it (CRM/Runtime Factory; CT
 * accepted 2026-10-05, e0eab741). Client-safe: types and pure helpers only. The UI renders every visible string from
 * `strings` by its OGCS key; nothing is worded in code.
 */
export type BranchName = 'towers' | 'service' | 'parts' | 'other'
export type PurposeValue = 'new_tower' | 'repair' | 'upgrade' | 'inspection' | 'rebuild' | 'parts' | 'other'
export type Purpose = { value: PurposeValue; labelKey: string; branch: BranchName; extraQuestions?: string[] }
export type QuestionType = 'chips' | 'text' | 'textarea' | 'number_or_text' | 'email' | 'tel' | 'country'
export type Question = {
  id: string
  step: 'purpose' | 'details' | 'contact'
  branches: Array<'all' | BranchName>
  type: QuestionType
  required: boolean
  labelKey: string
  placeholderKey?: string
  hintKey?: string
  chips?: Array<{ value: string; labelKey: string }>
  skippable?: boolean
  validation: { maxLength: number; pattern?: 'email' | 'tel' | 'iso2' }
  errorKeys: { required?: string; invalid?: string; tooLong: 'err.too_long' }
}
export type Registry = {
  registryVersion: string
  locale: 'en' | 'ja' | 'th'
  fallbackLocale: 'en'
  enabled: boolean
  steps: ['purpose', 'details', 'contact', 'review', 'confirm']
  purposes: Purpose[]
  questions: Question[]
  countries: string[]
  limits: { maxBodyBytes: number; minSecondsToSubmit: number }
  strings: Record<string, string>
}

/** A registry string, placeholders filled. A missing key renders nothing (the server merges the EN fallback). */
export const t = (reg: Registry, key: string | undefined, values: Record<string, string> = {}): string =>
  key ? (reg.strings[key] ?? '').replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? '') : ''
