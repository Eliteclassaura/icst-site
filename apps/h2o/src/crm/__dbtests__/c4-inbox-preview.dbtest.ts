import { beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { createManualInquiry } from '../workspace/manualInquiry'
import { loadInbox, parseInboxParams } from '../workspace/queries'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * 1.3a-C4 against the isolated synthetic database: each inbox row carries the first ~120 characters of the customer's request as one
 * plain line, and the reply-due grade is the one the row's first-response task gives. All data is synthetic.
 */
let sales: TestUser
let S: CrmSession

const make = async (n: number, message: string) => {
  const r = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555-0100', message, company: `Preview Towers ${n}`, email: `preview${n}@c4-synthetic.example.test`, firstName: 'Preview', lastName: `P${n}` })
  if (!r.ok) throw new Error(`manual failed: ${r.code}`)
  return String(r.id)
}

beforeAll(async () => {
  await resetCrm()
  sales = await user('sales')
  S = crmSessionFor(await payload(), sales.user)!
})

describe('the inbox row preview', () => {
  it('is the request as one plain line, cut at 120 characters with an ellipsis, markup kept as text', async () => {
    const short = await make(1, 'We need two gearboxes\nfor cell 3.')
    const long = await make(2, `${'Long request '.repeat(20)}end`)
    const markup = await make(3, '<img src=x onerror=alert(1)> & "quotes"')
    const inbox = await loadInbox(S, { ...parseInboxParams({}), q: null }, new Date())
    const by = new Map(inbox.rows.map((r) => [r.id, r]))
    expect(by.get(short)!.preview).toBe('We need two gearboxes for cell 3.')
    const p = by.get(long)!.preview!
    expect(p.endsWith('…')).toBe(true)
    expect(Array.from(p)).toHaveLength(121)
    expect(p.startsWith('Long request Long request')).toBe(true)
    expect(by.get(markup)!.preview).toBe('<img src=x onerror=alert(1)> & "quotes"')
  })

  it('a new inquiry is graded green (more than 8 office hours left) and carries a due time', async () => {
    const id = await make(4, 'Grade check')
    const now = new Date()
    const inbox = await loadInbox(S, { ...parseInboxParams({}), q: null }, now)
    const row = inbox.rows.find((r) => r.id === id)!
    expect(row.reply.state).toBe('OPEN')
    expect(row.reply.tone).toBe('ok')
    expect(row.reply.officeMsLeft!).toBeGreaterThan(8 * 3600_000)
    // the same row seen on its due day (a few office hours before the due instant) is amber, and after it, overdue
    const due = new Date(row.reply.dueAt!)
    const soon = await loadInbox(S, { ...parseInboxParams({}), q: null }, new Date(due.getTime() - 2 * 3600_000))
    expect(soon.rows.find((r) => r.id === id)!.reply.tone).toBe('soon')
    const late = await loadInbox(S, { ...parseInboxParams({}), q: null }, new Date(due.getTime() + 3600_000))
    expect(late.rows.find((r) => r.id === id)!.reply.tone).toBe('overdue')
  })
})
