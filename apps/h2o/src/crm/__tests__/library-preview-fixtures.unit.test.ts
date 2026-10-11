import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fieldsOf, renderTemplate, SEED_TEMPLATES } from '../../email/templates'
import { ERS_DEFAULTS, invalidateErsSettings } from '../ers/settings'
import { sequenceMergeValues } from '../ers/engine'
import { planRows } from '../library/import'
import { renderSample, SAMPLE_RECIPIENTS, sampleRecipients, variantsOf } from '../library/service'

// Render the actual async page with a synthetic session and read-only payload; no DB, customer record or transport.
const pageState = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  template: null as Record<string, unknown> | null,
  payload: null as Payload | null,
}))
vi.mock('../../app/(crm)/crm/session', () => ({
  requireCrmSession: async () => ({ payload: pageState.payload, isAdmin: false, user: { id: 'sample-user' } }),
}))
vi.mock('../../email/settings-page', () => ({ stepUpLeft: async () => 0 }))
vi.mock('../../app/(crm)/crm/email-revenue/_components/LibraryForms', () => ({
  ApprovalModeForm: () => null,
  StepUpPanel: () => null,
}))
vi.mock('../../app/(crm)/crm/email-revenue/_components/EmailRevenueFrame', () => ({
  EmailRevenueFrame: ({ children }: { children: ReactNode }) => createElement('main', null, children),
}))
import LibraryRowPage from '../../app/(crm)/crm/email-revenue/library/[id]/page'

const E1 = planRows().filter((row) => String(row.data.program).startsWith('E1.'))
const SIGNATURE = { signer: 'Example Preview Team', email: 'preview@example.test' }
const settings = { ...ERS_DEFAULTS, enabled: false, signature: SIGNATURE }

function readOnlyPayload(signature = SIGNATURE) {
  const findGlobal = vi.fn(async () => ({ enabled: false, signature }))
  const findByID = vi.fn(async ({ collection }: { collection: string }) =>
    collection === 'crm-email-templates' ? pageState.template : pageState.row,
  )
  return { findGlobal, findByID, payload: { findGlobal, findByID } as unknown as Payload }
}

beforeEach(() => {
  invalidateErsSettings()
  pageState.row = null
  pageState.template = null
  pageState.payload = readOnlyPayload().payload
})

describe('WP1: complete synthetic Library preview fixtures', () => {
  it('covers all 64 E1 rows and every copy/subject variant with no missing A/B fields', async () => {
    expect(E1).toHaveLength(64)
    const samples = (await sampleRecipients(pageState.payload!)).filter((sample) => sample.id !== 'c')
    let copies = 0
    for (const row of E1) {
      const variants = variantsOf(row.data, null)
      copies += variants.length
      for (const sample of samples) {
        for (const field of row.data.merge_fields as string[]) {
          expect(sample.values[field], `${row.key} / Sample ${sample.id} / ${field}`).toBeTruthy()
        }
        for (const variant of variants) {
          const rendered = renderSample(variant.subject, variant.body, sample.values)
          expect(rendered.missing, `${row.key} / ${variant.label} / Sample ${sample.id}`).toEqual([])
          expect(rendered.subject + rendered.body).not.toMatch(/«Missing:|\{\{/)
        }
      }
    }
    expect(E1.filter((row) => row.data.type === 'EMAIL')).toHaveLength(40)
    expect(copies).toBeGreaterThanOrEqual(83)
  })

  it('marks every verified fact and approved phrase as fake sample data', async () => {
    for (const sample of (await sampleRecipients(pageState.payload!)).filter((sample) => sample.id !== 'c')) {
      for (const [field, value] of Object.entries(sample.values)) {
        if (field.startsWith('verified_') || field.startsWith('approved_')) {
          expect(value, `${sample.id} / ${field}`).toContain('(sample)')
        }
      }
      expect(sample.values.first_name).toMatch(/^\p{L}[\p{L}\p{M} '’.-]{0,39}$/u)
      expect(sample.values.customer_first_name).toMatch(/^\p{L}[\p{L}\p{M} '’.-]{0,39}$/u)
    }
  })

  it('reads the signature through the real SIGNATURES-1 resolution exactly like a real sequence merge, without a contact or write', async () => {
    const fake = readOnlyPayload()
    const samples = await sampleRecipients(fake.payload)
    const engineValues = await sequenceMergeValues(fake.payload, settings, {}, {}, {})
    // SIGNATURES-1: the standard signature is read first; this stub has none, so it falls back to the engine team lines.
    expect(fake.findGlobal).toHaveBeenCalledWith({ slug: 'crm-signatures', depth: 0, overrideAccess: true })
    expect(fake.findByID).not.toHaveBeenCalled()
    for (const sample of samples.filter((sample) => sample.id !== 'c')) {
      expect(sample.values.sequence_signature).toBe(engineValues.sequence_signature)
      expect(sample.values.email_signature).toBe(engineValues.sequence_signature)
      expect(sample.values.sequence_signature).toBe('Example Preview Team\npreview@example.test')
    }
    expect(samples.find((sample) => sample.id === 'c')!.values).toEqual({ first_name: 'Sam' })
    expect(SAMPLE_RECIPIENTS[0]!.values).not.toHaveProperty('sequence_signature')
  })

  it('SIGNATURES-1: a stored standard signature is what A and B (and a sequence merge) carry', async () => {
    const findGlobal = vi.fn(async ({ slug }: { slug: string }) => (slug === 'crm-signatures' ? { standard_text: 'Standard Team\nStandard line' } : { enabled: false, signature: SIGNATURE }))
    const findByID = vi.fn(async () => ({ id: 'u1', signature_use_standard: false, signature_text: 'Own Name\nOwn Title' }))
    const payload = { findGlobal, findByID } as unknown as Payload
    const seq = await sampleRecipients(payload)
    expect(seq[0]!.values.sequence_signature).toBe('Standard Team\nStandard line')
    expect(seq[0]!.values.email_signature).toBe('Standard Team\nStandard line')
    const viewer = await sampleRecipients(payload, 'u1')
    expect(viewer[0]!.values.email_signature).toBe('Own Name\nOwn Title')
    expect(viewer[0]!.values.sequence_signature).toBe('Standard Team\nStandard line')
    expect(viewer.find((x) => x.id === 'c')!.values).toEqual({ first_name: 'Sam' })
    expect((await sequenceMergeValues(payload, settings, {}, {}, {})).sequence_signature).toBe('Standard Team\nStandard line')
  })

  it('uses the same engine defaults when settings cannot be read, without turning the engine on', async () => {
    const payload = { findGlobal: vi.fn(async () => { throw new Error('Synthetic read failure') }) } as unknown as Payload
    const samples = await sampleRecipients(payload)
    expect(samples[0]!.values.sequence_signature).toBe(
      [ERS_DEFAULTS.signature.signer, ERS_DEFAULTS.signature.email].filter(Boolean).join('\n'),
    )
    expect(ERS_DEFAULTS.enabled).toBe(false)
  })

  it('keeps C incomplete and reports the precise missing names for every E1 variant', async () => {
    const sample = (await sampleRecipients(pageState.payload!)).find((sample) => sample.id === 'c')!
    for (const row of E1) {
      for (const variant of variantsOf(row.data, null)) {
        const expected = fieldsOf({ ...variant, purpose: 'SEQUENCE' }).filter((name) => name !== 'first_name')
        const rendered = renderSample(variant.subject, variant.body, sample.values)
        expect(rendered.missing, `${row.key} / ${variant.label}`).toEqual(expected)
        for (const field of expected) expect(rendered.subject + rendered.body).toContain(`«Missing: ${field}»`)
      }
    }
    expect(renderSample('Example', '{{sequence_signature}}', sample.values).missing).toEqual(['sequence_signature'])
  })

  it('also completes every shipped linked T/E11 template, selecting choices only in the sample preview', async () => {
    const samples = (await sampleRecipients(pageState.payload!)).filter((sample) => sample.id !== 'c')
    for (const template of SEED_TEMPLATES) {
      for (const sample of samples) {
        const preview = renderSample(template.subject, template.body, sample.values)
        expect(preview.missing, `${template.code} / ${sample.id}`).toEqual([])
        expect(preview.subject + preview.body).not.toMatch(/«Missing:|\{\{/)
      }
    }
    const t5 = SEED_TEMPLATES.find((template) => template.code === 'T5')!
    const preview = renderSample(t5.subject, t5.body, samples[0]!.values)
    expect(preview.subject).toContain('Scheduling a call')
    expect(preview.body).toContain('set up a call')
    // The actual send renderer still refuses a missing sender-selected choice.
    expect(renderTemplate(t5, samples[0]!.values)).toEqual({ ok: false, code: 'CHOICE_MISSING', missing: ['0'] })
    expect(renderSample('Example', '{{choice:only-one}}', {})).toEqual({
      subject: 'Example', body: '«Missing: choice:only-one»', missing: ['choice:only-one'],
    })
  })
})

async function renderPage(row: Record<string, unknown>, as: string, variant = 0, template: Record<string, unknown> | null = null) {
  pageState.row = { ...row, id: 'sample-row', ...(template ? { linked_template: 'sample-template' } : {}) }
  pageState.template = template
  return renderToStaticMarkup(await LibraryRowPage({
    params: Promise.resolve({ id: 'sample-row' }),
    searchParams: Promise.resolve({ as, v: String(variant) }),
  }))
}

describe('WP1: rendered Library preview status', () => {
  it('shows Pass for A/B on every E1 email and variant, and keeps task steps without an email preview', async () => {
    for (const row of E1) {
      for (const as of ['a', 'b']) {
        const variants = variantsOf(row.data, null)
        if (row.data.type !== 'EMAIL') {
          const html = await renderPage(row.data, as)
          expect(html, row.key).not.toContain('aria-label="Email preview"')
          continue
        }
        for (let variant = 0; variant < variants.length; variant++) {
          const html = await renderPage(row.data, as, variant)
          expect(html, `${row.key} / ${as} / ${variant}`).toContain('role="status">Pass: no missing sample merge fields.')
          expect(html).not.toContain('This email would be held:')
          expect(html).not.toContain('«Missing:')
        }
      }
    }
  })

  it('shows the specific C hold reason and missing markers in the actual page', async () => {
    const quote = E1.find((row) => row.data.step_code === 'QUOTE_TRANSMITTAL')!
    const html = await renderPage(quote.data, 'c')
    expect(html).toContain('role="status">This email would be held: missing quote_reference, verified_scope_label.')
    expect(html).toContain('«Missing: quote_reference»')
    expect(html).toContain('«Missing: verified_scope_label»')
    expect(html).not.toContain('Pass: no missing sample merge fields.')
  })

  it('renders the settings signature in a linked E11 preview and holds C for its missing signature', async () => {
    const template = SEED_TEMPLATES.find((template) => template.code === 'E11_QUAL_1')!
    expect(template).toBeDefined()
    const row = { program: 'E1.1', type: 'EMAIL', status: 'LINKED', merge_fields: fieldsOf(template), step: 1, sequence_label: 'Example linked sequence' }
    const complete = await renderPage(row, 'a', 0, template)
    expect(complete).toContain('Example Preview Team\npreview@example.test')
    expect(complete).toContain('Pass: no missing sample merge fields.')
    const missing = await renderPage(row, 'c', 0, template)
    expect(missing).toContain('This email would be held: missing rfq_reference, sequence_signature.')
    expect(missing).not.toContain('Pass: no missing sample merge fields.')
  })

  it('keeps E2 skeletons disabled with unresolved activation tokens and no Pass status', async () => {
    const skeleton = planRows().find((row) => row.data.program === 'E2')!.data
    const html = await renderPage(skeleton, 'a')
    expect(skeleton.status).toBe('SKELETON')
    expect(skeleton.sendable).toBe(false)
    expect(html).toContain('Skeleton')
    expect(html).toContain('«Missing: verified_first_name»')
    expect(html).toContain('«Missing: approved_signature»')
    expect(html).not.toContain('Pass: no missing sample merge fields.')
  })
})
