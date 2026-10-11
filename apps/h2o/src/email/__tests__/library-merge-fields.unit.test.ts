import { describe, expect, it } from 'vitest'
import { planRows } from '../../crm/library/import'
import { unknownFields, variantsOf } from '../../crm/library/service'
import type { LibraryRow } from '../../crm/library/service'
import { sequenceMergeValues } from '../../crm/ers/engine'
import { ERS_DEFAULTS } from '../../crm/ers/settings'
import { rowFor, SEQUENCE_RESOLVED_FIELDS } from '../../crm/seq/catalogue'
import { fieldsOf, lintTemplate, MERGE_FIELDS, renderTemplate, type TemplateText } from '../templates'

const rows = planRows()
const e1 = rows.filter((row) => String(row.data.program).startsWith('E1.'))
const newFields = [
  'quote_reference', 'opportunity_reference', 'verified_account_name', 'verified_account_or_site_label',
  'safe_salutation', 'verified_asset_label', 'verified_scope_label', 'verified_open_technical_item',
  'verified_question', 'verified_next_review_date', 'verified_open_revision_item', 'verified_site_name',
  'verified_service_window_phrase', 'verified_part_request_label', 'approved_upgrade_objective',
  'approved_condition_or_request_summary', 'approved_missing_part_identification_request',
]

describe('E1 merge-field registry (WP2)', () => {
  it('keeps registered fields separate from real sequence resolver capabilities', async () => {
    const values = await sequenceMergeValues({} as Parameters<typeof sequenceMergeValues>[0], ERS_DEFAULTS, {}, {}, {})
    expect(Object.keys(values).sort()).toEqual([...SEQUENCE_RESOLVED_FIELDS].sort())
    const groups = new Map<string, LibraryRow[]>()
    for (const row of rows) {
      const code = String(row.data.sequence_code)
      groups.set(code, [...(groups.get(code) ?? []), row.data as unknown as LibraryRow])
    }
    const catalogue = [...groups].map(([code, steps]) => rowFor(code, steps))
    expect(catalogue.filter((row) => row.buildable).map((row) => row.code).sort()).toEqual([
      'ICS_MISSING_INFORMATION', 'ICS_RFQ_QUALIFICATION_FOLLOWUP', 'ICS_RFQ_RECEIPT_FIRST_RESPONSE',
    ])
    expect(catalogue.find((row) => row.code === 'ICS_QUOTE_PROPOSAL_FOLLOWUP')?.missingFields).toEqual(
      expect.arrayContaining(['quote_reference', 'verified_scope_label']),
    )
    expect(catalogue.find((row) => row.code === 'ICS_LEGACY_REINTRODUCTION_PILOT')?.missingFields).toEqual(['safe_salutation'])
  })

  it('recognizes every E1 token and leaves no E1 import or Library registry gap', () => {
    expect(e1).toHaveLength(64)
    for (const row of e1) {
      expect(row.data.missing_merge_fields, row.key).toEqual([])
      expect(unknownFields(row.data.merge_fields as string[]), row.key).toEqual([])
      if (row.data.type !== 'EMAIL') continue
      for (const variant of variantsOf(row.data as never, null)) {
        expect(lintTemplate({ ...variant, purpose: 'SEQUENCE' }).filter((p) => p.code === 'TEMPLATE_UNKNOWN_FIELD'), row.key).toEqual([])
      }
    }
    expect(newFields).toHaveLength(17)
    for (const name of newFields) {
      const field = MERGE_FIELDS[name]!
      expect(field.label.trim(), name).not.toBe('')
      expect(field.hint.trim(), name).not.toBe('')
      expect(field.personalizationLevel, name).toMatch(/^LEVEL_[123]_/)
    }
  })

  it('renders none of an E1 email when any required token is absent, blank or null', () => {
    for (const row of e1.filter((r) => r.data.type === 'EMAIL')) {
      for (const variant of variantsOf(row.data as never, null)) {
        const template: TemplateText = { subject: variant.subject, body: variant.body, purpose: 'SEQUENCE' }
        const names = fieldsOf(template)
        const complete = Object.fromEntries(names.map((n) => [n, n === 'first_name' ? 'Avery' : n === 'safe_salutation' ? 'Avery' : 'Confirmed test value']))
        expect(renderTemplate(template, complete).ok, row.key).toBe(true)
        for (const name of names.filter((n) => MERGE_FIELDS[n]?.required)) {
          for (const value of [undefined, '', ' \r\n\t ', null]) {
            const held = renderTemplate(template, { ...complete, [name]: value })
            expect(held, `${row.key}: ${name}`).toEqual({ ok: false, code: 'MERGE_FIELD_MISSING', missing: [name] })
            expect(held).not.toHaveProperty('text')
            expect(held).not.toHaveProperty('subject')
          }
        }
      }
    }
  })

  it('never substitutes a fallback for verified facts, references or approved phrases', () => {
    for (const name of newFields.filter((n) => n !== 'safe_salutation')) {
      expect(MERGE_FIELDS[name]?.required, name).toBe(true)
      expect(MERGE_FIELDS[name]?.fallback, name).toBeUndefined()
    }
    for (const name of newFields.filter((n) => n.startsWith('approved_'))) {
      expect(MERGE_FIELDS[name]?.personalizationLevel, name).toBe('LEVEL_3_DEEP')
    }
  })

  it('keeps the declared safe salutation neutral for absent or invalid names', () => {
    const template = { subject: 'Salutation', body: '{{safe_salutation}}', purpose: 'SEQUENCE' }
    for (const value of [undefined, '', '<script>', 'person@example.invalid', '123456']) {
      expect(renderTemplate(template, { safe_salutation: value })).toEqual({ ok: true, subject: 'Salutation', text: 'Hello\n' })
    }
    expect(renderTemplate(template, { safe_salutation: 'Avery' })).toEqual({ ok: true, subject: 'Salutation', text: 'Avery\n' })
  })

  it('retains control-character cleaning and literal data rendering for new fields', () => {
    const template = { subject: 'Quote {{quote_reference}}', body: '{{verified_scope_label}}', purpose: 'SEQUENCE' }
    const rendered = renderTemplate(template, { quote_reference: 'Q-1\r\nBcc: injected@example.invalid', verified_scope_label: '{{other_field}} <b>literal scope</b>' })
    expect(rendered).toEqual({ ok: true, subject: 'Quote Q-1 Bcc: injected@example.invalid', text: '{{other_field}} <b>literal scope</b>\n' })
  })

  it('leaves E2 skeleton tokens unmapped and every E2 draft non-sendable', () => {
    const e2 = rows.filter((r) => r.data.program === 'E2')
    expect(e2).toHaveLength(24)
    for (const row of e2) {
      expect(row.data.status).toBe('SKELETON')
      expect(row.data.sendable).toBe(false)
      expect(row.data.missing_merge_fields).toEqual(['approved_signature', 'verified_first_name'])
    }
    expect(MERGE_FIELDS.verified_first_name).toBeUndefined()
    expect(MERGE_FIELDS.approved_signature).toBeUndefined()
  })
})
