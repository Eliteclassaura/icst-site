import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { invalidateOfficeSettings } from '../officeSettings'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { loadInbox, parseInboxParams } from '../workspace/queries'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { auditFor, payload, resetCrm, rest, user, type TestUser } from './harness'

/**
 * CRM Patch L1 against the isolated synthetic database: office routing (US / TH), owner overrides, office calendars
 * with holidays for the first-response due date, manual queue moves, the inbox office filter, and user office/zone.
 * Everything synthetic: example.test addresses, +66/+49/+81 numbers from reserved ranges where they exist.
 */
let admin: TestUser, sales: TestUser
let A: CrmSession, S: CrmSession
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }

const PHONE = { TH: '+66 2 000 0101', DE: '+49 30 0000 0101', JP: '+81 3 0000 0101' } as const
async function inquiry(s: CrmSession, phone: string | null, now: Date, n = 1) {
  const out = await createManualInquiry(s, { token: uuidv7(), firstName: 'Ana', lastName: `Ruiz${n}`, email: `ana${n}.${Date.now()}@example.test`, phone: phone ?? undefined, message: 'Synthetic' }, now)
  if (!out.ok) throw new Error(out.code)
  const p = await payload()
  const rfq = (await p.find({ collection: 'crm-rfqs', ...sys, sort: '-createdAt', limit: 1 })).docs[0] as unknown as Doc
  const task = (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: rfq.id } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys, limit: 1 })).docs[0] as unknown as Doc
  return { rfq, task }
}
async function settings(data: Doc) {
  await (await payload()).updateGlobal({ slug: 'crm-office-settings' as never, data: data as never, overrideAccess: true, depth: 0 })
  invalidateOfficeSettings()
}

// TEST-CLOCK-FIX-1: these tests clear the office holidays and routing overrides; the seeded ones are put back after
// the file, so later files compute due dates with the real (seeded) calendar, as production does.
let seeded: { holidays: unknown[]; routing_overrides: unknown[] } = { holidays: [], routing_overrides: [] }
const withoutIds = (rows: unknown) => (Array.isArray(rows) ? rows.map(({ id: _id, ...r }: Record<string, unknown>) => r) : [])
afterAll(async () => {
  await settings({ holidays: seeded.holidays, routing_overrides: seeded.routing_overrides })
})

beforeAll(async () => {
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  const p = await payload()
  const g = (await p.findGlobal({ slug: 'crm-office-settings' as never, overrideAccess: true, depth: 0 })) as unknown as Record<string, unknown>
  seeded = { holidays: withoutIds(g.holidays), routing_overrides: withoutIds(g.routing_overrides) }
  A = crmSessionFor(p, admin.user)!
  S = crmSessionFor(p, sales.user)!
})
beforeEach(async () => {
  await resetCrm()
  await settings({ routing_overrides: [], holidays: [] })
})

describe('L1 routing', () => {
  it('Thailand, Southeast Asia, Japan and APAC go to the Thailand queue; everything else and unknown to the US', async () => {
    const now = new Date('2026-10-06T16:00:00Z')
    expect((await inquiry(S, PHONE.TH, now, 1)).rfq).toMatchObject({ country_code: 'TH', office: 'TH', office_source: 'COUNTRY_RULE' })
    expect((await inquiry(S, PHONE.JP, now, 2)).rfq).toMatchObject({ country_code: 'JP', office: 'TH', office_source: 'COUNTRY_RULE' })
    expect((await inquiry(S, PHONE.DE, now, 3)).rfq).toMatchObject({ country_code: 'DE', office: 'US', office_source: 'COUNTRY_RULE' })
    expect((await inquiry(S, null, now, 4)).rfq).toMatchObject({ office: 'US', office_source: 'DEFAULT' })
  })

  it('an owner override wins for new inquiries', async () => {
    await settings({ routing_overrides: [{ country_code: 'jp', office: 'US' }], holidays: [] })
    const { rfq } = await inquiry(S, PHONE.JP, new Date('2026-10-06T16:00:00Z'))
    expect(rfq).toMatchObject({ office: 'US', office_source: 'OWNER_OVERRIDE' })
  })

  it('a person can move an inquiry to the other queue; it then stays there (MANUAL) and the move is audited', async () => {
    const { rfq } = await inquiry(S, PHONE.DE, new Date('2026-10-06T16:00:00Z'))
    const moved = await m.moveRfqOffice(S, { rfqId: String(rfq.id), office: 'TH', expectedUpdatedAt: rfq.updatedAt })
    expect(moved.ok).toBe(true)
    const p = await payload()
    let after = (await p.findByID({ collection: 'crm-rfqs', id: String(rfq.id), ...sys })) as unknown as Doc
    expect(after).toMatchObject({ office: 'TH', office_source: 'MANUAL' })
    // A later write that re-derives facets (a status change) keeps the person's queue.
    await m.startReview(S, { rfqId: String(rfq.id), expectedUpdatedAt: after.updatedAt })
    after = (await p.findByID({ collection: 'crm-rfqs', id: String(rfq.id), ...sys })) as unknown as Doc
    expect(after).toMatchObject({ office: 'TH', office_source: 'MANUAL', status: 'IN_REVIEW' })
    const audit = (await auditFor('crm-rfqs', String(rfq.id))) as Doc[]
    const moves = audit.map((e) => ((e.detail as Doc)?.transitions as Doc | undefined)?.office as Doc | undefined).filter(Boolean)
    expect(moves).toContainEqual({ from: 'US', to: 'TH' })
  })

  it('the inbox office filter returns one queue', async () => {
    const now = new Date('2026-10-06T16:00:00Z')
    await inquiry(S, PHONE.TH, now, 1)
    await inquiry(S, PHONE.DE, now, 2)
    const th = await loadInbox(A, { ...parseInboxParams({ office: 'TH' }), q: null }, now)
    expect(th.rows.map((r) => r.office)).toEqual(['TH'])
    const all = await loadInbox(A, { ...parseInboxParams({}), q: null }, now)
    expect(all.rows.map((r) => r.office).sort()).toEqual(['TH', 'US'])
  })
})

describe('L1 office calendars (first-response due date)', () => {
  it('a Thailand inquiry is due at the end of the next Bangkok business day', async () => {
    // Fri 2026-10-09 10:00 Bangkok (03:00Z) → counts from Friday → due end of Monday 2026-10-12, Bangkok.
    const { task } = await inquiry(S, PHONE.TH, new Date('2026-10-09T03:00:00Z'))
    expect(task.due_at).toBe(new Date('2026-10-12T23:59:59.999+07:00').toISOString())
  })

  it('office holidays are skipped: US Thanksgiving, Thai Songkran', async () => {
    await settings({
      routing_overrides: [],
      holidays: [
        { office: 'US', date: '2026-11-26', name: 'Thanksgiving Day', confirmed: true },
        { office: 'TH', date: '2027-04-13', name: 'Songkran', confirmed: false },
        { office: 'TH', date: '2027-04-14', name: 'Songkran', confirmed: false },
        { office: 'TH', date: '2027-04-15', name: 'Songkran', confirmed: false },
      ],
    })
    // Wed 2026-11-25 10:00 Denver (17:00Z): Thursday is Thanksgiving → due end of Friday 11-27, Denver (MST).
    const us = await inquiry(S, PHONE.DE, new Date('2026-11-25T17:00:00Z'), 1)
    expect(us.task.due_at).toBe(new Date('2026-11-27T23:59:59.999-07:00').toISOString())
    // Mon 2027-04-12 10:00 Bangkok: Tue–Thu are Songkran → due end of Friday 2027-04-16, Bangkok.
    const th = await inquiry(S, PHONE.TH, new Date('2027-04-12T03:00:00Z'), 2)
    expect(th.task.due_at).toBe(new Date('2027-04-16T23:59:59.999+07:00').toISOString())
  })
})

describe('L1 settings and user profile', () => {
  it('settings are validated, admin-only and audited', async () => {
    const p = await payload()
    await expect(
      p.updateGlobal({ slug: 'crm-office-settings' as never, data: { holidays: [{ office: 'US', date: '2026-02-30', name: 'Not a day' }] } as never, overrideAccess: true }),
    ).rejects.toThrow(/OFFICE_HOLIDAY_DATE/)
    await expect(
      p.updateGlobal({ slug: 'crm-office-settings' as never, data: { routing_overrides: [{ country_code: 'JP', office: 'US' }, { country_code: 'jp', office: 'TH' }] } as never, overrideAccess: true }),
    ).rejects.toThrow(/OFFICE_ROUTE_DUPLICATE/)
    const denied = await rest.post('globals/crm-office-settings', sales.token, { routing_overrides: [{ country_code: 'DE', office: 'TH' }] })
    expect(denied.status).toBe(403)
    await p.updateGlobal({ slug: 'crm-office-settings' as never, data: { routing_overrides: [{ country_code: 'DE', office: 'TH' }] } as never, user: admin.user as never, overrideAccess: false })
    const audit = await p.find({ collection: 'audit-log', where: { collection: { equals: 'crm-office-settings' } }, ...sys, sort: '-createdAt', limit: 1 })
    expect((audit.docs[0] as unknown as Doc).detail).toMatchObject({ crm: true, routing_overrides: 1 })
  })

  it('a date a Thailand-office user picks ends at midnight in Bangkok, not Denver', async () => {
    const p = await payload()
    const { rfq } = await inquiry(S, PHONE.TH, new Date('2026-10-06T03:00:00Z'))
    const th = { ...S, office: 'TH' as const, timeZone: 'Asia/Bangkok' }
    const out = await m.createFollowUp(th, { rfqId: String(rfq.id), title: 'Call back', due: '2026-10-08' })
    expect(out.ok).toBe(true)
    const task = (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: rfq.id } }, { title: { equals: 'Call back' } }] }, ...sys, limit: 1 })).docs[0] as unknown as Doc
    expect(task.due_at).toBe(new Date('2026-10-08T23:59:59.999+07:00').toISOString())
  })

  it('only an admin assigns an office; a user may set their own display zone, which the session uses', async () => {
    const p = await payload()
    await rest.patch(`users/${sales.id}`, sales.token, { crm_office: 'TH', time_zone: 'Asia/Bangkok' })
    let me = (await p.findByID({ collection: 'users', id: sales.id, ...sys })) as unknown as Doc
    expect(me.crm_office ?? 'US').toBe('US')
    expect(me.time_zone).toBe('Asia/Bangkok')
    await p.update({ collection: 'users', id: sales.id, data: { crm_office: 'TH', time_zone: null } as never, user: admin.user as never, overrideAccess: false })
    me = (await p.findByID({ collection: 'users', id: sales.id, ...sys })) as unknown as Doc
    const s = crmSessionFor(p, me)!
    expect(s).toMatchObject({ office: 'TH', timeZone: 'Asia/Bangkok' })
    await p.update({ collection: 'users', id: sales.id, data: { crm_office: 'US', time_zone: null } as never, ...sys })
  })
})
