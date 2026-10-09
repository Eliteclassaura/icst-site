import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { crmCollectionAccess, crmUser } from '../access'
import { currencyTotal } from '../economics'
import { loadOverview } from '../overview'
import { as, payload, resetCrm, user, type TestUser } from './harness'

let p: Payload
let sales: TestUser, viewer: TestUser, admin: TestUser
let accountId: string

const reqFor = (u: TestUser) => ({ payload: p, user: u.user }) as never

beforeAll(async () => {
  p = await payload()
  ;[sales, viewer, admin] = await Promise.all([user('sales'), user('viewer'), user('platform-admin')])
})
beforeEach(async () => {
  await resetCrm()
  const a = await p.create({
    collection: 'crm-accounts',
    data: { canonical_name: 'Northwind Thermal (synthetic)' } as never,
    ...as(sales),
  })
  accountId = String(a.id)
})

const opp = (data: Record<string, unknown>) =>
  p.create({
    collection: 'crm-opportunities',
    data: { name: 'Synthetic', account: accountId, motion: 'PARTS', owner: sales.id, ...data } as never,
    ...as(sales),
  })

describe('CRM Overview', () => {
  it('returns nothing (and queries nothing) for a non-CRM role', async () => {
    const spy = vi.spyOn(p, 'find')
    expect(await loadOverview(reqFor(viewer))).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('is labelled non-production unless the deployment says otherwise', async () => {
    const o = await loadOverview(reqFor(sales))
    expect(o!.dataLabel).toBe('NON_PRODUCTION')
  })
  it('never shows an unknown value as $0, never sums currencies, and counts unknowns', async () => {
    await opp({})
    await opp({ amount_status: 'KNOWN', amount: 1000, currency: 'USD' })
    await opp({ amount_status: 'KNOWN', amount: 200000, currency: 'JPY' })
    await opp({ amount_status: 'WITHHELD_OR_NOT_AVAILABLE' })
    const o = (await loadOverview(reqFor(sales)))!
    expect(o.pipeline.byCurrency).toEqual({
      USD: { total: 1000, count: 1 },
      JPY: { total: 200000, count: 1 },
    })
    expect(o.pipeline.unknownValueCount).toBe(2)
    const amounts = o.opportunitiesWithoutNextTask.map((x) => x.amount)
    expect(amounts).toEqual(expect.arrayContaining(['Value not entered', 'Value withheld / not available']))
    expect(amounts.some((a) => /\$0|^0$/.test(a))).toBe(false)
  })
  it('OVERVIEW-FIX-1 (review L02): the pipeline covers every open deal, not the first 100; lists stay bounded', async () => {
    // 101 open deals at USD 1.25 (101 × 1.25 = 126.25 exactly), one JPY, one unknown, and one closed deal left out
    for (let i = 0; i < 101; i++) await opp({ name: `Synthetic ${i}`, amount_status: 'KNOWN', amount: 1.25, currency: 'USD' })
    await opp({ amount_status: 'KNOWN', amount: 200000, currency: 'JPY' })
    await opp({})
    const closed = await opp({ amount_status: 'KNOWN', amount: 999, currency: 'USD' })
    await (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle.execute(
      sql`UPDATE "crm_opportunities" SET "stage" = 'LOST' WHERE "id" = ${closed.id}`,
    )
    const o = (await loadOverview(reqFor(sales)))!
    expect(o.openOpportunities).toBe(103)
    expect(o.pipeline.byCurrency).toEqual({ USD: { total: 126.25, count: 101 }, JPY: { total: 200000, count: 1 } })
    expect(o.pipeline.unknownValueCount).toBe(1)
    expect(o.opportunitiesWithoutNextTask.length).toBeLessThanOrEqual(100) // detail lists stay bounded
    expect(o.truncated).toBe(true)
    // the currency's own precision, the code (never a symbol)
    expect(currencyTotal('USD', o.pipeline.byCurrency.USD!.total)).toBe('USD 126.25')
    expect(currencyTotal('JPY', 200000)).toBe('JPY 200,000')
  })
  it('OVERVIEW-FIX-1: the SQL pipeline is the viewer\'s authorized set only because deals are readable by every CRM user', () => {
    // If deal reading ever becomes row- or field-scoped, openPipeline() must apply that scope: this test then fails.
    expect(crmCollectionAccess.read).toBe(crmUser)
    const deals = p.config.collections.find((c) => c.slug === 'crm-opportunities')!
    expect(deals.access.read).toBe(crmUser)
    const money = deals.flattenedFields.filter((f) => ['amount', 'amount_status', 'currency', 'stage', 'source_record_explicit_zero'].includes(f.name))
    expect(money).toHaveLength(5)
    for (const f of money) expect((f as { access?: { read?: unknown } }).access?.read, f.name).toBeUndefined()
  })
  it('opportunities with an open task are not listed as "no next task"', async () => {
    const withTask = await opp({ name: 'Has task' })
    await opp({ name: 'No task' })
    await p.create({
      collection: 'crm-tasks',
      data: { title: 'Follow up', opportunity: withTask.id } as never,
      ...as(sales),
    })
    const o = (await loadOverview(reqFor(sales)))!
    expect(o.opportunitiesWithoutNextTask.map((x) => x.name)).toEqual(['No task'])
    expect(o.opportunitiesByStage.find((s) => s.stage === 'NEW')!.count).toBe(2)
  })
  it('makes a fixed number of queries whatever the data volume (no N+1)', async () => {
    const countQueries = async () => {
      const f = vi.spyOn(p, 'find')
      const c = vi.spyOn(p, 'count')
      await loadOverview(reqFor(admin))
      const n = f.mock.calls.length + c.mock.calls.length
      f.mockRestore()
      c.mockRestore()
      return n
    }
    await opp({})
    const small = await countQueries()
    for (let i = 0; i < 40; i++) await opp({ name: `Bulk ${i}` })
    const large = await countQueries()
    expect(large).toBe(small)
  })
  it('stalled is a view filter: loading the overview changes no stage', async () => {
    const o = await opp({})
    await loadOverview(reqFor(sales), new Date(Date.now() + 365 * 86_400_000))
    const after = await p.findByID({ collection: 'crm-opportunities', id: o.id, overrideAccess: true })
    expect(after.stage).toBe('NEW')
  })
})
