import { beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { BOARD_COLUMN_SIZE, DEALS_PAGE_SIZE, dealValue, editDeal, ensureDealStages, loadBoard, loadDeal, loadDeals, moveDealStage } from '../workspace/deals'
import { down as seedDown, up as seedUp } from '../../migrations/20261008_200500_opp_1_1_seed_deal_stages'
import { sql } from '@payloadcms/db-postgres'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { auditFor, payload, resetCrm, rest, user, userWith, type TestUser } from './harness'

/**
 * OPP-1 — deals from inquiries. Synthetic data only. Every workspace call runs as the user with access control on.
 */

let admin: TestUser, sales: TestUser, sales2: TestUser, viewer: TestUser
let A: CrmSession, S: CrmSession, S2: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
type Doc = Record<string, unknown>
const session = async (u: TestUser) => crmSessionFor(await payload(), u.user)!

async function account(name: string) {
  const p = await payload()
  const a = await p.create({ collection: 'crm-accounts', data: { canonical_name: name, domains: [], provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never, context: { crmServer: {} }, ...sys })
  return String(a.id)
}
/** An inquiry in review with an account, ready to qualify. */
async function readyRfq(s: CrmSession, name = 'Deal Source Co (synthetic)') {
  const r = await createManualInquiry(s, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic request for fan blades.', company: name })
  if (!r.ok) throw new Error(`manual failed: ${r.code}`)
  const id = String(r.id)
  expect((await m.startReview(s, { rfqId: id })).ok).toBe(true)
  expect((await m.linkAccount(s, { rfqId: id, accountId: await account(name) })).ok).toBe(true)
  return id
}
const dealsFor = async (rfqId: string) => (await (await payload()).find({ collection: 'crm-opportunities', where: { origin_rfq: { equals: rfqId } }, ...sys })).docs as unknown as Doc[]
const stamp = async (dealId: string) => String(((await (await payload()).findByID({ collection: 'crm-opportunities', id: dealId, ...sys })) as unknown as Doc).updatedAt)
const rfq = async (id: string) => (await (await payload()).findByID({ collection: 'crm-rfqs', id, ...sys })) as unknown as Doc

beforeAll(async () => {
  await resetCrm()
  ;[admin, sales, viewer] = await Promise.all([user('platform-admin'), user('sales'), user('viewer')])
  sales2 = await userWith('sales.two@example.test', 'sales')
  A = await session(admin)
  S = await session(sales)
  S2 = await session(sales2)
})

describe('OPP-1 stage configuration', () => {
  it('seeds the accepted defaults once, in order, and never overwrites an edit', async () => {
    const p = await payload()
    const first = await ensureDealStages(p)
    expect(first.map((x) => x.key)).toEqual(['NEW', 'QUALIFYING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'DELAYED', 'WON', 'LOST', 'CANCELLED'])
    expect(first.filter((x) => x.terminal).map((x) => x.key)).toEqual(['WON', 'LOST', 'CANCELLED'])
    const row = (await p.find({ collection: 'crm-deal-stages', where: { key: { equals: 'DELAYED' } }, ...sys })).docs[0]!
    await p.update({ collection: 'crm-deal-stages', id: String(row.id), data: { label: 'On hold' } as never, ...sys })
    const again = await ensureDealStages(p)
    expect(again).toHaveLength(9)
    expect(again.find((x) => x.key === 'DELAYED')!.label).toBe('On hold')
  })
  it('only admins change the configuration; sales can read it', async () => {
    const p = await payload()
    const row = (await p.find({ collection: 'crm-deal-stages', where: { key: { equals: 'PROPOSAL' } }, ...sys })).docs[0]!
    expect((await rest.get('crm-deal-stages', sales.token)).status).toBe(200)
    expect((await rest.patch(`crm-deal-stages/${row.id}`, sales.token, { label: 'Hacked' })).status).toBeGreaterThanOrEqual(400)
    expect((await rest.patch(`crm-deal-stages/${row.id}`, viewer.token, { label: 'Hacked' })).status).toBeGreaterThanOrEqual(400)
    expect((await rest.patch(`crm-deal-stages/${row.id}`, admin.token, { label: 'Offer sent' })).status).toBe(200)
    await rest.patch(`crm-deal-stages/${row.id}`, admin.token, { label: 'Proposal' })
  })
})

describe('OPP-1 qualify creates one editable deal', () => {
  it('creates a deal with owner, stage, value, expected close and next action; links it both ways', async () => {
    const id = await readyRfq(S)
    const out = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR', ownerId: S2.userId, stage: 'PROPOSAL', amount: '12,500.50', currency: 'usd', expectedClose: '2026-12-15', nextStep: 'Send the repair quote', nextDue: '2026-10-20' })
    expect(out).toMatchObject({ ok: true })
    const deals = await dealsFor(id)
    expect(deals).toHaveLength(1)
    const d = deals[0]!
    expect(d).toMatchObject({ stage: 'PROPOSAL', motion: 'REPAIR', amount: 12500.5, currency: 'USD', amount_status: 'KNOWN', next_step: 'Send the repair quote', qualify_key: `qualify:${id}` })
    expect(String(d.owner)).toBe(S2.userId)
    expect(String(d.expected_decision_date).slice(0, 10)).toBe('2026-12-15')
    expect(new Date(String(d.next_step_due_at)).getTime()).toBeGreaterThan(Date.parse('2026-10-20T00:00:00Z'))
    const r = await rfq(id)
    expect(r.status).toBe('QUALIFIED')
    expect(String(r.opportunity)).toBe(String(d.id))
    expect(d.office).toBe(r.office)
  })
  it('defaults: owner is the inquiry owner or you, stage QUALIFIED, value not entered, a real next action with a date', async () => {
    const id = await readyRfq(S)
    expect((await m.qualifyRfq(S, { rfqId: id, motion: 'PARTS' })).ok).toBe(true)
    const d = (await dealsFor(id))[0]!
    expect(d).toMatchObject({ stage: 'QUALIFIED', amount_status: 'NOT_ENTERED' })
    expect(String(d.owner)).toBe(S.userId)
    expect(String(d.next_step)).not.toBe('')
    expect(d.next_step_due_at).toBeTruthy()
  })
  it('is idempotent: qualifying twice, or at the same moment, never makes two deals', async () => {
    const id = await readyRfq(S)
    const first = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR' })
    const second = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR' })
    expect(first.ok && second.ok).toBe(true)
    expect(first.ok && second.ok ? second.id : null).toBe(first.ok ? first.id : undefined)
    const id2 = await readyRfq(S)
    const raced = await Promise.all([m.qualifyRfq(S, { rfqId: id2, motion: 'REPAIR' }), m.qualifyRfq(S2, { rfqId: id2, motion: 'REPAIR' }), m.qualifyRfq(A, { rfqId: id2, motion: 'REPAIR' })])
    expect(raced.every((x) => x.ok)).toBe(true)
    expect(new Set(raced.map((x) => (x.ok ? x.id : ''))).size).toBe(1)
    expect(await dealsFor(id2)).toHaveLength(1)
  })
  it('refuses bad input with field errors and creates nothing', async () => {
    const id = await readyRfq(S)
    const out = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR', ownerId: viewer.id, stage: 'WON', amount: '-5', currency: 'dollars', expectedClose: 'soon', nextStep: ' ' })
    expect(out.ok).toBe(false)
    expect(out.ok ? {} : out.fields).toMatchObject({ ownerId: expect.any(String), stage: expect.any(String), amount: expect.any(String), expectedClose: expect.any(String) })
    expect(await dealsFor(id)).toHaveLength(0)
    expect((await rfq(id)).status).toBe('IN_REVIEW')
    const noCur = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR', amount: '100' })
    expect(noCur.ok ? {} : noCur.fields).toHaveProperty('currency')
    expect((await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR', stage: 'NOPE' })).ok).toBe(false)
  })
  it('keeps the old rules: review first, an account first, an enabled stage only', async () => {
    const r = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555-0100', message: 'x', company: 'No Review Co' })
    const rid = String(r.ok ? r.id : '')
    expect((await m.qualifyRfq(S, { rfqId: rid, motion: 'REPAIR' })).ok).toBe(false)
    await m.startReview(S, { rfqId: rid })
    expect((await m.qualifyRfq(S, { rfqId: rid, motion: 'REPAIR' })).ok).toBe(false)
    expect(await dealsFor(rid)).toHaveLength(0)
    const p = await payload()
    const row = (await p.find({ collection: 'crm-deal-stages', where: { key: { equals: 'NEGOTIATION' } }, ...sys })).docs[0]!
    await p.update({ collection: 'crm-deal-stages', id: String(row.id), data: { enabled: false } as never, ...sys })
    const id = await readyRfq(S)
    expect((await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR', stage: 'NEGOTIATION' })).ok).toBe(false)
    await p.update({ collection: 'crm-deal-stages', id: String(row.id), data: { enabled: true } as never, ...sys })
  })
  it('qualify_key is server-owned: REST cannot set it on create or change it afterwards', async () => {
    const a = await readyRfq(S)
    const b = await readyRfq(S)
    expect((await m.qualifyRfq(S, { rfqId: a, motion: 'REPAIR' })).ok).toBe(true)
    const acc = String((await rfq(b)).account)
    // Claiming another inquiry's key (or any key) on create: the value is discarded, not honoured.
    const forged = await rest.post('crm-opportunities', sales.token, { name: 'Forged', account: acc, owner: S.userId, motion: 'REPAIR', stage: 'NEW', origin_rfq: b, qualify_key: `qualify:${a}` })
    if (forged.status < 300) expect(String((forged.body.doc as Doc | undefined)?.qualify_key ?? '')).not.toBe(`qualify:${a}`)
    const p = await payload()
    const withKey = (await p.find({ collection: 'crm-opportunities', where: { qualify_key: { equals: `qualify:${a}` } }, ...sys })).docs
    expect(withKey).toHaveLength(1)
    // Even for the inquiry's own key, REST create gets no key, so it cannot pre-empt the real qualify.
    const own = await rest.post('crm-opportunities', admin.token, { name: 'Pre-empt', account: acc, owner: S.userId, motion: 'REPAIR', stage: 'NEW', origin_rfq: b, qualify_key: `qualify:${b}` })
    if (own.status < 300) expect((await p.find({ collection: 'crm-opportunities', where: { qualify_key: { equals: `qualify:${b}` } }, ...sys })).docs).toHaveLength(0)
    expect((await m.qualifyRfq(S, { rfqId: b, motion: 'REPAIR' })).ok).toBe(true)
    const d = (await dealsFor(a))[0]!
    expect((await rest.patch(`crm-opportunities/${d.id}`, sales.token, { qualify_key: `qualify:${b}` })).status).toBeGreaterThanOrEqual(400)
    expect((await rest.patch(`crm-opportunities/${d.id}`, admin.token, { qualify_key: null })).status).toBeGreaterThanOrEqual(400)
    expect(String(((await dealsFor(a))[0]!).qualify_key)).toBe(`qualify:${a}`)
  })
})

describe('OPP-1 roles are re-checked on every action', () => {
  it('viewer and anonymous never get a workspace session; REST refuses them', async () => {
    const p = await payload()
    expect(crmSessionFor(p, viewer.user)).toBeNull()
    expect(crmSessionFor(p, null)).toBeNull()
    expect((await rest.get('crm-opportunities', viewer.token)).status).toBeGreaterThanOrEqual(400)
    expect((await rest.get('crm-opportunities', null)).status).toBeGreaterThanOrEqual(400)
  })
  it('a non-CRM user in the session object is refused', async () => {
    const p = await payload()
    expect(crmSessionFor(p, { id: 'x', roles: ['editor'] })).toBeNull()
  })
})

describe('OPP-1 editing and stage moves are audited', () => {
  it('edits owner, value, close date and the next action; an open deal must keep a dated next action', async () => {
    const id = await readyRfq(S)
    const q = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR' })
    const dealId = String(q.ok ? q.id : '')
    const d0 = (await dealsFor(id))[0]!
    const ok = await editDeal(S, { dealId, expectedUpdatedAt: String(d0.updatedAt), ownerId: S2.userId, amount: '9000', currency: 'THB', expectedClose: '2027-01-31', nextStep: 'Visit the plant', nextDue: '2026-11-03' })
    expect(ok).toMatchObject({ ok: true })
    const d1 = (await dealsFor(id))[0]!
    expect(d1).toMatchObject({ amount: 9000, currency: 'THB', next_step: 'Visit the plant' })
    expect(String(d1.owner)).toBe(S2.userId)
    const bare = await editDeal(S, { dealId, expectedUpdatedAt: String(d1.updatedAt), ownerId: S2.userId, nextStep: '', nextDue: '' })
    expect(bare.ok ? {} : bare.fields).toMatchObject({ nextStep: expect.any(String), nextDue: expect.any(String) })
    const stale = await editDeal(S, { dealId, expectedUpdatedAt: String(d0.updatedAt), ownerId: S.userId, nextStep: 'x', nextDue: '2026-11-04' })
    expect(stale.ok ? '' : stale.code).toBe('STALE')
    const rows = await auditFor('crm-opportunities', dealId)
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })
  it('a stage move needs a reason, is recorded on the timeline and the audit log, and a closed deal has no next action', async () => {
    const id = await readyRfq(S)
    const q = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR' })
    const dealId = String(q.ok ? q.id : '')
    const noReason = await moveDealStage(S, { dealId, expectedUpdatedAt: await stamp(dealId), stage: 'PROPOSAL', reason: '' })
    expect(noReason.ok ? {} : noReason.fields).toHaveProperty('reason')
    expect(await moveDealStage(S, { dealId, expectedUpdatedAt: await stamp(dealId), stage: 'QUALIFIED', reason: 'same' })).toMatchObject({ ok: false })
    expect(await moveDealStage(S, { dealId, expectedUpdatedAt: await stamp(dealId), stage: 'PROPOSAL', reason: 'Quote sent to the plant manager' })).toMatchObject({ ok: true })
    const detail = (await loadDeal(S, dealId))!
    expect(detail.deal.stage).toBe('PROPOSAL')
    expect(detail.activity.some((a) => a.type === 'OPPORTUNITY_STAGE_CHANGED')).toBe(true)
    expect(JSON.stringify(detail.deal.last_stage_change)).toMatch(/Quote sent/)
    const audit = await auditFor('crm-opportunities', dealId)
    expect(audit.some((r) => JSON.stringify(r).includes('stage'))).toBe(true)
    expect(await moveDealStage(S, { dealId, expectedUpdatedAt: await stamp(dealId), stage: 'LOST', reason: 'Went with a competitor' })).toMatchObject({ ok: true })
    const closed = (await loadDeal(S, dealId))!
    expect(closed.row.nextStep).toBeNull()
    expect(closed.row.overdue).toBe(false)
    const reopen = await moveDealStage(S, { dealId, expectedUpdatedAt: await stamp(dealId), stage: 'QUALIFYING', reason: 'Back in play' })
    expect(reopen.ok ? {} : reopen.fields).toHaveProperty('nextStep')
    expect(await moveDealStage(S, { dealId, expectedUpdatedAt: await stamp(dealId), stage: 'QUALIFYING', reason: 'Back in play', nextStep: 'Call them', nextDue: '2026-11-05' })).toMatchObject({ ok: true })
  })
})

describe('OPP-1.1 audit notes', () => {
  it('an edit or a stage move must say which version it was made from', async () => {
    const id = await readyRfq(S)
    const q = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR' })
    const dealId = String(q.ok ? q.id : '')
    const before = await stamp(dealId)
    for (const missing of [undefined, '', '   ']) {
      const e = await editDeal(S, { dealId, expectedUpdatedAt: missing, ownerId: S.userId, nextStep: 'x', nextDue: '2026-11-04' })
      expect(e.ok ? '' : e.code).toBe('EXPECTED_UPDATED_AT_REQUIRED')
      const mv = await moveDealStage(S, { dealId, expectedUpdatedAt: missing, stage: 'PROPOSAL', reason: 'Quote sent' })
      expect(mv.ok ? '' : mv.code).toBe('EXPECTED_UPDATED_AT_REQUIRED')
    }
    expect(await stamp(dealId)).toBe(before)
    expect(((await dealsFor(id))[0]!).stage).toBe('QUALIFIED')
  })
  it('Won, Lost and Cancelled cannot be switched off; other stages can; a stage key never changes', async () => {
    const p = await payload()
    const row = async (key: string) => String((await p.find({ collection: 'crm-deal-stages', where: { key: { equals: key } }, ...sys })).docs[0]!.id)
    for (const key of ['WON', 'LOST', 'CANCELLED']) {
      const id = await row(key)
      const off = await rest.patch(`crm-deal-stages/${id}`, admin.token, { enabled: false })
      expect(off.status, key).toBeGreaterThanOrEqual(400)
      expect(((await p.findByID({ collection: 'crm-deal-stages', id, ...sys })) as unknown as Doc).enabled).toBe(true)
      // A Local API write (an admin script) is refused too, not only REST.
      await expect(p.update({ collection: 'crm-deal-stages', id, data: { enabled: false } as never, ...sys })).rejects.toThrow(/cannot be switched off/)
    }
    const delayed = await row('DELAYED')
    expect((await rest.patch(`crm-deal-stages/${delayed}`, admin.token, { enabled: false })).status).toBe(200)
    expect((await rest.patch(`crm-deal-stages/${delayed}`, admin.token, { enabled: true })).status).toBe(200)
    expect((await rest.patch(`crm-deal-stages/${delayed}`, admin.token, { key: 'WON' })).status).toBeGreaterThanOrEqual(400)
  })
  it('the seed migration creates the nine defaults, is safe to run twice, keeps an admin edit, and matches the in-app defaults', async () => {
    const p = await payload()
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
    const args = { db: drizzle, payload: p, req: {} } as never
    await drizzle.execute(sql.raw('DELETE FROM "crm_deal_stages"'))
    await seedUp(args)
    await seedUp(args)
    const rows = async () => (await p.find({ collection: 'crm-deal-stages', limit: 50, sort: 'sort_order', ...sys })).docs as unknown as Doc[]
    const seeded = await rows()
    expect(seeded.map((r) => r.key)).toEqual(['NEW', 'QUALIFYING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'DELAYED', 'WON', 'LOST', 'CANCELLED'])
    expect(seeded.every((r) => r.enabled === true && typeof r.canonical_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-7/.test(String(r.canonical_id)))).toBe(true)
    // The app's own defaults say exactly the same thing (key, label, order).
    await drizzle.execute(sql.raw('DELETE FROM "crm_deal_stages"'))
    const lazy = await ensureDealStages(p)
    const lazyRows = await rows()
    expect(lazyRows.map((r) => [r.key, r.label, r.sort_order])).toEqual(seeded.map((r) => [r.key, r.label, r.sort_order]))
    expect(lazy.map((x) => x.key)).toEqual(seeded.map((r) => r.key))
    // Running the seed on a database the app already seeded changes nothing, and an admin edit survives it.
    await p.update({ collection: 'crm-deal-stages', id: String(lazyRows[5]!.id), data: { label: 'On hold' } as never, ...sys })
    await seedUp(args)
    expect((await rows())[5]!.label).toBe('On hold')
    expect(await rows()).toHaveLength(9)
    // Down removes rows still exactly as seeded and leaves the edited one.
    await seedDown(args)
    const left = await rows()
    expect(left).toHaveLength(1)
    expect(left[0]!.label).toBe('On hold')
    await ensureDealStages(p)
    expect(await rows()).toHaveLength(9)
  })
})

describe('OPP-1.1 reviewer fixes (ER-13)', () => {
  const dueIso = async (dealId: string) => String(((await (await payload()).findByID({ collection: 'crm-opportunities', id: dealId, ...sys })) as unknown as Doc).next_step_due_at)
  async function dealWith(office: 'US' | 'TH', date: string) {
    const id = await readyRfq(S)
    if (office === 'TH') expect((await m.moveRfqOffice(S, { rfqId: id, office: 'TH' })).ok).toBe(true)
    const q = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR', nextStep: 'Call the plant', nextDue: date })
    expect(q.ok).toBe(true)
    return String(q.ok ? q.id : '')
  }
  it('an unchanged due date survives a value-only edit, for US and TH deals, from any viewer zone, across DST', async () => {
    const viewers: Array<[string, CrmSession]> = [
      ['US viewer', S],
      ['Bangkok viewer', { ...S, timeZone: 'Asia/Bangkok' }],
      ['UTC viewer', { ...S, timeZone: 'UTC' }],
      ['Tokyo viewer', { ...S2, timeZone: 'Asia/Tokyo' }],
    ]
    const cases: Array<['US' | 'TH', string]> = [
      ['US', '2026-10-09'],
      ['US', '2026-11-01'], // the day US clocks go back (25 hours long)
      ['US', '2027-03-14'], // the day US clocks go forward (23 hours long)
      ['TH', '2026-10-31'],
    ]
    for (const [office, date] of cases) {
      const dealId = await dealWith(office, date)
      const before = await dueIso(dealId)
      const row = (await loadDeal(S, dealId))!.row
      expect(row.nextDueDate, `${office} ${date}`).toBe(date)
      expect(row.zone).toBe(office === 'US' ? 'America/Denver' : 'Asia/Bangkok')
      expect(row.zoneLabel).toBe(office === 'US' ? 'Denver time' : 'Bangkok time')
      for (const [who, viewer] of viewers) {
        // The form pre-fills row.nextDueDate and posts it back unchanged with a new value.
        const out = await editDeal(viewer, { dealId, expectedUpdatedAt: await stamp(dealId), ownerId: S.userId, amount: '1000', currency: 'USD', nextStep: 'Call the plant', nextDue: row.nextDueDate })
        expect(out.ok, `${who} ${office} ${date}`).toBe(true)
        expect(await dueIso(dealId), `${who} ${office} ${date}`).toBe(before)
        expect((await loadDeal(viewer, dealId))!.row.nextDueDate).toBe(date)
      }
    }
  })
  it('a due date set by anyone is read in the deal’s own zone: end of that calendar day in Denver or Bangkok', async () => {
    const us = await dueIso(await dealWith('US', '2026-10-09'))
    const th = await dueIso(await dealWith('TH', '2026-10-09'))
    expect(us).toBe('2026-10-10T05:59:59.999Z') // 23:59:59.999 MDT
    expect(th).toBe('2026-10-09T16:59:59.999Z') // 23:59:59.999 ICT
  })
  it('a closed deal needs no next action: owner and value can change without inventing one', async () => {
    const id = await readyRfq(S)
    const q = await m.qualifyRfq(S, { rfqId: id, motion: 'REPAIR' })
    const dealId = String(q.ok ? q.id : '')
    expect(await moveDealStage(S, { dealId, expectedUpdatedAt: await stamp(dealId), stage: 'WON', reason: 'Order received' })).toMatchObject({ ok: true })
    const out = await editDeal(S, { dealId, expectedUpdatedAt: await stamp(dealId), ownerId: S2.userId, amount: '5000', currency: 'EUR', expectedClose: '2026-12-01', nextStep: '', nextDue: '' })
    expect(out).toMatchObject({ ok: true })
    const d = ((await dealsFor(id))[0]!) as Doc
    expect(d).toMatchObject({ stage: 'WON', amount: 5000, currency: 'EUR' })
    expect(String(d.owner)).toBe(S2.userId)
    expect(d.next_step ?? null).toBeNull()
    expect(d.next_step_due_at ?? null).toBeNull()
    const detail = (await loadDeal(S, dealId))!
    expect(detail.row.nextStep).toBeNull()
    expect(detail.row.nextDueDate).toBeNull()
    // Reopening asks for a dated action.
    const reopen = await moveDealStage(S, { dealId, expectedUpdatedAt: await stamp(dealId), stage: 'QUALIFYING', reason: 'Back in play' })
    expect(reopen.ok ? {} : reopen.fields).toMatchObject({ nextStep: expect.any(String), nextDue: expect.any(String) })
  })
  it('money: blank is unknown, codes are a real ISO list, precision is per currency, zero must be confirmed', () => {
    const ok = (a: unknown, c: unknown, z?: unknown) => {
      const r = dealValue(a, c, z)
      if (!r.ok) throw new Error(`expected ok for ${String(a)} ${String(c)}: ${JSON.stringify(r.fields)}`)
      return r.data
    }
    const bad = (a: unknown, c: unknown, z?: unknown) => {
      const r = dealValue(a, c, z)
      return r.ok ? null : r.fields
    }
    expect(ok('', '')).toMatchObject({ amount: null, amount_status: 'NOT_ENTERED', currency: null, source_record_explicit_zero: false })
    expect(ok('  ', undefined)).toMatchObject({ amount_status: 'NOT_ENTERED' })
    expect(bad('', 'USD')).toHaveProperty('currency')
    expect(ok('100', 'usd')).toMatchObject({ amount: 100, currency: 'USD', amount_status: 'KNOWN', source_record_explicit_zero: false })
    expect(bad('100', 'ZZZ')).toHaveProperty('currency')
    expect(bad('100', 'dollars')).toHaveProperty('currency')
    expect(bad('100', '')).toHaveProperty('currency')
    for (const code of ['USD', 'THB', 'JPY', 'EUR', 'GBP', 'BHD', 'KWD', 'CHF', 'INR', 'AUD', 'CAD', 'SGD', 'KRW', 'VND']) expect(ok('10', code).currency).toBe(code)
    expect(bad('10', 'XXX')).toHaveProperty('currency')
    expect(bad('10', 'XAU')).toHaveProperty('currency')
    // Precision follows the currency: never silently rounded.
    expect(ok('1500', 'JPY').amount).toBe(1500)
    expect(bad('100.5', 'JPY')).toHaveProperty('amount')
    expect(bad('1500.00', 'JPY')).toHaveProperty('amount')
    expect(ok('12.34', 'USD').amount).toBe(12.34)
    expect(bad('12.345', 'USD')).toHaveProperty('amount')
    expect(ok('12.345', 'BHD').amount).toBe(12.345)
    expect(bad('12.3456', 'BHD')).toHaveProperty('amount')
    expect(ok('1,234.50', 'USD').amount).toBe(1234.5)
    expect(ok(12500.5, 'USD').amount).toBe(12500.5)
    for (const junk of ['abc', '-5', '1.234,50', '1,2,3', '12e3', '0x10', '1..2', '$100', '99999999999999']) expect(bad(junk, 'USD'), junk).toHaveProperty('amount')
    // Zero is a statement, not a default: it must be confirmed, and then it is a known zero.
    expect(bad('0', 'USD')).toHaveProperty('amount')
    expect(bad('0.00', 'USD')).toHaveProperty('amount')
    expect(ok('0', 'USD', true)).toMatchObject({ amount: 0, amount_status: 'KNOWN', currency: 'USD', source_record_explicit_zero: true })
    expect(ok('', 'USD', 'on')).toMatchObject({ amount: 0, amount_status: 'KNOWN', source_record_explicit_zero: true })
    expect(bad('', '', true)).toHaveProperty('currency')
    expect(bad('5', 'USD', true)).toHaveProperty('amount')
  })
  it('an explicit zero is stored as a known zero and survives a reload; a later real value clears the flag', async () => {
    const id = await readyRfq(S)
    const q = await m.qualifyRfq(S, { rfqId: id, motion: 'PARTS', amount: '0', currency: 'USD', amountIsZero: 'on' })
    expect(q).toMatchObject({ ok: true })
    let d = (await dealsFor(id))[0]!
    expect(d).toMatchObject({ amount: 0, amount_status: 'KNOWN', currency: 'USD', source_record_explicit_zero: true })
    const noTick = await m.qualifyRfq(S, { rfqId: await readyRfq(S), motion: 'PARTS', amount: '0', currency: 'USD' })
    expect(noTick.ok ? {} : noTick.fields).toHaveProperty('amount')
    const dealId = String(d.id)
    expect(await editDeal(S, { dealId, expectedUpdatedAt: String(d.updatedAt), ownerId: S.userId, amount: '250.75', currency: 'USD', nextStep: 'Quote', nextDue: '2026-11-10' })).toMatchObject({ ok: true })
    d = (await dealsFor(id))[0]!
    expect(d).toMatchObject({ amount: 250.75, amount_status: 'KNOWN', source_record_explicit_zero: false })
    expect(await editDeal(S, { dealId, expectedUpdatedAt: await stamp(dealId), ownerId: S.userId, amount: '', currency: '', nextStep: 'Quote', nextDue: '2026-11-10' })).toMatchObject({ ok: true })
    expect(((await dealsFor(id))[0]!)).toMatchObject({ amount: null, amount_status: 'NOT_ENTERED' })
  })
})

describe('OPP-1 lists show every deal with a true count', () => {
  it('151 deals: counts, pages and board columns agree for sales, who is capped at 100 per query', async () => {
    const p = await payload()
    const acc = await account('Bulk Deals Co (synthetic)')
    const mk = (i: number, stage: string, owner: string, office: string) =>
      p.create({
        collection: 'crm-opportunities',
        data: { name: `Bulk deal ${String(i).padStart(3, '0')} (synthetic)`, account: acc, owner, motion: 'REPAIR', stage, office, next_step: 'Call', next_step_due_at: new Date(Date.UTC(2026, 9, 1 + (i % 28))).toISOString(), provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never,
        context: { crmServer: {} },
        ...sys,
      })
    const all = { owner: null, stage: null, office: null, closed: true } as const
    const open = { ...all, closed: false }
    const before = { all: (await loadDeals(S, all, 1)).total, open: (await loadDeals(S, open, 1)).total, mine: (await loadDeals(S, { ...open, owner: 'me' }, 1)).total, other: (await loadDeals(S, { ...open, owner: S2.userId }, 1)).total, th: (await loadDeals(S, { ...open, office: 'TH' }, 1)).total, won: (await loadDeals(S, { ...all, stage: 'WON' }, 1)).total, prop: (await loadDeals(S, { ...all, stage: 'PROPOSAL' }, 1)).total }
    const batch = async (from: number, to: number, stage: string, owner: string, office: (i: number) => string) => {
      for (let i = from; i < to; i += 10) await Promise.all(Array.from({ length: Math.min(10, to - i) }, (_, k) => mk(i + k, stage, owner, office(i + k))))
    }
    await batch(0, 101, 'PROPOSAL', S.userId, (i) => (i % 2 ? 'TH' : 'US'))
    await batch(101, 151, 'WON', S2.userId, () => 'US')
    const first = await loadDeals(S, open, 1)
    expect(first.rows).toHaveLength(DEALS_PAGE_SIZE)
    const openTotal = first.total
    expect(openTotal).toBe(before.open + 101)
    const seen = new Set<string>()
    for (let page = 1; page <= first.pages; page++) for (const r of (await loadDeals(S, open, page)).rows) seen.add(r.id)
    expect(seen.size).toBe(openTotal)
    expect((await loadDeals(S, all, 1)).total).toBe(before.all + 151)
    expect((await loadDeals(S, { ...open, owner: 'me' }, 1)).total).toBe(before.mine + 101)
    expect((await loadDeals(S, { ...open, owner: S2.userId }, 1)).total).toBe(before.other)
    expect((await loadDeals(S, { ...open, office: 'TH' }, 1)).total).toBe(before.th + 50)
    expect((await loadDeals(S, { ...all, stage: 'WON' }, 1)).total).toBe(before.won + 50)
    const board = await loadBoard(S, { ...all, stage: null })
    const prop = board.find((c) => c.stage.key === 'PROPOSAL')!
    expect(prop.count).toBe(before.prop + 101)
    expect(prop.rows).toHaveLength(BOARD_COLUMN_SIZE)
    expect(board.find((c) => c.stage.key === 'WON')!.count).toBe(before.won + 50)
    expect((await loadBoard(S, open)).some((c) => c.stage.terminal)).toBe(false)
  }, 240_000)
  it('overdue next actions come first', async () => {
    const res = await loadDeals(S, { owner: null, stage: 'PROPOSAL', office: null, closed: false }, 1, new Date(Date.UTC(2026, 9, 3, 12)))
    const flags = res.rows.map((r) => r.overdue)
    expect(flags.indexOf(false)).toBeGreaterThan(-1)
    expect(flags.slice(0, flags.indexOf(false)).every(Boolean)).toBe(true)
  })
  it('a deal you cannot see is not found', async () => {
    expect(await loadDeal(S, 'not-a-uuid')).toBeNull()
    expect(await loadDeal(S, '0190f7a2-0000-7000-8000-000000000000')).toBeNull()
  })
})
