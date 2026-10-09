import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { invalidateOfficeSettings } from '../officeSettings'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { dealCalendar, loadDeal, qualifyWithDeal } from '../workspace/deals'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { quickDueDates } from '../workspace/time'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * DATE-FIX-1 (launch review L01): a deal's new and default due dates are read in the deal's own office calendar (Denver for
 * US, Bangkok for TH, with that office's holidays), never in the calendar of the person looking at it. Frozen at
 * 2026-10-08 17:30 UTC, when Bangkok is already Friday October 9 and Denver is still Thursday October 8. Synthetic data only.
 */
let admin: TestUser, sales: TestUser
let A: CrmSession, S: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
type Doc = Record<string, unknown>
const NOW = new Date('2026-10-08T17:30:00Z')
const PHONE = { TH: '+66 2 000 0101', US: '+49 30 0000 0101' } as const

/** The same person, seen from the other office: their own display zone and office. */
const denverViewer = (): CrmSession => ({ ...S, timeZone: 'America/Denver', office: 'US' })
const bangkokViewer = (): CrmSession => ({ ...S, timeZone: 'Asia/Bangkok', office: 'TH' })

async function settings(data: Doc) {
  await (await payload()).updateGlobal({ slug: 'crm-office-settings' as never, data: data as never, overrideAccess: true, depth: 0 })
  invalidateOfficeSettings()
}
async function readyRfq(phone: string, n: number) {
  const r = await createManualInquiry(S, { token: uuidv7(), firstName: 'Ana', lastName: `Ruiz${n}`, email: `ana${n}.${Date.now()}@example.test`, phone, message: 'Synthetic request.', company: `Dated Co ${n} (synthetic)` }, NOW)
  if (!r.ok) throw new Error(`manual failed: ${r.code}`)
  const id = String(r.id)
  const p = await payload()
  const acc = await p.create({ collection: 'crm-accounts', data: { canonical_name: `Dated Co ${n} (synthetic)`, domains: [], provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never, context: { crmServer: {} }, ...sys })
  expect((await m.startReview(S, { rfqId: id })).ok).toBe(true)
  expect((await m.linkAccount(S, { rfqId: id, accountId: String(acc.id) })).ok).toBe(true)
  return id
}
const dealOf = async (rfqId: string) => String(((await (await payload()).find({ collection: 'crm-opportunities', where: { origin_rfq: { equals: rfqId } }, ...sys })).docs[0] as unknown as Doc).id)

beforeAll(async () => {
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  const p = await payload()
  A = crmSessionFor(p, admin.user)!
  S = crmSessionFor(p, sales.user)!
})
beforeEach(async () => {
  await resetCrm()
  await settings({ routing_overrides: [], holidays: [] })
})

describe('DATE-FIX-1 the server fallback is the inquiry’s office calendar', () => {
  it('a Thailand inquiry qualified from a Denver viewer: Bangkok is already Friday, so the next business day is Monday Oct 12', async () => {
    const id = await readyRfq(PHONE.TH, 1)
    expect(await qualifyWithDeal(denverViewer(), { rfqId: id, motion: 'REPAIR' }, { now: NOW })).toMatchObject({ ok: true })
    const d = await loadDeal(S, await dealOf(id), NOW)
    // The saved day, the day shown and the office label agree.
    expect(d!.row).toMatchObject({ office: 'TH', zone: 'Asia/Bangkok', zoneLabel: 'Bangkok time', nextDueDate: '2026-10-12' })
    expect(String(d!.deal.next_step_due_at)).toBe(new Date('2026-10-12T23:59:59.999+07:00').toISOString())
    // The Denver viewer's own calendar would have said Friday Oct 9: the defect.
    expect(quickDueDates(NOW, await dealCalendar(denverViewer(), null)).tomorrow).toBe('2026-10-09')
  })

  it('a US inquiry qualified from a Bangkok viewer: Denver is still Thursday, so the next business day is Friday Oct 9, not Monday', async () => {
    const id = await readyRfq(PHONE.US, 2)
    expect(await qualifyWithDeal(bangkokViewer(), { rfqId: id, motion: 'PARTS' }, { now: NOW })).toMatchObject({ ok: true })
    const d = await loadDeal(S, await dealOf(id), NOW)
    expect(d!.row).toMatchObject({ office: 'US', zone: 'America/Denver', zoneLabel: 'Denver time', nextDueDate: '2026-10-09' })
    expect(String(d!.deal.next_step_due_at)).toBe(new Date('2026-10-09T23:59:59.999-06:00').toISOString())
    expect(quickDueDates(NOW, await dealCalendar(bangkokViewer(), null)).tomorrow).toBe('2026-10-12')
  })

  it('differing office holidays: each office skips only its own', async () => {
    await settings({
      routing_overrides: [],
      holidays: [
        { office: 'US', date: '2026-10-09', name: 'Synthetic US holiday', confirmed: true },
        { office: 'TH', date: '2026-10-12', name: 'Synthetic TH holiday', confirmed: true },
      ],
    })
    const us = await readyRfq(PHONE.US, 3)
    const th = await readyRfq(PHONE.TH, 4)
    await qualifyWithDeal(bangkokViewer(), { rfqId: us, motion: 'REPAIR' }, { now: NOW })
    await qualifyWithDeal(denverViewer(), { rfqId: th, motion: 'REPAIR' }, { now: NOW })
    // US: Thursday → Friday is a US holiday → Monday Oct 12. TH: Friday → Monday is a TH holiday → Tuesday Oct 13.
    expect((await loadDeal(S, await dealOf(us), NOW))!.row.nextDueDate).toBe('2026-10-12')
    expect((await loadDeal(S, await dealOf(th), NOW))!.row.nextDueDate).toBe('2026-10-13')
  })

  it('a date the person chose is saved as chosen, in the office zone, whatever the viewer’s calendar', async () => {
    const id = await readyRfq(PHONE.TH, 5)
    await qualifyWithDeal(denverViewer(), { rfqId: id, motion: 'REPAIR', nextDue: '2026-10-20' }, { now: NOW })
    const d = await loadDeal(S, await dealOf(id), NOW)
    expect(d!.row.nextDueDate).toBe('2026-10-20')
    expect(String(d!.deal.next_step_due_at)).toBe(new Date('2026-10-20T23:59:59.999+07:00').toISOString())
  })

  it('dealCalendar: the office zone and that office’s holidays; no office falls back to the viewer', async () => {
    await settings({ routing_overrides: [], holidays: [{ office: 'TH', date: '2026-10-12', name: 'Synthetic', confirmed: true }] })
    const th = await dealCalendar(denverViewer(), 'TH')
    expect(th.zone).toBe('Asia/Bangkok')
    expect([...th.holidays]).toEqual(['2026-10-12'])
    const us = await dealCalendar(bangkokViewer(), 'US')
    expect(us.zone).toBe('America/Denver')
    expect([...us.holidays]).toEqual([])
    expect((await dealCalendar(bangkokViewer(), null)).zone).toBe('Asia/Bangkok')
    void A
  })
})

describe('DATE-FIX-1 the “Canceled” stage label (data migration)', () => {
  it('moves a seeded “Cancelled” label to “Canceled” and back, and leaves an admin’s own label alone', async () => {
    const { up, down } = await import('../../migrations/20261008_220000_deals_date_fix_1_canceled_label')
    const { sql } = await import('@payloadcms/db-postgres')
    const p = await payload()
    const { ensureDealStages } = await import('../workspace/deals')
    await ensureDealStages(p)
    const row = async () => String(((await p.find({ collection: 'crm-deal-stages', where: { key: { equals: 'CANCELLED' } }, ...sys })).docs[0] as unknown as Doc).label)
    const db = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
    const args = { db: { execute: (q: unknown) => db.execute(q) }, payload: p, req: {} } as never
    await db.execute(sql`UPDATE "crm_deal_stages" SET "label" = 'Cancelled' WHERE "key" = 'CANCELLED'::"public"."enum_crm_deal_stages_key"`)
    await up(args)
    expect(await row()).toBe('Canceled')
    await down(args)
    expect(await row()).toBe('Cancelled')
    await db.execute(sql`UPDATE "crm_deal_stages" SET "label" = 'Called off' WHERE "key" = 'CANCELLED'::"public"."enum_crm_deal_stages_key"`)
    await up(args)
    expect(await row()).toBe('Called off')
  })
})
