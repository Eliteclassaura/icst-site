import { sql } from '@payloadcms/db-postgres'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'
import { pendingSession } from '../../auth/mfa/guard'
import { beginEnrolment, confirmEnrolment, enrolWithSecret, loadMfaUser, verifySecondFactor } from '../../auth/mfa/service'
import { generateSecret, totpCode } from '../../auth/mfa/totp'
import { pollInbound } from '../../email/inbound-poller'
import type { InboundMailbox, JmapEmail } from '../../email/jmap'
import { ingestInbound } from '../inbound'
import { admit, bucketFor, EMAIL_RULE } from '../intake/native/limits'
import { emailKey } from '../normalize'
import { activeFromLedger, ledgerFor } from '../suppression'
import { payload, rest, user, type TestUser } from './harness'

/**
 * SEC-CRM-1 (Security Auditor R1, CRM-owned findings) against the isolated synthetic database. Crafted inputs are the
 * auditor's, made synthetic: example.test / example.com addresses only, no real mail, no network.
 */
type Doc = Record<string, unknown>
const srv = { overrideAccess: true as const, depth: 0 }
const server = { ...srv, context: { crmServer: {} } }
const CTX = { roleLocal: 'rfq', domain: 'example.test' }
const PASSWORD = 'synthetic-Password-1!'
let p: Payload
let admin: TestUser
let sales: TestUser
let seq = 0

beforeAll(async () => {
  p = await payload()
  admin = await user('platform-admin')
  sales = await user('sales')
})

const ledger = async (address: string) => ledgerFor({ payload: p } as never, emailKey(address)!.matchKey)
const active = async (address: string) => activeFromLedger(await ledger(address))

/** A message the CRM sent (an outbox row with its Message-ID); returns the id without brackets. */
async function sent(to: string): Promise<string> {
  const id = `${randomUUID()}@example.test`
  await p.create({
    collection: 'crm-email-outbox',
    data: { idempotency_key: `sec1:${id}`, kind: 'SEQUENCE_EMAIL', status: 'SENT', recipient_ref: `sec1-${++seq}`, to_address: to, recipient_domain: to.split('@')[1], message_id: `<${id}>`, sent_at: new Date().toISOString() } as never,
    ...server,
  })
  return id
}
const report = (id: string, finals: string[], extra: Partial<JmapEmail> = {}): JmapEmail => ({
  id,
  from: [{ email: 'mailer-daemon@example.test' }],
  to: [{ email: 'rfq@example.test' }],
  subject: 'Delivery Status Notification (Failure)',
  receivedAt: new Date().toISOString(),
  'header:Auto-Submitted:asText': 'auto-replied',
  deliveryStatus: `Reporting-MTA: dns; mx.example.test\n\n${finals.map((f) => `Final-Recipient: rfc822; ${f}\nAction: failed\nStatus: 5.1.1`).join('\n\n')}`,
  ...extra,
})

describe('SEC-CRM-1 finding 20: a delivery report acts only on mail the CRM sent', () => {
  it('a forged report (no reference to our mail) suppresses nobody', async () => {
    const victim = `victim.${++seq}@northwind.example.com`
    await ingestInbound(p, report(`sec1-dsn-forged-${seq}`, [victim]), CTX)
    await ingestInbound(p, report(`sec1-dsn-forged-ref-${seq}`, [victim], { inReplyTo: [`${randomUUID()}@example.test`] }), CTX)
    expect(await ledger(victim)).toEqual([])
  })

  it('a genuine report suppresses only the address our message went to, never another Final-Recipient it lists', async () => {
    const customer = `buyer.${++seq}@northwind.example.com`
    const victim = `victim.${++seq}@northwind.example.com`
    const id = await sent(customer)
    await ingestInbound(p, report(`sec1-dsn-real-${seq}`, [customer, victim], { inReplyTo: [id] }), CTX)
    expect((await active(customer)).map((r) => r.reason)).toEqual(['HARD_BOUNCE'])
    expect(await ledger(victim)).toEqual([])
    const row = (await p.find({ collection: 'crm-email-outbox', where: { message_id: { equals: `<${id}>` } }, ...srv })).docs[0] as unknown as Doc
    expect(row.bounced_at).toEqual(expect.any(String))
  })

  it('a Message-ID quoted in the report text (Original-Message-ID) also binds it; References too', async () => {
    const a = `quoted.${++seq}@northwind.example.com`
    const b = `refs.${++seq}@northwind.example.com`
    const ida = await sent(a)
    const idb = await sent(b)
    const r = report(`sec1-dsn-quoted-${seq}`, [a])
    r.deliveryStatus = `Original-Message-ID: <${ida}>\n${r.deliveryStatus}`
    await ingestInbound(p, r, CTX)
    await ingestInbound(p, report(`sec1-dsn-refs-${seq}`, [b], { references: [`other@example.test`, idb] }), CTX)
    expect((await active(a)).length).toBe(1)
    expect((await active(b)).length).toBe(1)
  })

  it('a hard bounce from a report is admin-clearable with a written reason (audited); a send-time refusal is not', async () => {
    const customer = `clear.${++seq}@northwind.example.com`
    await ingestInbound(p, report(`sec1-dsn-clear-${seq}`, [customer], { inReplyTo: [await sent(customer)] }), CTX)
    const [dsnRow] = await active(customer)
    expect(dsnRow).toMatchObject({ reason: 'HARD_BOUNCE', source: 'PROVIDER_EVENT', source_event_id: expect.stringMatching(/^dsn:/) })
    // Sales cannot clear it; an admin without a reason cannot either.
    expect((await rest.post('crm-suppressions', sales.token, { address: customer, action: 'CLEAR', clears: dsnRow!.id, reason_note: 'x' })).status).toBeGreaterThanOrEqual(400)
    expect((await rest.post('crm-suppressions', admin.token, { address: customer, action: 'CLEAR', clears: dsnRow!.id })).status).toBeGreaterThanOrEqual(400)
    const ok = await rest.post('crm-suppressions', admin.token, { address: customer, action: 'CLEAR', clears: dsnRow!.id, reason_note: 'Forged bounce report (synthetic)' })
    expect(ok.status).toBe(201)
    expect(await active(customer)).toEqual([])
    const clearRow = (await ledger(customer)).find((r) => r.action === 'CLEAR') as unknown as Doc
    expect(clearRow).toMatchObject({ reason: 'HARD_BOUNCE', reason_note: 'Forged bounce report (synthetic)' })
    expect(String((clearRow.recorded_by as Doc | string | null) && (typeof clearRow.recorded_by === 'object' ? (clearRow.recorded_by as Doc).id : clearRow.recorded_by))).toBe(String(admin.id))
    // A refusal at send time (our own server said no) stays never-clearable.
    const other = `sendtime.${++seq}@northwind.example.com`
    const hb = (await p.create({ collection: 'crm-suppressions', data: { address: other, action: 'APPLY', reason: 'HARD_BOUNCE', source: 'PROVIDER_EVENT', source_event_id: `send:${randomUUID()}` } as never, ...server })) as unknown as Doc
    const refused = await rest.post('crm-suppressions', admin.token, { address: other, action: 'CLEAR', clears: hb.id, reason_note: 'try' })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(refused.body)).toMatch(/NEVER_CLEARABLE|cannot be cleared/)
  })
})

describe('SEC-CRM-1 finding 22: one message that cannot be parsed never blocks the mailbox', () => {
  it('a parse failure goes to the review queue at once; the good message beside it is stored; both are marked', async () => {
    const n = ++seq
    const good: JmapEmail = {
      id: `sec1-good-${n}`,
      messageId: [`${randomUUID()}@northwind.example.com`],
      from: [{ email: `someone.${n}@northwind.example.com` }],
      to: [{ email: 'rfq@example.test' }],
      subject: 'A question (synthetic)',
      receivedAt: new Date().toISOString(),
      textBody: [{ partId: '1', type: 'text/plain' }],
      bodyValues: { '1': { value: 'Hello' } },
    }
    const poison: JmapEmail = { id: `sec1-poison-${n}`, subject: null, from: [], parseFailed: true }
    const marked: string[] = []
    const mailbox: InboundMailbox = { fetchNew: async () => [poison, good], markIngested: async (ids) => void marked.push(...ids) }
    const out = await pollInbound(p, { cfg: { enabled: true, settings: { protocol: 'imap', roleLocal: 'rfq', domain: 'example.test' } } as never, mailbox })
    expect(out).toMatchObject({ fetched: 2, failed: 1, review: 1 })
    expect(marked.sort()).toEqual([good.id, poison.id].sort())
    const review = (await p.find({ collection: 'crm-email-review', where: { reason: { equals: 'PROCESSING_FAILED' } }, ...srv, limit: 100 })).docs as unknown as Doc[]
    expect(review.some((r) => String(r.source_ref).includes(poison.id))).toBe(true)
  })
})

describe('SEC-CRM-1 finding 26: the two-factor counters are atomic', () => {
  async function enrolledUser() {
    const email = `sec1.mfa.${Date.now()}.${++seq}@example.test`
    const created = (await p.create({ collection: 'users', data: { email, password: PASSWORD, roles: ['sales'], name: `Synthetic SEC-1 ${seq}` } as never, ...srv })) as unknown as Doc
    const secret = generateSecret()
    await enrolWithSecret(p, String(created.id), secret)
    const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
    const pending = (await pendingSession(p, new Headers({ authorization: `JWT ${String(login.token)}` })))!
    return { id: String(created.id), email, secret, sid: pending.sid }
  }
  const raw = async (id: string) =>
    ((await (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle.execute(sql`SELECT mfa_failures, mfa_locked_until FROM users WHERE id = ${id}`)).rows[0]!)

  it('20 parallel wrong codes (one stale snapshot) all count: the lock engages', async () => {
    const u = await enrolledUser()
    const snap = (await loadMfaUser(p, u.id))!
    const now = new Date()
    const valid = new Set([-30_000, 0, 30_000].map((d) => totpCode(u.secret, new Date(now.getTime() + d))))
    const wrong = Array.from({ length: 40 }, (_, i) => String(100000 + i * 7919).slice(0, 6)).filter((c) => !valid.has(c)).slice(0, 20)
    const outs = await Promise.all(wrong.map((c) => verifySecondFactor(p, snap, u.sid, c, now)))
    expect(outs.some((o) => !o.ok && o.code === 'LOCKED')).toBe(true)
    expect((await raw(u.id)).mfa_locked_until).not.toBeNull()
    // Locked: the right code is refused now.
    expect(await verifySecondFactor(p, (await loadMfaUser(p, u.id))!, u.sid, totpCode(u.secret, now), now)).toMatchObject({ ok: false, code: 'LOCKED' })
  })

  it('the same valid code sent 5 times at once succeeds exactly once', async () => {
    const u = await enrolledUser()
    const snap = (await loadMfaUser(p, u.id))!
    const now = new Date()
    const code = totpCode(u.secret, now)
    const outs = await Promise.all(Array.from({ length: 5 }, () => verifySecondFactor(p, snap, u.sid, code, now)))
    expect(outs.filter((o) => o.ok)).toHaveLength(1)
  })

  it('the same recovery code sent 5 times at once works exactly once; 9 remain', async () => {
    const email = `sec1.rec.${Date.now()}.${++seq}@example.test`
    const created = (await p.create({ collection: 'users', data: { email, password: PASSWORD, roles: ['sales'], name: 'Synthetic SEC-1 recovery' } as never, ...srv })) as unknown as Doc
    const id = String(created.id)
    const login1 = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
    const s1 = (await pendingSession(p, new Headers({ authorization: `JWT ${String(login1.token)}` })))!
    const setup = await beginEnrolment(p, s1.user)
    if (!('secret' in setup)) throw new Error('expected a setup key')
    const enrol = await confirmEnrolment(p, (await loadMfaUser(p, id))!, s1.sid, totpCode(setup.secret))
    const code = (enrol.ok && enrol.recoveryCodes?.[2]) || ''
    const login2 = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
    const s2 = (await pendingSession(p, new Headers({ authorization: `JWT ${String(login2.token)}` })))!
    const snap = (await loadMfaUser(p, id))!
    const outs = await Promise.all(Array.from({ length: 5 }, () => verifySecondFactor(p, snap, s2.sid, code)))
    const won = outs.filter((o) => o.ok)
    expect(won).toHaveLength(1)
    expect(won[0]).toMatchObject({ recoveryRemaining: 9 })
    const hashes = (((await loadMfaUser(p, id))!.mfa_recovery as Doc).hashes as string[]).length
    expect(hashes).toBe(9)
  })
})

describe('SEC-CRM-1 finding 27: native RFQ limits count before they check', () => {
  it('30 parallel requests on one email bucket (3 per hour): at most 3 are admitted', async () => {
    const bucket = bucketFor('email', `sec1-${randomUUID()}`)
    const waits = await Promise.all(Array.from({ length: 30 }, () => admit(p, [{ bucket, rules: [EMAIL_RULE] }])))
    const admitted = waits.filter((w) => w === 0).length
    expect(admitted).toBeLessThanOrEqual(3)
    expect(admitted).toBeGreaterThanOrEqual(0)
    // Serially, the cap holds exactly.
    const serial = bucketFor('email', `sec1-${randomUUID()}`)
    const seen: number[] = []
    for (let i = 0; i < 5; i++) seen.push(await admit(p, [{ bucket: serial, rules: [EMAIL_RULE] }]))
    expect(seen.map((w) => w === 0)).toEqual([true, true, true, false, false])
  })
})

describe('SEC-CRM-1 findings 8, 6, 9: privileged records stay privileged', () => {
  it('8: a sales user cannot record a hard bounce, invalid address or complaint, nor claim legal review; an admin can', async () => {
    for (const reason of ['HARD_BOUNCE', 'INVALID_ADDRESS', 'COMPLAINT']) {
      const r = await rest.post('crm-suppressions', sales.token, { address: `priv.${reason.toLowerCase()}.${++seq}@northwind.example.com`, reason })
      expect(r.status, reason).toBe(403)
      expect(JSON.stringify(r.body)).toMatch(/Only an admin can record/)
    }
    const dnc = await rest.post('crm-suppressions', sales.token, { address: `dnc.${++seq}@northwind.example.com`, reason: 'DO_NOT_CONTACT', source: 'LEGAL_REVIEW' })
    expect(dnc.status).toBe(201)
    expect((dnc.body.doc as Doc).source).toBe('MANUAL')
    expect((await rest.post('crm-suppressions', admin.token, { address: `adm.${++seq}@northwind.example.com`, reason: 'HARD_BOUNCE' })).status).toBe(201)
  })

  it('6: a sales user cannot create an identity review (pre-resolved or not); an admin can', async () => {
    const body = { subject_type: 'CONTACT', reason: 'EMAIL_MATCH_NAME_MISMATCH', state: 'DISMISSED', resolution_note: 'squat', subject_ids: ['x'], dedupe_key: `sec1-squat-${++seq}` }
    expect((await rest.post('crm-identity-reviews', sales.token, body)).status).toBe(403)
    expect((await rest.post('crm-identity-reviews', sales.token, { ...body, state: 'OPEN' })).status).toBe(403)
    expect((await rest.post('crm-identity-reviews', admin.token, { ...body, state: 'OPEN', dedupe_key: `sec1-admin-${seq}` })).status).toBe(201)
  })

  it('9: a sales user cannot mark, change or remove a verified domain, nor rewrite provenance; candidates stay open', async () => {
    const d = `sec1-${++seq}-${randomUUID().slice(0, 8)}.example.com`
    expect((await rest.post('crm-accounts', sales.token, { canonical_name: `Verified (synthetic) ${seq}`, domains: [{ domain: d, domain_status: 'VERIFIED_OWNED' }] })).status).toBe(403)
    const c = await rest.post('crm-accounts', sales.token, { canonical_name: `Candidate (synthetic) ${seq}`, domains: [{ domain: d, domain_status: 'CANDIDATE' }] })
    expect(c.status).toBe(201)
    const id = String((c.body.doc as Doc).id)
    expect((await rest.patch(`crm-accounts/${id}`, sales.token, { domains: [{ domain: d, domain_status: 'VERIFIED_ALIAS' }] })).status).toBe(403)
    expect((await rest.patch(`crm-accounts/${id}`, admin.token, { domains: [{ domain: d, domain_status: 'VERIFIED_OWNED' }] })).status).toBe(200)
    // Removing it, or downgrading it, is the same admin act.
    expect((await rest.patch(`crm-accounts/${id}`, sales.token, { domains: [] })).status).toBe(403)
    expect((await rest.patch(`crm-accounts/${id}`, sales.token, { domains: [{ domain: d, domain_status: 'CANDIDATE' }] })).status).toBe(403)
    // Unrelated edits (and re-sending the same domain list) still work.
    expect((await rest.patch(`crm-accounts/${id}`, sales.token, { canonical_name: `Renamed (synthetic) ${seq}` })).status).toBe(200)
    expect((await rest.patch(`crm-accounts/${id}`, sales.token, { domains: [{ domain: d, domain_status: 'VERIFIED_OWNED' }] })).status).toBe(200)
    // Provenance is evidence: a sales edit cannot retag the import batch an admin may undo.
    const before = ((await p.findByID({ collection: 'crm-accounts', id, ...srv })) as unknown as Doc).provenance as Doc
    expect((await rest.patch(`crm-accounts/${id}`, sales.token, { provenance: { source_system: 'LEGACY_IMPORT', import_batch_id: 'forged-batch' } })).status).toBe(200)
    const after = ((await p.findByID({ collection: 'crm-accounts', id, ...srv })) as unknown as Doc).provenance as Doc
    expect(after.import_batch_id ?? null).toBe(before.import_batch_id ?? null)
    expect(after.source_system).toBe(before.source_system)
  })
})

describe('SEC-CRM-1 finding 28 (closed by DEP-1): list filters cannot probe users through relationships', () => {
  it('filtering CRM records by an assignee email gives no signal about which email exists', async () => {
    const hit = await rest.get(`crm-tasks?where[assignee.email][equals]=${encodeURIComponent('platform-admin.user@example.test')}&limit=1`, sales.token)
    const miss = await rest.get(`crm-tasks?where[assignee.email][equals]=${encodeURIComponent(`nobody.${randomUUID()}@example.test`)}&limit=1`, sales.token)
    expect(hit.status).toBe(miss.status)
    if (hit.status === 200) expect((hit.body as Doc).totalDocs).toBe((miss.body as Doc).totalDocs)
  })
})
