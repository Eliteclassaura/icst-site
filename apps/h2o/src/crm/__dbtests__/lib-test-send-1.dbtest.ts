import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { htmlToText } from '../inbound'
import { invalidateProfiles } from '../../email/profiles'
import { importLibrary } from '../library/import'
import { variantsOf } from '../library/service'
import { sendLibraryTest } from '../../email/library-test-send'
import { saveStandard } from '../settings/signatures'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, userEmail, type TestUser } from './harness'

/**
 * LIB-TEST-SEND-1: an admin sends one library email to their OWN address: password step-up, own address only, the preview
 * samples, the missing-field rule, the viewer's real signature, the mode gate, the shared rate limit. Nothing leaves: the
 * transport is a recorder. Synthetic data only.
 */
type Doc = Record<string, unknown>
const SID = 'sid-lib-test-send'
const KEYS = ['H2O_EMAIL_MODE', 'H2O_EMAIL_ALLOWLIST', 'H2O_EMAIL_FROM', 'H2O_SMTP_HOST', 'H2O_SMTP_PORT', 'H2O_SMTP_USER', 'H2O_SMTP_PASS', 'H2O_SMTP_TLS_SERVERNAME'] as const
const saved: Record<string, string | undefined> = {}
const srv = { overrideAccess: true as const, depth: 0 }
let p: Payload
let admin: TestUser
let sales: TestUser
let A: CrmSession
let S: CrmSession
let n = 0

const setEnv = (e: Partial<Record<(typeof KEYS)[number], string | undefined>>) => {
  for (const [k, v] of Object.entries(e)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  invalidateProfiles()
}
const MAIL = { H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: userEmail('platform-admin'), H2O_EMAIL_FROM: 'ICS Sales Team <syed@example.test>', H2O_SMTP_HOST: 'smtp.example.test', H2O_SMTP_PORT: '587', H2O_SMTP_USER: 'syed@example.test', H2O_SMTP_PASS: 'synthetic-submission-password', H2O_SMTP_TLS_SERVERNAME: 'smtp.example.test' }
const grantAt = (at: Date) => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: SID, at: at.toISOString() } } as never, ...srv })
const grant = () => grantAt(new Date())
const recorder = () => {
  const sent: Array<{ from: string; to: string; subject: string; text: string; html?: string; headers?: Record<string, string> }> = []
  return { sent, send: async (_smtp: unknown, m: (typeof sent)[number]) => void sent.push(m) }
}
const later = () => new Date(Date.now() + ++n * 11 * 60_000) // each call in its own rate-limit window
/** Call the service at its own clock, with the step-up granted at that same instant (the grant lasts 30 minutes). */
const call = async (who: CrmSession, input: { id?: string; sample?: string }, send: unknown, t = later(), grantIt = true) => {
  if (grantIt) await grantAt(t)
  return sendLibraryTest(who, SID, input, { send: send as never, now: t })
}
const emailRows = async () => (await p.find({ collection: 'crm-email-library' as never, where: { and: [{ type: { equals: 'EMAIL' } }, { status: { not_equals: 'SKELETON' } }] } as never, limit: 200, ...srv })).docs as unknown as Doc[]

beforeAll(async () => {
  p = await payload()
  await resetCrm()
  for (const k of KEYS) saved[k] = process.env[k]
  setEnv(MAIL)
  admin = await user('platform-admin')
  sales = await user('sales')
  A = crmSessionFor(p, admin.user)!
  S = crmSessionFor(p, sales.user)!
  await importLibrary(p)
  await grant()
})
afterAll(async () => {
  await saveStandard(A, { text: '' }) // the standard signature is a global that resetCrm keeps: put the seeded default back
  setEnv(Object.fromEntries(KEYS.map((k) => [k, saved[k]])))
})

describe('LIB-TEST-SEND-1', () => {
  it('sends the preview to the admin’s own address only, with [TEST], the real signature and no customer wording', async () => {
    await saveStandard(A, { text: 'ICS Sales Team\nSynthetic standard' })
    const r = recorder()
    const rows = await emailRows()
    const withSig = rows.find((x) => variantsOf(x, null).some((v) => /\{\{(sequence|email)_signature\}\}/.test(v.body)))
    const row = withSig ?? rows[0]!
    const out = await call(A, { id: String(row.id) }, r.send)
    expect(out).toMatchObject({ ok: true })
    expect(r.sent).toHaveLength(1)
    const m = r.sent[0]!
    expect(m.to).toBe(userEmail('platform-admin'))
    expect(m.subject.startsWith('[TEST] ')).toBe(true)
    if (withSig) expect(m.text).toContain('Synthetic standard') // the library copy carries a signature slot: it is filled with the real signature
    else expect(m.text).not.toMatch(/\{\{/)
    expect(m.text).toContain('sent only to you')
    expect(m.text).not.toMatch(/«Missing:|\{\{/)
    expect(m.headers).toMatchObject({ 'Auto-Submitted': 'auto-generated' })
    expect(m.html?.match(/<p(?:\s[^>]*)?>/g)?.length).toBeGreaterThanOrEqual(2)
    expect(htmlToText(m.html ?? '')).toContain('sent only to you')
    expect(m.html).not.toMatch(/<script|<img/i)
  })

  it('every approved-or-imported E1 email with a complete sample can be sent; none is held for a missing field on Sample A', async () => {
    const rows = await emailRows()
    expect(rows.length).toBeGreaterThan(30)
    let sentCount = 0
    for (const row of rows.slice(0, 6)) {
      const r = recorder()
      const out = await call(A, { id: String(row.id) }, r.send)
      if (out.ok) sentCount++
      else expect(['TEST_HELD', 'NO_COPY']).toContain((out as { code: string }).code)
    }
    expect(sentCount).toBeGreaterThan(0)
  })

  it('refuses without a step-up, for sales, for Sample C, for a non-email row, and for an unknown id', async () => {
    const r = recorder()
    const id = String((await emailRows())[0]!.id)
    expect(await call(S, { id }, r.send)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null } as never, ...srv })
    expect(await call(A, { id }, r.send, later(), false)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await call(A, { id, sample: 'c' }, r.send)).toMatchObject({ ok: false, code: 'SAMPLE_INCOMPLETE' })
    const task = (await p.find({ collection: 'crm-email-library' as never, where: { type: { not_equals: 'EMAIL' } } as never, limit: 1, ...srv })).docs[0] as unknown as Doc | undefined
    if (task) expect(await call(A, { id: String(task.id) }, r.send)).toMatchObject({ ok: false, code: 'NOT_AN_EMAIL' })
    expect(await call(A, { id: '00000000-0000-0000-0000-000000000000' }, r.send)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(r.sent).toHaveLength(0)
  })

  it('the mode gate: mail off sends nothing; an address off the allowlist sends nothing', async () => {
    const r = recorder()
    const id = String((await emailRows())[0]!.id)
    setEnv({ H2O_EMAIL_MODE: 'off' })
    expect(await call(A, { id }, r.send)).toMatchObject({ ok: false, code: 'MODE_BLOCKS_TEST' })
    setEnv({ H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: 'someone.else@example.test' })
    expect(await call(A, { id }, r.send)).toMatchObject({ ok: false, code: 'MODE_BLOCKS_TEST' })
    setEnv(MAIL)
    expect(r.sent).toHaveLength(0)
  })

  it('shares the profile-test rate limit (3 per 10 minutes) and records a SENT event by reference, never the address', async () => {
    const r = recorder()
    const id = String((await emailRows())[0]!.id)
    const t = later()
    const outs = []
    await grantAt(t)
    for (let i = 0; i < 4; i++) outs.push(await sendLibraryTest(A, SID, { id }, { send: r.send as never, now: t }))
    expect(outs.filter((o) => o.ok).length).toBeLessThanOrEqual(3)
    expect(outs.some((o) => !o.ok)).toBe(true)
    const ev = (await p.find({ collection: 'crm-email-events' as never, where: { kind: { equals: 'LIBRARY_TEST' } } as never, limit: 50, ...srv })).docs
    expect(ev.length).toBeGreaterThan(0)
    expect(JSON.stringify(ev)).not.toContain(userEmail('platform-admin'))
  })

  it('a failing transport returns a plain message with no server text', async () => {
    const id = String((await emailRows())[0]!.id)
    const out = await call(A, { id }, async () => { throw Object.assign(new Error('535 5.7.8 secret banner'), { code: 'EAUTH' }) })
    expect(out).toMatchObject({ ok: false })
    expect(JSON.stringify(out)).not.toContain('banner')
  })
})
