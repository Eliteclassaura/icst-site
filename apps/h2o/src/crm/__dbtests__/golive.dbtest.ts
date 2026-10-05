import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { PASSWORD_EMAIL_DISABLED_MESSAGE } from '../../auth/password-email'
import { relId } from '../guards'
import { RFQ_NUMBER_PATTERN } from '../ids'
import { MAX_BODY_BYTES } from '../intake/typeform/endpoint'
import { SYNTHETIC_FIELD_MAP, SYNTHETIC_FORM_ID, SYNTHETIC_SECRET, signed, typeformDelivery } from '../fixtures/synthetic'
import { loadFollowUps, loadMyWork, loadRfq } from '../workspace/queries'
import { createManualInquiry } from '../workspace/manualInquiry'
import { endOfBusinessDay, firstResponseDueAt } from '../workspace/time'
import { uuidv7 } from '../ids'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { captureLogs, payload, resetCrm, rest, user, userEmail, type TestUser } from './harness'

/**
 * CRM go-live Pass 1 (Control Tower 2026-10-02): the mounted Typeform intake endpoint, driven through the
 * app's real REST route handler exactly as Typeform would reach it, plus the launch rules that ride with it
 * (genuine product context, ambiguous identity unlinked, suppression honoured, no password email, UI-1 M1/M4).
 * Synthetic only: RFC 2606 addresses, invented companies, a test-only signing secret.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
let S: CrmSession
const srv = { overrideAccess: true as const, depth: 0 }
const ENABLED = {
  H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
  H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
  H2O_TYPEFORM_FORM_ID: SYNTHETIC_FORM_ID,
  H2O_CRM_TYPEFORM_FIELD_MAP: JSON.stringify(SYNTHETIC_FIELD_MAP),
}
const ENV_KEYS = Object.keys(ENABLED)
let savedEnv: Record<string, string | undefined> = {}

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

/** POST to the mounted endpoint through `src/app/(payload)/api/[...slug]/route.ts`. */
async function webhook(opts: {
  body?: string | ReadableStream<Uint8Array>
  signature?: string | null
  contentType?: string | null
  contentLength?: string
  path?: string
}): Promise<{ status: number; body: Doc; headers: Headers }> {
  const path = opts.path ?? 'crm/intake/typeform/'
  const url = new URL(`/api/${path}`, 'http://127.0.0.1:3200')
  const headers = new Headers()
  if (opts.contentType !== null) headers.set('content-type', opts.contentType ?? 'application/json')
  if (opts.signature) headers.set('typeform-signature', opts.signature)
  if (opts.contentLength) headers.set('content-length', opts.contentLength)
  const init: RequestInit & { duplex?: 'half' } = { method: 'POST', headers, body: opts.body }
  if (opts.body instanceof ReadableStream) init.duplex = 'half'
  const req = new Request(url, init)
  const slug = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean)
  const res = await (POST as never as (r: Request, c: { params: Promise<{ slug: string[] }> }) => Promise<Response>)(
    req,
    { params: Promise.resolve({ slug }) },
  )
  let json: Doc
  try {
    json = (await res.json()) as Doc
  } catch {
    json = {}
  }
  return { status: res.status, body: json, headers: res.headers }
}
const deliver = (body: unknown, secret = SYNTHETIC_SECRET) => {
  const s = signed(body, secret)
  return webhook({ body: s.raw, signature: s.signature })
}
const count = async (collection: 'crm-rfqs' | 'crm-intake-events' | 'crm-contacts' | 'crm-rfq-items') =>
  (await p.find({ collection, ...srv, limit: 0 })).totalDocs
const rfqs = async () => (await p.find({ collection: 'crm-rfqs', ...srv, limit: 100 })).docs as unknown as Doc[]

let fetchSpy: ReturnType<typeof vi.spyOn>
beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  S = crmSessionFor(p, sales.user)!
})
beforeEach(async () => {
  await resetCrm()
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  setEnv(ENABLED)
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('NETWORK_FORBIDDEN_IN_CRM_TESTS')
  })
  vi.spyOn(p, 'sendEmail').mockImplementation(async () => {
    throw new Error('EMAIL_FORBIDDEN_AT_LAUNCH')
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
  setEnv(savedEnv)
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(p.sendEmail).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('G1 the mounted endpoint (POST /api/crm/intake/typeform/) through the real REST route', () => {
  it('a signed synthetic delivery creates one RFQ; the reply is no-store and carries only outcome + rfq_number', async () => {
    const r = await deliver(typeformDelivery())
    expect(r.status).toBe(200)
    expect(r.body.outcome).toBe('PROCESSED')
    expect(String(r.body.rfq_number)).toMatch(RFQ_NUMBER_PATTERN)
    expect(Object.keys(r.body).sort()).toEqual(['outcome', 'rfq_number'])
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('x-robots-tag')).toMatch(/noindex/)
    expect(await count('crm-rfqs')).toBe(1)
  })
  it('the path without the trailing slash reaches the same handler', async () => {
    const s = signed(typeformDelivery())
    const r = await webhook({ body: s.raw, signature: s.signature, path: 'crm/intake/typeform' })
    expect(r.status).toBe(200)
  })
  it('ingest flag not exactly "1" → 404 and nothing is read or stored', async () => {
    setEnv({ H2O_CRM_TYPEFORM_INGEST_ENABLED: '0' })
    const r = await deliver(typeformDelivery())
    expect(r.status).toBe(404)
    expect(await count('crm-intake-events')).toBe(0)
  })
  it('enabled without a valid secret → 503 (fail closed), nothing stored', async () => {
    for (const secret of [undefined, 'too-short-secret']) {
      setEnv({ H2O_CRM_TYPEFORM_WEBHOOK_SECRET: secret })
      const r = await deliver(typeformDelivery())
      expect(r.status, String(secret)).toBe(503)
    }
    expect(await count('crm-intake-events')).toBe(0)
  })
  it('unsigned and wrongly signed deliveries → 401, nothing stored', async () => {
    const raw = JSON.stringify(typeformDelivery())
    expect((await webhook({ body: raw })).status).toBe(401)
    expect((await webhook({ body: raw, signature: 'sha256=AAAA' })).status).toBe(401)
    expect((await webhook({ body: raw, signature: 'not-a-signature' })).status).toBe(401)
    expect((await deliver(typeformDelivery(), 'test-a-different-synthetic-secret-0002')).status).toBe(401)
    expect(await count('crm-intake-events')).toBe(0)
  })
  it('a signature over different bytes (tampered body) → 401', async () => {
    const s = signed(typeformDelivery())
    const tampered = s.raw.replace('Avery', 'Mallory')
    expect((await webhook({ body: tampered, signature: s.signature })).status).toBe(401)
    expect(await count('crm-intake-events')).toBe(0)
  })
  it('wrong content type → 415, nothing stored', async () => {
    const s = signed(typeformDelivery())
    for (const t of ['text/plain', 'application/x-www-form-urlencoded', null]) {
      const r = await webhook({ body: s.raw, signature: s.signature, contentType: t })
      expect(r.status, String(t)).toBe(415)
    }
    expect(await count('crm-intake-events')).toBe(0)
  })
  it('oversized → 413, whether declared in content-length or only discovered while streaming', async () => {
    const big = 'x'.repeat(MAX_BODY_BYTES + 1)
    const declared = await webhook({ body: big, signature: signed(big).signature, contentLength: String(big.length) })
    expect(declared.status).toBe(413)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_BODY_BYTES * 4) return controller.close()
        sent += 64 * 1024
        controller.enqueue(new Uint8Array(64 * 1024).fill(120))
      },
    })
    const streamed = await webhook({ body: stream, signature: 'sha256=AAAA' })
    expect(streamed.status).toBe(413)
    expect(sent).toBeLessThan(MAX_BODY_BYTES * 2) // the reader stopped early; the body was never buffered whole
    expect(await count('crm-intake-events')).toBe(0)
  })
  it('a signed but malformed body is quarantined as evidence (200, so Typeform stops retrying), no RFQ', async () => {
    const bad = '{"event_id": "evt_synthetic_bad", "event_type": "form_response", "form_response": '
    const r = await webhook({ body: bad, signature: signed(bad).signature })
    expect(r.status).toBe(200)
    expect(r.body.outcome).toBe('QUARANTINED_MALFORMED')
    const missingToken = typeformDelivery()
    delete (missingToken.form_response as Doc).token
    const r2 = await deliver(missingToken)
    expect(r2.body.outcome).toBe('QUARANTINED_MALFORMED')
    expect(await count('crm-rfqs')).toBe(0)
    expect(await count('crm-intake-events')).toBe(2)
  })
  it('a replayed delivery (same event id, same bytes) is idempotent: one intake event, one RFQ', async () => {
    const body = typeformDelivery()
    const first = await deliver(body)
    const again = await deliver(body)
    const third = await deliver(body)
    expect(first.body.outcome).toBe('PROCESSED')
    expect(again.body.outcome).toBe('DUPLICATE_DELIVERY_NOOP')
    expect(third.body.outcome).toBe('DUPLICATE_DELIVERY_NOOP')
    expect(await count('crm-rfqs')).toBe(1)
    const [ev] = (await p.find({ collection: 'crm-intake-events', ...srv })).docs as unknown as Doc[]
    expect(ev!.replay_count).toBe(2)
  })
  it('the same response under a new event id links to the existing RFQ (idempotent on the response token)', async () => {
    const body = typeformDelivery()
    await deliver(body)
    const r = await deliver({ ...body, event_id: `${body.event_id}x` })
    expect(r.body.outcome).toBe('DUPLICATE_SUBMISSION_LINKED')
    expect(await count('crm-rfqs')).toBe(1)
  })
  it('an unexpected failure is answered 500 (retryable) and logged as a code only, never the error text', async () => {
    const cap = captureLogs(p)
    const orig = p.find.bind(p)
    vi.spyOn(p, 'find').mockImplementation((async (args: { collection: string }) => {
      if (args.collection === 'crm-intake-events') throw new Error('boom avery.synthetic@northwind.example.com')
      return orig(args as never)
    }) as never)
    try {
      const r = await deliver(typeformDelivery())
      expect(r.status).toBe(500)
      expect(r.body).toEqual({ outcome: 'FAILED_RETRYABLE' })
    } finally {
      cap.restore()
    }
    const text = cap.lines.join('\n')
    expect(text).toContain('INTAKE_HANDLER_ERROR')
    expect(text).not.toContain('avery.synthetic')
    expect(text).not.toContain('boom')
  })
})

describe('G2 mapping rules for launch', () => {
  it('editorial placement: page_path and placement kept; product fields are not genuine there → no item, review', async () => {
    const r = await deliver(
      typeformDelivery({
        hidden: { page_path: '/resources/drift-eliminators/', cta_placement: 'editorial_inline', product_slug: 'synthetic-gear' },
      }),
    )
    expect(r.body.outcome).toBe('PROCESSED_WITH_REVIEW')
    const [rfq] = await rfqs()
    expect((rfq!.attribution as Doc).page_path).toBe('/resources/drift-eliminators/')
    expect((rfq!.attribution as Doc).cta_placement).toBe('editorial_inline')
    expect(await count('crm-rfq-items')).toBe(0)
    const [ev] = (await p.find({ collection: 'crm-intake-events', ...srv })).docs as unknown as Doc[]
    expect((ev!.normalized_summary as Doc).context_rejected).toEqual(['product_slug:PLACEMENT_NOT_PRODUCT'])
  })
  it('editorial placement without product fields is a clean RFQ (no review, no item)', async () => {
    const r = await deliver(typeformDelivery({ hidden: { page_path: '/resources/drift-eliminators/', cta_placement: 'editorial_inline' } }))
    expect(r.body.outcome).toBe('PROCESSED')
    expect(await count('crm-rfq-items')).toBe(0)
  })
  it('genuine product context (product page and category card placements) makes an item with the source fields', async () => {
    await deliver(
      typeformDelivery({ hidden: { page_path: '/synthetic-gear/', cta_placement: 'header_action', product_slug: 'synthetic-gear', product_id: '2201' } }),
    )
    await deliver(
      typeformDelivery({
        email: 'casey.synthetic@contoso.example.com',
        message: 'second',
        hidden: { page_path: '/gear-box/', cta_placement: 'category_and_family', product_slug: 'synthetic-gear-2', product_id: '2202' },
      }),
    )
    const items = (await p.find({ collection: 'crm-rfq-items', ...srv, sort: 'product_slug_source' })).docs as unknown as Doc[]
    expect(items.map((i) => [i.product_slug_source, i.product_id_source])).toEqual([
      ['synthetic-gear', '2201'],
      ['synthetic-gear-2', '2202'],
    ])
  })
  it('product context with a non-numeric id or without a slug is dropped, not guessed', async () => {
    await deliver(typeformDelivery({ hidden: { page_path: '/x/', cta_placement: 'rfq_page', product_slug: 'synthetic-gear', product_id: 'abc' } }))
    await deliver(typeformDelivery({ message: 'm2', hidden: { page_path: '/x/', cta_placement: 'rfq_page', product_id: '2201' } }))
    expect(await count('crm-rfq-items')).toBe(0)
  })
  it('suppression is honoured: RFQ kept, suppression untouched, eligibility unchanged, flag recorded, list shows DNC', async () => {
    const supp = await p.create({
      collection: 'crm-suppressions',
      data: { address: 'avery.synthetic@northwind.example.com', reason: 'COMPLAINT' } as never,
      overrideAccess: false,
      user: sales.user,
    })
    const r = await deliver(typeformDelivery())
    expect(r.status).toBe(200)
    const [rfq] = await rfqs()
    const contact = (await p.findByID({ collection: 'crm-contacts', id: String(relId(rfq!.contact)), ...srv })) as unknown as Doc
    expect(contact.marketing_eligibility).toBe('UNKNOWN')
    const still = (await p.find({ collection: 'crm-suppressions', ...srv })).docs as unknown as Doc[]
    expect(still).toHaveLength(1)
    expect(String(still[0]!.id)).toBe(String(supp.id))
    expect(still[0]!.action).toBe('APPLY')
    const [ev] = (await p.find({ collection: 'crm-intake-events', ...srv })).docs as unknown as Doc[]
    expect((ev!.normalized_summary as Doc).suppression_active).toBe(true)
    expect(JSON.stringify(ev!.normalized_summary)).not.toContain('avery.synthetic')
    const detail = await loadRfq(S, String(rfq!.id))
    expect(detail!.suppressions.length).toBeGreaterThan(0)
    expect(detail!.row.flags.doNotContact).toBe(true)
  })
  it('ambiguous identity + suppressed address: the RFQ stays unlinked AND still shows do-not-contact', async () => {
    await deliver(typeformDelivery({ first: 'Avery', last: 'Synthetic' }))
    await p.create({
      collection: 'crm-suppressions',
      data: { address: 'avery.synthetic@northwind.example.com', reason: 'COMPLAINT' } as never,
      overrideAccess: false,
      user: sales.user,
    })
    const second = await deliver(typeformDelivery({ first: 'Morgan', last: 'Other', message: 'different' }))
    const detail = await loadRfq(S, String((await p.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: second.body.rfq_number } }, ...srv })).docs[0]!.id))
    expect(detail!.rfq.contact ?? null).toBeNull()
    expect(detail!.suppressions.length).toBeGreaterThan(0)
    expect(detail!.row.flags.doNotContact).toBe(true)
  })
})

describe('G3 H2O_EMAIL_MODE=off: forgot/reset password refused, as at launch', () => {
  it('REST forgot-password → 403 with a fixed message, whatever the address; nothing is emailed or logged', async () => {
    const cap = captureLogs(p)
    try {
      for (const email of [userEmail('sales'), 'nobody.synthetic@example.test']) {
        const r = await rest.post('users/forgot-password', null, { email })
        expect(r.status, email).toBe(403)
        expect(JSON.stringify(r.body)).toContain(PASSWORD_EMAIL_DISABLED_MESSAGE)
      }
    } finally {
      cap.restore()
    }
    expect(cap.lines.join('\n')).not.toMatch(/reset|token=|example\.test/i)
    const u = (await p.find({ collection: 'users', where: { email: { equals: userEmail('sales') } }, overrideAccess: true })).docs[0] as unknown as Doc
    expect(u.resetPasswordToken ?? null).toBeNull()
  })
  it('REST reset-password and the Local API are refused too', async () => {
    expect((await rest.post('users/reset-password', null, { token: 'x'.repeat(40), password: 'Synthetic-New-1!' })).status).toBe(403)
    await expect(p.forgotPassword({ collection: 'users', data: { email: userEmail('sales') }, disableEmail: true })).rejects.toThrow(
      PASSWORD_EMAIL_DISABLED_MESSAGE,
    )
  })
  it('an administrator can still set a user password (ordinary update) and that user can log in', async () => {
    const victim = await user('viewer')
    await p.update({ collection: 'users', id: victim.id, data: { password: 'Synthetic-Reset-2!' } as never, overrideAccess: false, user: admin.user })
    const login = await p.login({ collection: 'users', data: { email: userEmail('viewer'), password: 'Synthetic-Reset-2!' } })
    expect(login.token).toBeTruthy()
    await p.update({ collection: 'users', id: victim.id, data: { password: 'synthetic-Password-1!' } as never, overrideAccess: true })
  })
})

describe('G4 UI-1 M1 / M4 read models', () => {
  it('D-1: a new first-response task is due at the end of the next Denver business day (intake and manual)', async () => {
    await deliver(typeformDelivery())
    const [rfq] = await rfqs()
    const task = (await p.find({ collection: 'crm-tasks', where: { kind: { equals: 'RFQ_FIRST_RESPONSE' } }, ...srv })).docs[0] as unknown as Doc
    expect(task.due_at).toBe(firstResponseDueAt(new Date(String(rfq!.received_at))).toISOString())
    // Reassignment moves the task; the due date stays the rule's.
    await p.update({ collection: 'crm-rfqs', id: String(rfq!.id), data: { assignee: sales.id } as never, overrideAccess: false, user: sales.user })
    const after = (await p.findByID({ collection: 'crm-tasks', id: String(task.id), ...srv })) as unknown as Doc
    expect(after.due_at).toBe(task.due_at)
    const manual = await createManualInquiry(S, { token: uuidv7(), email: 'manual.d1@example.test', message: 'Synthetic manual D-1 probe' })
    expect(manual.ok).toBe(true)
    const mt = (await p.find({ collection: 'crm-tasks', where: { and: [{ kind: { equals: 'RFQ_FIRST_RESPONSE' } }, { id: { not_equals: task.id } }] }, ...srv })).docs[0] as unknown as Doc
    const mrfq = (await p.findByID({ collection: 'crm-rfqs', id: String(mt.rfq), ...srv })) as unknown as Doc
    expect(mt.due_at).toBe(firstResponseDueAt(new Date(String(mrfq.received_at))).toISOString())
  })
  it('D-1 drives Due today and Overdue: not due before its day, due on its day, overdue after it', async () => {
    await deliver(typeformDelivery())
    const [rfq] = await rfqs()
    await p.update({ collection: 'crm-rfqs', id: String(rfq!.id), data: { assignee: sales.id } as never, overrideAccess: false, user: sales.user })
    const task = (await p.find({ collection: 'crm-tasks', where: { kind: { equals: 'RFQ_FIRST_RESPONSE' } }, ...srv })).docs[0] as unknown as Doc
    const due = new Date(String(task.due_at))
    const kinds = async (when: 'due' | 'overdue', now: Date) => (await loadFollowUps(S, { who: 'mine', when }, now)).rows.filter((r) => r.kind === 'RFQ_FIRST_RESPONSE')
    const received = new Date(String(rfq!.received_at))
    // On the day the arrival counts from (before its due day) it is not yet due today.
    if (endOfBusinessDay(received).getTime() < due.getTime()) expect(await kinds('due', received)).toHaveLength(0)
    const dueDayMorning = new Date(due.getTime() - 20 * 3600 * 1000)
    const onDay = await kinds('due', dueDayMorning)
    expect(onDay).toHaveLength(1)
    expect(onDay[0]!.overdue).toBe(false)
    expect(await kinds('overdue', dueDayMorning)).toHaveLength(0)
    const late = new Date(due.getTime() + 60_000)
    const over = await kinds('overdue', late)
    expect(over).toHaveLength(1)
    expect(over[0]!.overdue).toBe(true)
    const work = await loadMyWork(S, 'mine', late)
    expect(work.followUps.status).toBe('ok')
    if (work.followUps.status === 'ok') {
      expect(work.followUps.data.overdue).toBeGreaterThanOrEqual(1)
      expect(work.followUps.data.rows.find((r) => r.kind === 'RFQ_FIRST_RESPONSE')!.overdue).toBe(true)
    }
  })
  it('existing undated tasks are not backfilled and still show in Due today with "No due date"', async () => {
    await deliver(typeformDelivery())
    const [rfq] = await rfqs()
    // A pre-D-1 first-response task: created before the rule existed, so it has no due date.
    const task = (await p.find({ collection: 'crm-tasks', where: { kind: { equals: 'RFQ_FIRST_RESPONSE' } }, ...srv })).docs[0] as unknown as Doc
    // Fixture: simulate a pre-D-1 row as trusted server code (Wave 1 W1-9: a person may not move a rule-set due date silently).
    await p.update({ collection: 'crm-tasks', id: String(task.id), data: { due_at: null } as never, context: { crmServer: {} }, ...srv })
    await p.update({ collection: 'crm-rfqs', id: String(rfq!.id), data: { assignee: sales.id } as never, overrideAccess: false, user: sales.user })
    const again = (await p.findByID({ collection: 'crm-tasks', id: String(task.id), ...srv })) as unknown as Doc
    expect(again.due_at ?? null).toBeNull() // nothing backfills it
    const due = await loadFollowUps(S, { who: 'mine', when: 'due' })
    const row = due.rows.find((r) => r.kind === 'RFQ_FIRST_RESPONSE')!
    expect(row.dueAt).toBeNull()
    expect(row.overdue).toBe(false)
  })
  it('My Work activity and review links are named after the inquiry, never "Open"/"View" or an id', async () => {
    await deliver(typeformDelivery({ first: 'Avery', last: 'Synthetic' }))
    await deliver(typeformDelivery({ first: 'Morgan', last: 'Other', message: 'different' }))
    const A = crmSessionFor(p, admin.user)!
    const work = await loadMyWork(A, 'team')
    expect(work.recent.status).toBe('ok')
    expect(work.reviews.status).toBe('ok')
    if (work.recent.status === 'ok') {
      const labels = work.recent.data.rows.filter((r) => r.rfqId).map((r) => r.rfqLabel)
      expect(labels.length).toBeGreaterThan(0)
      for (const l of labels) expect(l).toBe('Northwind Thermal (synthetic)')
    }
    if (work.reviews.status === 'ok') expect(work.reviews.data.rows.map((r) => r.rfqLabel)).toContain('Northwind Thermal (synthetic)')
  })
})
