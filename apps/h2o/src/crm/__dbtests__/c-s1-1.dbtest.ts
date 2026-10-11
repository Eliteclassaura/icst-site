import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkProfile, saveProfile, setProfileActive, deleteProfile } from '../../email/sending-settings'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * CRM-C-S1-1 (Security Auditor C-S1): every change to a sending profile emails every admin. The notice names the kind of
 * change, the profile's name and who made it; it never carries a host, user name, password or address. Synthetic only.
 */
type Doc = Record<string, unknown>
const srv = { overrideAccess: true as const, depth: 0 }
const SID = 'sid-c-s1-1'
const KEYS = ['H2O_SETTINGS_KEY', 'H2O_EMAIL_SENDER_DOMAINS', 'H2O_SMTP_CUSTOM_HOSTS'] as const
const saved: Record<string, string | undefined> = {}
let p: Payload
let admin: TestUser
let sales: TestUser
let A: CrmSession

const SECRET = 'synthetic-smtp-password-ZZ9'
const base = { name: 'Synthetic profile', preset: 'CUSTOM', use: 'TRANSACTIONAL', host: 'smtp.example.test', port: '587', tls_servername: 'smtp.example.test', username: 'box@example.test', from_address: 'sales@example.test', from_name: 'ICS Sales Team' }

function recorder(fail = false) {
  const sent: Array<{ to: string; subject: string; text: string }> = []
  return { sent, notify: async (to: string, subject: string, text: string) => { if (fail) throw new Error('mail down'); sent.push({ to, subject, text }) } }
}
const grant = () => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: SID, at: new Date().toISOString() } } as never, ...srv })
const verify = { verify: async () => undefined, resolve: async () => [{ address: '93.184.216.34' }] }
const adminCount = async () => (await p.find({ collection: 'users', where: { roles: { in: ['platform-admin', 'client-admin'] } } as never, limit: 100, ...srv })).totalDocs
const T0 = new Date().toISOString()
const noticeAudits = async () => (await p.find({ collection: 'audit-log', where: { and: [{ action: { equals: 'mfa-admin-notice' } }, { createdAt: { greater_than_equal: T0 } }] } as never, sort: 'createdAt', limit: 100, ...srv })).docs as unknown as Doc[]

beforeAll(async () => {
  p = await payload()
  await resetCrm()
  for (const k of KEYS) saved[k] = process.env[k]
  process.env.H2O_SETTINGS_KEY = 'synthetic-settings-key-0000000000000000000000'
  process.env.H2O_EMAIL_SENDER_DOMAINS = 'example.test'
  process.env.H2O_SMTP_CUSTOM_HOSTS = '*.example.test'
  admin = await user('platform-admin')
  sales = await user('sales')
  A = crmSessionFor(p, admin.user)!
  await grant()
})
afterAll(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
})

describe('C-S1: every profile change tells every admin', () => {
  it('create, save, activate, deactivate and delete each send one notice to every admin; nothing sensitive is in the text', async () => {
    const r = recorder()
    const deps = { ...verify, notify: r.notify }
    const n = await adminCount()
    expect(n).toBeGreaterThan(0)
    const created = await saveProfile(A, SID, { ...base, password: SECRET }, deps)
    expect(created).toMatchObject({ ok: true })
    const id = (created as { id: string }).id
    expect(r.sent).toHaveLength(n)
    expect(r.sent[0]!.subject).toBe('A CRM sending profile was added')
    expect(await checkProfile(A, SID, id, deps)).toMatchObject({ ok: true })
    expect(r.sent).toHaveLength(n) // a check changes nothing, so it tells nobody
    expect(await saveProfile(A, SID, { ...base, id, host: 'smtp2.example.test', tls_servername: 'smtp2.example.test', password: SECRET }, deps)).toMatchObject({ ok: true })
    expect(r.sent).toHaveLength(2 * n)
    expect(r.sent[n]!.subject).toBe('A CRM sending profile was changed')
    expect(await checkProfile(A, SID, id, deps)).toMatchObject({ ok: true })
    expect(await setProfileActive(A, SID, id, true, deps)).toMatchObject({ ok: true })
    expect(r.sent).toHaveLength(3 * n)
    expect(r.sent[2 * n]!.subject).toBe('A CRM sending profile was turned on')
    expect(await setProfileActive(A, SID, id, false, deps)).toMatchObject({ ok: true })
    expect(r.sent).toHaveLength(4 * n)
    expect(r.sent[3 * n]!.subject).toBe('A CRM sending profile was turned off')
    expect(await deleteProfile(A, SID, id, deps)).toMatchObject({ ok: true })
    expect(r.sent).toHaveLength(5 * n)
    expect(r.sent[4 * n]!.subject).toBe('A CRM sending profile was deleted')
    // Every recipient is an admin; none is the sales user.
    const to = new Set(r.sent.map((m) => m.to))
    expect(to.size).toBe(n)
    expect(to.has(sales.user.email as string)).toBe(false)
    // No host, user name, password or address in any text or subject; the name and the actor are named.
    for (const m of r.sent) {
      const body = `${m.subject}\n${m.text}`
      for (const bad of ['example.test', 'smtp', SECRET, 'box@', 'sales@', '@']) expect(body, bad).not.toContain(bad)
      expect(m.text).toContain('“Synthetic profile”')
      expect(m.text).toContain('Changed by ')
    }
  })

  it('is audited with counts only', async () => {
    const rows = (await noticeAudits()).filter((r) => String((r.detail as Doc | null)?.for ?? '').startsWith('profile-'))
    expect(rows.map((r) => (r.detail as Doc).for)).toEqual(['profile-created', 'profile-saved', 'profile-activated', 'profile-deactivated', 'profile-deleted'])
    const n = await adminCount()
    for (const r of rows) {
      expect(r.detail).toEqual({ security: true, for: (r.detail as Doc).for, recipients: n, sent: n, failed: 0 })
      expect(JSON.stringify(r)).not.toMatch(/@|example\.test|smtp/)
      expect(String(r.actor)).toBe(admin.id)
    }
  })

  it('the "turned on" notice is sent BEFORE the switch, so it never travels through the profile being turned on', async () => {
    await grant()
    const created = await saveProfile(A, SID, { ...base, name: 'Order profile', password: SECRET }, { ...verify, notify: recorder().notify })
    const id = (created as { id: string }).id
    expect(await checkProfile(A, SID, id, verify)).toMatchObject({ ok: true })
    const states: boolean[] = []
    const seen = async (to: string, subject: string) => {
      if (subject.includes('turned on')) states.push(((await p.findByID({ collection: 'crm-sending-profiles', id, ...srv })) as unknown as Doc).active === true)
      void to
    }
    expect(await setProfileActive(A, SID, id, true, { ...verify, notify: seen })).toMatchObject({ ok: true })
    expect(states.length).toBeGreaterThan(0)
    expect(states.every((a) => a === false)).toBe(true)
    expect(((await p.findByID({ collection: 'crm-sending-profiles', id, ...srv })) as unknown as Doc).active).toBe(true)
    await setProfileActive(A, SID, id, false, { ...verify, notify: recorder().notify })
  })

  it('a failing mailer never changes the outcome, and the audit records the failure counts', async () => {
    const r = recorder(true)
    const out = await saveProfile(A, SID, { ...base, name: 'Second profile', password: SECRET }, { ...verify, notify: r.notify })
    expect(out).toMatchObject({ ok: true })
    const last = (await noticeAudits()).at(-1)!
    expect((last.detail as Doc).failed).toBe(await adminCount())
    expect((last.detail as Doc).sent).toBe(0)
  })

  it('a refused change (no step-up, or not an admin) tells nobody', async () => {
    const r = recorder()
    const deps = { ...verify, notify: r.notify }
    await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null } as never, ...srv })
    expect(await saveProfile(A, SID, { ...base, name: 'Third', password: SECRET }, deps)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    const S = crmSessionFor(p, sales.user)!
    expect(await saveProfile(S, SID, { ...base, name: 'Fourth', password: SECRET }, deps)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(r.sent).toHaveLength(0)
  })
})
