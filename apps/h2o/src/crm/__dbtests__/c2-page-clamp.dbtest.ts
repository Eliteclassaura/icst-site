import { beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { loadAccountsDirectory, loadContactsDirectory, parseAccountsParams, parseContactsParams } from '../workspace/directory'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { loadInbox, parseInboxParams } from '../workspace/queries'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * 1.3a-C2 against the isolated synthetic database: a Contacts, Accounts or RFQ list asked for a page past its end shows the last page
 * ("page 999" used to say "No contacts yet" for a directory that held contacts). All data is synthetic.
 */
let sales: TestUser
let S: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }

beforeAll(async () => {
  await resetCrm()
  sales = await user('sales')
  S = crmSessionFor(await payload(), sales.user)!
})

describe('a page past the end shows the last page', () => {
  it('Accounts: 55 accounts in pages of 50; page 999 is page 2 with its rows; an in-range page and a genuinely empty search are unchanged', async () => {
    for (let i = 0; i < 55; i++)
      await (await payload()).create({
        collection: 'crm-accounts',
        data: { canonical_name: `Clamp Synthetic ${String(i).padStart(2, '0')}`, provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never,
        context: { crmServer: {} },
        ...sys,
      })
    const p1 = await loadAccountsDirectory(S, parseAccountsParams({}), null)
    expect(p1.page).toBe(1)
    expect(p1.rows).toHaveLength(50)
    const far = await loadAccountsDirectory(S, parseAccountsParams({ page: '999' }), null)
    expect(far.page).toBe(far.pages)
    expect(far.pages).toBe(2)
    expect(far.rows).toHaveLength(5)
    expect(far.total).toBe(55)
    const p2 = await loadAccountsDirectory(S, parseAccountsParams({ page: '2' }), null)
    expect(far.rows.map((r) => r.id)).toEqual(p2.rows.map((r) => r.id))
    const none = await loadAccountsDirectory(S, parseAccountsParams({ page: '999' }), 'no-such-account-anywhere')
    expect(none.rows).toHaveLength(0)
    expect(none.total).toBe(0)
  })

  it('Contacts: one contact; page 999 shows that contact (the audited case), with the page number the pager will print', async () => {
    const made = await m.createContact(S, { email: 'only.contact@clamp-synthetic.example.test', firstName: 'Only', lastName: 'Contact' })
    expect(made.ok).toBe(true)
    const far = await loadContactsDirectory(S, parseContactsParams({ page: '999' }), null)
    expect(far.total).toBeGreaterThan(0)
    expect(far.rows.map((r) => r.name)).toContain('Only Contact')
    expect(far.page).toBe(1)
    expect(far.pages).toBe(1)
    const none = await loadContactsDirectory(S, parseContactsParams({ page: '999' }), 'no-such-contact-anywhere')
    expect(none.rows).toHaveLength(0)
    expect(none.total).toBe(0)
  })

  it('the RFQ inbox: 52 inquiries, page 999 is page 2 with its rows; an empty view is untouched', async () => {
    for (let i = 0; i < 52; i++) {
      const r = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555-0100', message: `Synthetic request number ${i}.`, company: 'Clamp Towers Co', email: `clamp${i}@clamp-synthetic.example.test`, firstName: 'Clamp', lastName: `P${i}` })
      if (!r.ok) throw new Error(`manual failed: ${r.code}`)
    }
    const now = new Date()
    const p1 = await loadInbox(S, { ...parseInboxParams({}), q: null }, now)
    expect(p1.rows).toHaveLength(50)
    const far = await loadInbox(S, { ...parseInboxParams({ page: '999' }), q: null }, now)
    expect(far.page).toBe(far.pages)
    expect(far.pages).toBe(2)
    expect(far.rows.length).toBeGreaterThan(0)
    expect(far.rows.length).toBe(far.total - 50)
  })
})
