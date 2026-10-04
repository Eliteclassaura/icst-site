import { describe, expect, it } from 'vitest'
import { refusePasswordEmail, withoutPasswordEmail } from '../../auth/no-password-email'
import { F22CAGX3_RECOMMENDED_FIELD_MAP, intakeConfigFromEnv, parseFieldMap } from '../intake/typeform/config'
import { MAX_BODY_BYTES, readBounded, typeformIntakeEndpoint, typeformWebhookHandler } from '../intake/typeform/endpoint'
import { genuineProductContext, parseTypeformDelivery, PRODUCT_CONTEXT_PLACEMENTS } from '../intake/typeform/parse'
import { SYNTHETIC_FIELD_MAP, typeformDelivery } from '../fixtures/synthetic'
import { humanSummary, TYPEFORM_ANSWER_LABEL, SUBMITTED_FIELD_LABEL } from '../workspace/labels'

/** CRM go-live Pass 1 — pure units (no database). */

describe('genuine product context', () => {
  const ctx = (o: Record<string, string>) => {
    const rejected: string[] = []
    return { out: genuineProductContext(o, rejected), rejected }
  }
  it('keeps product fields only on the placements the site uses for product context', () => {
    expect([...PRODUCT_CONTEXT_PLACEMENTS]).toEqual(['header_action', 'footer_rfq_band', 'rfq_page', 'category_and_family'])
    for (const placement of PRODUCT_CONTEXT_PLACEMENTS) {
      const { out, rejected } = ctx({ page_path: '/p/', cta_placement: placement, product_slug: 'gear', product_id: '12' })
      expect(out.product_slug, placement).toBe('gear')
      expect(rejected).toEqual([])
    }
  })
  it('drops every product field (keeping page_path and placement) when the shape is not genuine', () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ page_path: '/a/', cta_placement: 'editorial_inline', product_slug: 'gear' }, 'PLACEMENT_NOT_PRODUCT'],
      [{ page_path: '/a/', product_slug: 'gear' }, 'PLACEMENT_NOT_PRODUCT'],
      [{ cta_placement: 'rfq_page', product_slug: 'gear' }, 'PAGE_PATH_MISSING'],
      [{ page_path: '/a/', cta_placement: 'rfq_page', product_id: '12' }, 'PRODUCT_SLUG_MISSING'],
      [{ page_path: '/a/', cta_placement: 'rfq_page', product_slug: 'gear', product_id: '12a' }, 'PRODUCT_ID_INVALID'],
    ]
    for (const [input, reason] of cases) {
      const { out, rejected } = ctx(input)
      expect(Object.keys(out).filter((k) => k.startsWith('product_')), JSON.stringify(input)).toEqual([])
      expect(rejected.every((r) => r.endsWith(`:${reason}`)), JSON.stringify(rejected)).toBe(true)
      if (input.page_path) expect(out.page_path).toBe(input.page_path)
    }
  })
  it('context without product fields passes untouched', () => {
    const { out, rejected } = ctx({ page_path: '/contact-us/', cta_placement: 'header_action', utm_source: 'x' })
    expect(out).toEqual({ page_path: '/contact-us/', cta_placement: 'header_action', utm_source: 'x' })
    expect(rejected).toEqual([])
  })
  it('the parser applies it', () => {
    const parsed = parseTypeformDelivery(
      typeformDelivery({ hidden: { page_path: '/r/', cta_placement: 'editorial_inline', product_slug: 'gear' } }),
      { ...SYNTHETIC_FIELD_MAP },
    )
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.context).toEqual({ page_path: '/r/', cta_placement: 'editorial_inline' })
      expect(parsed.value.contextRejected).toEqual(['product_slug:PLACEMENT_NOT_PRODUCT'])
    }
  })
})

describe('recommended F22cAgx3 field map', () => {
  it('parses as a valid field map, uses each identity target once, and only labelled answer keys', () => {
    const parsed = parseFieldMap(JSON.stringify(F22CAGX3_RECOMMENDED_FIELD_MAP))
    expect(parsed).not.toBe('MALFORMED')
    expect(parsed).not.toBeNull()
    const targets = Object.values(F22CAGX3_RECOMMENDED_FIELD_MAP)
    for (const t of targets.filter((x) => !x.startsWith('other:'))) expect(Object.keys(SUBMITTED_FIELD_LABEL)).toContain(t)
    for (const t of targets.filter((x) => x.startsWith('other:'))) expect(Object.keys(TYPEFORM_ANSWER_LABEL)).toContain(t.slice(6))
    expect(Object.keys(F22CAGX3_RECOMMENDED_FIELD_MAP)).toHaveLength(11) // Q9 file upload deliberately unmapped
    expect(Object.keys(F22CAGX3_RECOMMENDED_FIELD_MAP)).not.toContain('33803e9f-ec3a-4520-8518-e083383db31d')
  })
  it('is never used as a default: without the env variable intake has no field map', () => {
    const r = intakeConfigFromEnv({
      H2O_CRM_TYPEFORM_WEBHOOK_SECRET: 'x'.repeat(32),
      H2O_TYPEFORM_FORM_ID: 'F22cAgx3',
      H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
    })
    expect(r.ok && r.value.fieldMap).toBeNull()
  })
})

describe('endpoint shape and fail-closed order (no database)', () => {
  const logs: unknown[] = []
  const fakePayload = { logger: { info: (x: unknown) => logs.push(x), warn: (x: unknown) => logs.push(x), error: (x: unknown) => logs.push(x) } }
  const req = (headers: Record<string, string>, body = '{}') =>
    ({ payload: fakePayload, headers: new Headers(headers), text: async () => body }) as never
  const withEnv = async <T,>(env: Record<string, string | undefined>, fn: () => Promise<T>) => {
    const saved = { ...process.env }
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]
    else process.env[k] = v
    try {
      return await fn()
    } finally {
      process.env = saved
    }
  }
  it('is a POST root endpoint at /crm/intake/typeform', () => {
    expect(typeformIntakeEndpoint).toMatchObject({ path: '/crm/intake/typeform', method: 'post' })
    expect(typeformIntakeEndpoint.handler).toBe(typeformWebhookHandler)
  })
  it('flag unset → 404 before anything else; flag set without secret → 503', async () => {
    const off = await withEnv({ H2O_CRM_TYPEFORM_INGEST_ENABLED: undefined }, async () => typeformWebhookHandler(req({})))
    expect(off.status).toBe(404)
    expect(off.headers.get('cache-control')).toBe('no-store')
    const noSecret = await withEnv(
      { H2O_CRM_TYPEFORM_INGEST_ENABLED: '1', H2O_CRM_TYPEFORM_WEBHOOK_SECRET: undefined, H2O_TYPEFORM_FORM_ID: 'F22cAgx3' },
      async () => typeformWebhookHandler(req({ 'content-type': 'application/json' })),
    )
    expect(noSecret.status).toBe(503)
  })
  it('content type and size are checked before the body is used', async () => {
    const env = { H2O_CRM_TYPEFORM_INGEST_ENABLED: '1', H2O_CRM_TYPEFORM_WEBHOOK_SECRET: 'x'.repeat(32), H2O_TYPEFORM_FORM_ID: 'F22cAgx3' }
    expect((await withEnv(env, async () => typeformWebhookHandler(req({ 'content-type': 'text/plain' })))).status).toBe(415)
    expect((await withEnv(env, async () => typeformWebhookHandler(req({ 'content-type': 'application/json; charset=utf-8', 'content-length': String(MAX_BODY_BYTES + 1) })))).status).toBe(413)
    const big = 'x'.repeat(MAX_BODY_BYTES + 1)
    expect((await withEnv(env, async () => typeformWebhookHandler(req({ 'content-type': 'application/json' }, big)))).status).toBe(413)
  })
  it('the bounded reader returns the text under the limit and null over it', async () => {
    expect(await readBounded({ text: async () => 'abc' } as never, 3)).toBe('abc')
    expect(await readBounded({ text: async () => 'abcd' } as never, 3)).toBeNull()
    const stream = (s: string) => new Response(s).body
    expect(await readBounded({ body: stream('héllo') } as never, 10)).toBe('héllo')
    expect(await readBounded({ body: stream('x'.repeat(11)) } as never, 10)).toBeNull()
  })
})

describe('no password email', () => {
  it('refuses forgotPassword and resetPassword, and nothing else', () => {
    for (const op of ['forgotPassword', 'resetPassword'])
      expect(() => refusePasswordEmail({ operation: op } as never)).toThrow(/disabled/)
    for (const op of ['login', 'update', 'create', 'read', 'refresh'])
      expect(() => refusePasswordEmail({ operation: op } as never)).not.toThrow()
  })
  it('prepends the hook and keeps the collection’s own hooks', () => {
    const own = () => undefined
    const out = withoutPasswordEmail({ slug: 'users', fields: [], hooks: { beforeOperation: [own] } })
    expect(out.hooks!.beforeOperation).toEqual([refusePasswordEmail, own])
  })
})

describe('UI-1 M7 activity summaries read as words', () => {
  it('replaces stored codes with labels and keeps RFQ numbers', () => {
    expect(humanSummary('Task created (RFQ_FIRST_RESPONSE)')).toBe('Task created (First response)')
    expect(humanSummary('RFQ RFQ-20260928-AMX403M persisted (TYPEFORM)')).toBe('RFQ RFQ-20260928-AMX403M received (website form)')
    expect(humanSummary('RFQ status RECEIVED → IN_REVIEW')).toBe('RFQ status Received → In review')
    expect(humanSummary('Identity review opened: EMAIL_MATCH_NAME_MISMATCH')).toBe(
      'Identity review opened: Email matches a contact with a different name',
    )
    expect(humanSummary('Suppression recorded: HARD_BOUNCE (ALL_EMAIL)')).toBe('Suppression recorded: hard bounce (all email)')
    expect(humanSummary(undefined)).toBe('')
    for (const s of ['Task created (INTAKE_REVIEW)', 'Opportunity created (MAINTENANCE_INSPECTION)'])
      expect(humanSummary(s)).not.toMatch(/[A-Z]{2,}_[A-Z]/)
  })
})
