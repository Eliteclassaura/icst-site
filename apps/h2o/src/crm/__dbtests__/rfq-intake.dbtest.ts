import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { relId } from '../guards'
import { RFQ_NUMBER_PATTERN } from '../ids'
import { ingestTypeformDelivery } from '../intake/typeform/ingest'
import { officeSettings } from '../officeSettings'
import { officeCalendar } from '../offices'
import { firstResponseDueAt } from '../workspace/time'
import { typeformWebhookHandler } from '../intake/typeform/endpoint'
import { intakeConfig, signed, typeformDelivery, SYNTHETIC_SECRET } from '../fixtures/synthetic'
import { as, auditFor, captureLogs, payload, resetCrm, rest, user, type TestUser } from './harness'

type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
const srv = { overrideAccess: true as const, depth: 0 }

const ingest = (
  body: unknown,
  opts: { secret?: string; signature?: string | null; config?: Parameters<typeof intakeConfig>[0] } = {},
) => {
  const s = signed(body, opts.secret ?? SYNTHETIC_SECRET)
  return ingestTypeformDelivery(p, {
    rawBody: s.raw,
    signature: opts.signature === undefined ? s.signature : opts.signature,
    config: intakeConfig(opts.config),
  })
}
const rfqs = async () =>
  (await p.find({ collection: 'crm-rfqs', ...srv, limit: 100 })).docs as unknown as Doc[]
const contacts = async () =>
  (await p.find({ collection: 'crm-contacts', ...srv, limit: 100 })).docs as unknown as Doc[]
const reviews = async () =>
  (await p.find({ collection: 'crm-identity-reviews', ...srv, limit: 100 })).docs as unknown as Doc[]

let fetchSpy: ReturnType<typeof vi.spyOn>
beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
})
beforeEach(async () => {
  await resetCrm()
  // T29/T30: nothing in intake may reach the network or send mail.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('NETWORK_FORBIDDEN_IN_CRM_TESTS')
  })
  vi.spyOn(p, 'sendEmail').mockImplementation(async () => {
    throw new Error('EMAIL_FORBIDDEN_IN_CRM1')
  })
  await p.create({
    collection: 'crm-accounts',
    data: {
      canonical_name: 'Northwind Thermal (synthetic)',
      domains: [{ domain: 'northwind.example.com', domain_status: 'VERIFIED_OWNED' }],
      provenance: { source_system: 'SYNTHETIC_FIXTURE' },
    } as never,
    context: { crmServer: {} },
    ...srv,
  })
})
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(p.sendEmail).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('T10–T12 RFQ creation, rfq_number stability, items', () => {
  it('a verified Typeform delivery persists intake → RFQ → item → contact → account → task → activity', async () => {
    const r = await ingest(
      typeformDelivery({
        quantity: 2,
        hidden: {
          page_path: '/product/synthetic-gear-drive/',
          cta_placement: 'rfq_page',
          product_slug: 'synthetic-gear-drive',
          product_id: '0241',
        },
      }),
    )
    expect(r.status).toBe(200)
    expect(r.outcome).toBe('PROCESSED')
    expect(r.rfqNumber).toMatch(RFQ_NUMBER_PATTERN)
    const [rfq] = await rfqs()
    expect(rfq!.source_system).toBe('TYPEFORM')
    expect(rfq!.contact_match_state).toBe('CREATED_NEW_CONTACT')
    expect(rfq!.account_match_state).toBe('MATCHED_VERIFIED_DOMAIN')
    expect(rfq!.notification_state).toBe('NOT_SENT_DISABLED_IN_CRM1')
    expect((rfq!.attribution as Doc).cta_placement).toBe('rfq_page')
    const items = (await p.find({ collection: 'crm-rfq-items', where: { rfq: { equals: rfq!.id } }, ...srv }))
      .docs as unknown as Doc[]
    expect(items).toHaveLength(1)
    expect(items[0]!.product_slug_source).toBe('synthetic-gear-drive')
    expect(items[0]!.product_id_source).toBe('0241')
    expect(items[0]!.product_resolution_state).toBe('UNRESOLVED') // no product with that slug: not guessed
    expect(items[0]!.requested_quantity).toBe(2)
    const tasks = (await p.find({ collection: 'crm-tasks', where: { rfq: { equals: rfq!.id } }, ...srv }))
      .docs as unknown as Doc[]
    expect(tasks.map((t) => t.kind)).toEqual(['RFQ_FIRST_RESPONSE'])
    // D-1 (owner decision 2026-10-02): due at the end of the next Denver business day after receipt.
    // TEST-CLOCK-FIX-1: the handling office's calendar (its holidays), as the product computes it
    expect(tasks[0]!.due_at).toBe(firstResponseDueAt(new Date(String(rfq!.received_at)), officeCalendar(rfq!.office, await officeSettings(await payload()))).toISOString())
    const acts = (await p.find({ collection: 'crm-activities', where: { rfq: { equals: rfq!.id } }, ...srv }))
      .docs as unknown as Doc[]
    expect(acts.map((a) => a.event_name)).toEqual(
      expect.arrayContaining(['ics.rfq.persisted', 'ics.rfq.submitted']),
    )
    const [c] = await contacts()
    expect(c!.relationship_evidence).toBe('RFQ_REQUEST')
    expect(c!.marketing_eligibility).toBe('UNKNOWN') // an RFQ is not marketing consent
    expect(c!.account_link_confidence).toBe('HIGH_CONFIDENCE')
  })
  it('rfq_number and receipt fields are write-once — REST, Local API with override, and admin alike', async () => {
    await ingest(typeformDelivery())
    const [rfq] = await rfqs()
    const id = String(rfq!.id)
    for (const patch of [
      { rfq_number: 'RFQ-20260101-AAAAAAAA' },
      { received_at: '2020-01-01T00:00:00.000Z' },
      { source_event_id: 'forged' },
      { submitted: { email: 'forged@example.test' } },
      { attribution: { page_path: '/forged/' } },
    ]) {
      const r = await rest.patch(`crm-rfqs/${id}`, admin.token, patch)
      expect(r.status, JSON.stringify(patch)).toBeGreaterThanOrEqual(400)
      await expect(p.update({ collection: 'crm-rfqs', id, data: patch as never, ...srv })).rejects.toThrow(
        /WRITE_ONCE/,
      )
    }
    const after = (await p.findByID({ collection: 'crm-rfqs', id, ...srv })) as unknown as Doc
    expect(after.rfq_number).toBe(rfq!.rfq_number)
    expect(after.received_at).toBe(rfq!.received_at)
  })
  it('an RFQ cannot be deleted by anyone', async () => {
    await ingest(typeformDelivery())
    const [rfq] = await rfqs()
    expect((await rest.delete(`crm-rfqs/${rfq!.id}`, admin.token)).status).toBeGreaterThanOrEqual(400)
    await expect(p.delete({ collection: 'crm-rfqs', id: String(rfq!.id), ...srv })).rejects.toThrow(
      /DELETE_FORBIDDEN/,
    )
  })
  it('a hand-entered RFQ cannot claim a machine source or forge receipt fields', async () => {
    const r = await rest.post('crm-rfqs', sales.token, {
      source_system: 'TYPEFORM',
      source_event_id: 'forged',
      rfq_number: 'RFQ-20260101-AAAAAAAA',
      received_at: '2020-01-01T00:00:00Z',
      submitted: { company: 'Phone enquiry (synthetic)' },
    })
    expect(r.status).toBe(201)
    const d = r.body.doc as Doc
    expect(d.source_system).toBe('MANUAL_ENTRY')
    expect(d.source_event_id ?? null).toBeNull()
    expect(d.rfq_number).not.toBe('RFQ-20260101-AAAAAAAA')
    expect(String(d.received_at).startsWith('2020')).toBe(false)
    expect(d.contact_match_state).toBe('MANUAL')
  })
  it('an RFQ can only join an opportunity of the same account', async () => {
    await ingest(typeformDelivery())
    const [rfq] = await rfqs()
    const other = await p.create({
      collection: 'crm-accounts',
      data: { canonical_name: 'Contoso Cooling (synthetic)' } as never,
      ...as(sales),
    })
    const o = await p.create({
      collection: 'crm-opportunities',
      data: { name: 'Other project', account: other.id, motion: 'REPAIR', owner: sales.id } as never,
      ...as(sales),
    })
    await expect(
      p.update({
        collection: 'crm-rfqs',
        id: String(rfq!.id),
        data: { opportunity: o.id } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/RFQ_OPPORTUNITY_OTHER_ACCOUNT/)
  })
  it('qualifying needs a motion; duplicates are marked by a person with a target and a reason', async () => {
    await ingest(typeformDelivery())
    const [rfq] = await rfqs()
    const id = String(rfq!.id)
    await expect(
      p.update({ collection: 'crm-rfqs', id, data: { status: 'QUALIFIED' } as never, ...as(sales) }),
    ).rejects.toThrow(/QUALIFIED_WITHOUT_MOTION/)
    await expect(
      p.update({
        collection: 'crm-rfqs',
        id,
        data: { status: 'DUPLICATE_OF_EXISTING', status_reason: 'x' } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/DUPLICATE_TARGET_REQUIRED/)
    const q = await p.update({
      collection: 'crm-rfqs',
      id,
      data: { status: 'QUALIFIED', motion: 'PARTS', assignee: sales.id } as never,
      ...as(sales),
    })
    expect(q.assigned_at).toBeTruthy()
    const audit = await auditFor('crm-rfqs', id)
    const last = audit.at(-1)!
    expect(((last.detail as Doc).transitions as Doc).status).toEqual({ from: 'RECEIVED', to: 'QUALIFIED' })
    expect(((last.detail as Doc).transitions as Doc).assignee).toEqual({ from: null, to: sales.id })
  })
})

describe('T13/T14 idempotency, replay and duplicates', () => {
  it('the same event delivered twice creates one intake event and one RFQ', async () => {
    const body = typeformDelivery()
    const a = await ingest(body)
    const b = await ingest(body)
    expect(a.outcome).toBe('PROCESSED')
    expect(b.outcome).toBe('DUPLICATE_DELIVERY_NOOP')
    expect(await rfqs()).toHaveLength(1)
    const events = (await p.find({ collection: 'crm-intake-events', ...srv })).docs as unknown as Doc[]
    expect(events).toHaveLength(1)
    expect(events[0]!.replay_count).toBe(1)
    const tasks = (await p.find({ collection: 'crm-tasks', ...srv })).docs
    expect(tasks).toHaveLength(1)
  })
  it('five concurrent deliveries of one event still yield one RFQ', async () => {
    const body = typeformDelivery()
    const results = await Promise.all(Array.from({ length: 5 }, () => ingest(body)))
    expect(results.filter((r) => r.outcome === 'PROCESSED')).toHaveLength(1)
    expect(await rfqs()).toHaveLength(1)
  })
  it('the same response re-sent under a new event id links to the existing RFQ (business uniqueness)', async () => {
    const body = typeformDelivery({ token: 'tokSameResponse1' })
    await ingest(body)
    const again = await ingest({ ...body, event_id: 'evtResent0001' })
    expect(again.outcome).toBe('DUPLICATE_SUBMISSION_LINKED')
    expect(await rfqs()).toHaveLength(1)
  })
  it('a replay with the same event id but a different payload is quarantined and never applied', async () => {
    const body = typeformDelivery({ eventId: 'evtConflict0001' })
    await ingest(body)
    const changed = typeformDelivery({ eventId: 'evtConflict0001', message: 'A different, tampered request' })
    const r = await ingest(changed)
    expect(r.outcome).toBe('CONFLICTING_REPLAY_QUARANTINED')
    const [rfq] = await rfqs()
    expect((rfq!.submitted as Doc).message).not.toMatch(/tampered/)
    expect((await reviews()).map((x) => x.reason)).toContain('INTAKE_CONFLICTING_PAYLOAD')
  })
  it('a second genuine inquiry with identical content is kept (flagged for review, not discarded)', async () => {
    await ingest(typeformDelivery())
    const r = await ingest(typeformDelivery())
    expect(r.outcome).toBe('PROCESSED_WITH_REVIEW')
    expect(await rfqs()).toHaveLength(2)
    expect((await reviews()).map((x) => x.reason)).toContain('POSSIBLE_DUPLICATE_SUBMISSION')
  })
  it('a failed attempt is retried to completion without duplicating anything', async () => {
    const body = typeformDelivery()
    const orig = p.create.bind(p)
    let failed = false
    const spy = vi.spyOn(p, 'create').mockImplementation((async (args: never) => {
      if (!failed && (args as { collection: string }).collection === 'crm-rfq-items') {
        failed = true
        throw new Error('SIMULATED_TRANSIENT_FAILURE')
      }
      return orig(args)
    }) as never)
    const withItem = {
      ...body,
      form_response: {
        ...body.form_response,
        hidden: { page_path: '/p/', cta_placement: 'header_action', product_slug: 'synthetic-slug' },
      },
    }
    const first = await ingest(withItem)
    expect(first.status).toBe(500)
    expect(first.outcome).toBe('FAILED_RETRYABLE')
    expect(await rfqs()).toHaveLength(1) // the RFQ was persisted before the failure and survives it
    spy.mockRestore()
    const second = await ingest(withItem)
    expect(second.outcome).toBe('PROCESSED')
    expect(await rfqs()).toHaveLength(1)
    expect((await p.find({ collection: 'crm-rfq-items', ...srv })).docs).toHaveLength(1)
    expect((await p.find({ collection: 'crm-tasks', ...srv })).docs).toHaveLength(1)
    const received = await p.find({
      collection: 'crm-activities',
      where: { type: { equals: 'INTAKE_RECEIVED' } },
      ...srv,
    })
    expect(received.totalDocs).toBe(1) // the retry did not re-log the receipt
  })
})

describe('T15–T18 conservative identity', () => {
  it('email casing differences match the same contact (deterministic)', async () => {
    await ingest(typeformDelivery({ email: 'Avery.Synthetic@Northwind.Example.com' }))
    await ingest(
      typeformDelivery({
        email: 'avery.synthetic@northwind.example.com',
        message: 'second, different request',
      }),
    )
    const cs = await contacts()
    expect(cs).toHaveLength(1)
    const all = await rfqs()
    expect(all.map((r) => r.contact_match_state).sort()).toEqual([
      'CREATED_NEW_CONTACT',
      'MATCHED_EXACT_EMAIL',
    ])
  })
  it('exact email with a different name: left UNLINKED (ambiguous), names NOT overwritten, review opened', async () => {
    await ingest(typeformDelivery({ first: 'Avery', last: 'Synthetic' }))
    const second = await ingest(typeformDelivery({ first: 'Morgan', last: 'Other', message: 'x' }))
    expect(second.outcome).toBe('PROCESSED_WITH_REVIEW')
    const all = await contacts()
    expect(all).toHaveLength(1)
    expect(all[0]!.first_name).toBe('Avery')
    const rfq = (await rfqs()).find((r) => String(r.id) === second.rfqId)!
    expect(rfq.contact ?? null).toBeNull()
    expect(rfq.status).toBe('NEEDS_REVIEW')
    const review = (await reviews()).find((r) => r.reason === 'EMAIL_MATCH_NAME_MISMATCH')!
    expect(relId(review.contact)).toBe(String(all[0]!.id))
    expect(relId(review.rfq)).toBe(second.rfqId)
  })
  it('same name, different email: two contacts, never merged, review opened', async () => {
    await ingest(typeformDelivery({ email: 'avery.synthetic@northwind.example.com' }))
    await ingest(typeformDelivery({ email: 'a.synthetic@contoso.example.com', message: 'y' }))
    expect(await contacts()).toHaveLength(2)
    expect((await reviews()).map((r) => r.reason)).toContain('SAME_NAME_DIFFERENT_EMAIL')
  })
  it('a consumer mailbox never links an account, even with a company string', async () => {
    await ingest(
      typeformDelivery({ email: 'avery.synthetic@gmail.com', company: 'Northwind Thermal (synthetic)' }),
    )
    const [rfq] = await rfqs()
    expect(rfq!.account ?? null).toBeNull()
    expect(rfq!.account_match_state).toBe('FREE_EMAIL_DOMAIN')
  })
  it('a company-name match without a verified domain is a candidate for review, not a link', async () => {
    await ingest(
      typeformDelivery({ email: 'buyer@unverified.example.com', company: 'Northwind Thermal (synthetic)' }),
    )
    const [rfq] = await rfqs()
    expect(rfq!.account ?? null).toBeNull()
    expect(rfq!.status).toBe('NEEDS_REVIEW')
    expect((await reviews()).map((r) => r.reason)).toContain('COMPANY_NAME_MATCH_UNVERIFIED')
  })
  it('two accounts claiming one domain: refused at write time, so matching can never be ambiguous silently', async () => {
    await expect(
      p.create({
        collection: 'crm-accounts',
        data: {
          canonical_name: 'Northwind Holdings (synthetic)',
          domains: [{ domain: 'northwind.example.com', domain_status: 'VERIFIED_ALIAS' }],
        } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/VERIFIED_DOMAIN_ON_OTHER_ACCOUNT/)
  })
  it('an existing contact linked to another account is not relinked by intake; conflict goes to review', async () => {
    const other = await p.create({
      collection: 'crm-accounts',
      data: { canonical_name: 'Contoso Cooling (synthetic)' } as never,
      ...as(sales),
    })
    await p.create({
      collection: 'crm-contacts',
      data: {
        email: 'avery.synthetic@northwind.example.com',
        account: other.id,
        account_link_confidence: 'VERIFIED',
      } as never,
      ...as(sales),
    })
    await ingest(typeformDelivery())
    const [c] = await contacts()
    expect(relId(c!.account)).toBe(String(other.id))
    const [rfq] = await rfqs()
    expect(rfq!.account ?? null).toBeNull()
    expect(rfq!.account_match_state).toBe('CONTACT_ACCOUNT_CONFLICT_REVIEW')
  })
})

describe('T23–T25, T27 verification, malformed input and missing context', () => {
  it('an invalid signature is rejected and nothing at all is stored', async () => {
    const r = await ingest(typeformDelivery(), { secret: 'test-wrong-secret-000000000000000' })
    expect(r.status).toBe(401)
    const missing = await ingest(typeformDelivery(), { signature: null })
    expect(missing.status).toBe(401)
    const garbage = await ingest(typeformDelivery(), { signature: 'sha256=not-base64!!' })
    expect(garbage.status).toBe(401)
    for (const slug of [
      'crm-intake-events',
      'crm-rfqs',
      'crm-contacts',
      'crm-tasks',
      'crm-identity-reviews',
    ] as const)
      expect((await p.find({ collection: slug, ...srv })).totalDocs, slug).toBe(0)
  })
  it('a signed but non-JSON body is quarantined as evidence, with no RFQ', async () => {
    const raw = '{not json'
    const r = await ingestTypeformDelivery(p, {
      rawBody: raw,
      signature: signed(raw).signature,
      config: intakeConfig(),
    })
    expect(r.outcome).toBe('QUARANTINED_MALFORMED')
    expect(await rfqs()).toHaveLength(0)
  })
  it('an unsupported event type or another form id is quarantined, not processed', async () => {
    const t = await ingest({ ...typeformDelivery(), event_type: 'form_deleted' })
    expect(t.outcome).toBe('QUARANTINED_UNSUPPORTED')
    const f = await ingest(typeformDelivery({ formId: 'OtherForm99' }))
    expect(f.outcome).toBe('QUARANTINED_UNSUPPORTED')
    expect(await rfqs()).toHaveLength(0)
  })
  it('a delivery with no field map still persists the RFQ, links nothing, and asks for review', async () => {
    const r = await ingest(typeformDelivery(), { config: { fieldMap: null } })
    expect(r.outcome).toBe('PROCESSED_WITH_REVIEW')
    const [rfq] = await rfqs()
    expect(rfq!.contact_match_state).toBe('FIELD_MAPPING_MISSING')
    expect(rfq!.contact ?? null).toBeNull()
    expect(await contacts()).toHaveLength(0)
  })
  it('an invalid email persists the RFQ without a contact', async () => {
    const r = await ingest(typeformDelivery({ email: 'not-an-address' }))
    expect(r.outcome).toBe('PROCESSED_WITH_REVIEW')
    const [rfq] = await rfqs()
    expect(rfq!.contact_match_state).toBe('NO_VALID_EMAIL')
    expect(await contacts()).toHaveLength(0)
  })
  it('missing optional context fabricates nothing: no item, no attribution, no product', async () => {
    await ingest(typeformDelivery({ hidden: {}, quantity: null }))
    const [rfq] = await rfqs()
    const attr = rfq!.attribution as Doc
    for (const k of ['page_path', 'cta_placement', 'utm_source', 'utm_campaign'])
      expect(attr[k] ?? null).toBeNull()
    expect((await p.find({ collection: 'crm-rfq-items', ...srv })).totalDocs).toBe(0)
    const [c] = await contacts()
    expect(c!.country_code ?? null).toBeNull()
  })
  it('hostile context (traversal, protocol-relative, unknown keys) is rejected, never stored', async () => {
    await ingest(
      typeformDelivery({
        hidden: {
          page_path: '//evil.example/x',
          product_path: '/a/../../etc',
          email: 'x@example.test',
          cta_placement: 'ok',
        },
      }),
    )
    const [rfq] = await rfqs()
    expect((rfq!.attribution as Doc).page_path ?? null).toBeNull()
    expect((rfq!.attribution as Doc).cta_placement).toBe('ok')
    expect(rfq!.status).toBe('NEEDS_REVIEW')
  })
  it('a product is linked only on an exact slug', async () => {
    const product = (await p.find({ collection: 'products', limit: 1, ...srv })).docs[0] as unknown as
      Doc | undefined
    // The synthetic DB has no catalog rows; unresolved is the honest answer.
    expect(product).toBeUndefined()
    await ingest(
      typeformDelivery({ hidden: { page_path: '/p/', cta_placement: 'header_action', product_slug: 'synthetic-gear' } }),
    )
    const items = (await p.find({ collection: 'crm-rfq-items', ...srv })).docs as unknown as Doc[]
    expect(items[0]!.product ?? null).toBeNull()
    expect(items[0]!.product_resolution_state).toBe('UNRESOLVED')
  })
})

describe('product context resolves only on an exact slug', () => {
  it('links the product whose slug equals the submitted slug, and nothing for a near miss', async () => {
    const product = await p.create({
      collection: 'products',
      data: {
        title: 'Synthetic Gear Drive',
        slug: 'synthetic-gear-drive',
        commerce_mode: 'QUOTE_ONLY',
        manufacturer_evidence: { state: 'UNKNOWN', unknown_reason: 'NO_BRAND_TERM_IN_ESTATE' },
      } as never,
      draft: true,
      overrideAccess: true,
    })
    await ingest(
      typeformDelivery({
        hidden: { page_path: '/p/', cta_placement: 'header_action', product_slug: 'synthetic-gear-drive' },
      }),
    )
    await ingest(
      typeformDelivery({
        hidden: { page_path: '/p/', cta_placement: 'header_action', product_slug: 'synthetic-gear-drive-2' },
        message: 'near miss',
      }),
    )
    const items = (await p.find({ collection: 'crm-rfq-items', sort: 'createdAt', ...srv }))
      .docs as unknown as Doc[]
    const exact = items.find((i) => i.product_slug_source === 'synthetic-gear-drive')!
    const near = items.find((i) => i.product_slug_source === 'synthetic-gear-drive-2')!
    expect(relId(exact.product)).toBe(String(product.id))
    expect(exact.product_resolution_state).toBe('RESOLVED_EXACT_SLUG')
    expect(near.product ?? null).toBeNull()
    expect(near.product_resolution_state).toBe('UNRESOLVED')
    // A person cannot attach a product whose slug differs from what was submitted.
    await expect(
      p.update({
        collection: 'crm-rfq-items',
        id: String(near.id),
        data: { product: product.id } as never,
        ...as(sales),
      }),
    ).rejects.toThrow(/PRODUCT_NOT_EXACT/)
    await p.delete({ collection: 'products', id: product.id, overrideAccess: true })
  })
})

describe('T43 no PII in logs', () => {
  it('intake logs carry codes and ids only — never the email, name, phone or message', async () => {
    const cap = captureLogs(p)
    try {
      await ingest(
        typeformDelivery({
          email: 'pii.probe@northwind.example.com',
          first: 'Probe',
          last: 'Person',
          phone: '+1 555 0199',
          message: 'Probe secret message text',
        }),
      )
      await ingest(typeformDelivery({ email: 'pii.probe@northwind.example.com' }), {
        secret: 'test-wrong-secret-000000000000000',
      })
    } finally {
      cap.restore()
    }
    const text = cap.lines.join('\n')
    expect(cap.lines.length).toBeGreaterThan(0)
    for (const needle of ['pii.probe', 'Probe', '555 0199', 'secret message', SYNTHETIC_SECRET])
      expect(text).not.toContain(needle)
  })
})

describe('T27 missing security configuration fails closed (HTTP adapter)', () => {
  const call = async (env: Record<string, string | undefined>) => {
    const saved = { ...process.env }
    Object.assign(process.env, env)
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]
    try {
      const raw = JSON.stringify(typeformDelivery())
      const req = {
        payload: p,
        headers: new Headers({ 'typeform-signature': signed(raw).signature }),
        text: async () => raw,
      } as never
      return await typeformWebhookHandler(req)
    } finally {
      process.env = saved
    }
  }
  it('no secret → 503 and nothing stored', async () => {
    const r = await call({
      H2O_CRM_TYPEFORM_WEBHOOK_SECRET: undefined,
      H2O_TYPEFORM_FORM_ID: 'SynthForm01',
      H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
    })
    expect(r.status).toBe(503)
    expect(await rfqs()).toHaveLength(0)
  })
  it('configured but not enabled → 404, indistinguishable from an unmounted route; nothing stored', async () => {
    for (const flag of [undefined, '0', 'true', ' 1']) {
      const r = await call({
        H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
        H2O_TYPEFORM_FORM_ID: 'SynthForm01',
        H2O_CRM_TYPEFORM_INGEST_ENABLED: flag,
      })
      expect(r.status, String(flag)).toBe(404)
    }
    expect(await rfqs()).toHaveLength(0)
    expect((await p.find({ collection: 'crm-intake-events', ...srv })).totalDocs).toBe(0)
  })
  it('the adapter is mounted exactly once: POST /crm/intake/typeform, root endpoint, nowhere else', async () => {
    const root = p.config.endpoints ?? []
    const mine = root.filter((e) => (e as { handler?: unknown }).handler === typeformWebhookHandler)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ path: '/crm/intake/typeform', method: 'post' })
    const collectionEndpoints = Object.values(p.collections).flatMap((c) => c.config.endpoints || [])
    expect(collectionEndpoints.some((e) => (e as { handler?: unknown }).handler === typeformWebhookHandler)).toBe(false)
  })
})
