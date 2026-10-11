import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { invalidateProfiles } from '../../email/profiles'
import { makeProfileActive, saveProfile, testSendProfile } from '../../email/sending-settings'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, userEmail, type TestUser } from './harness'

/** SENDER-UX-1: one-click Make active, the real error on a failed test, and the From/login mismatch advice. Synthetic. */
type Doc = Record<string, unknown>
const SID = 'sid-sender-ux-1'
const KEYS = ['H2O_SETTINGS_KEY', 'H2O_EMAIL_SENDER_DOMAINS', 'H2O_SMTP_CUSTOM_HOSTS', 'H2O_EMAIL_MODE', 'H2O_EMAIL_ALLOWLIST', 'H2O_EMAIL_FROM', 'H2O_SMTP_HOST', 'H2O_SMTP_PORT', 'H2O_SMTP_USER', 'H2O_SMTP_PASS', 'H2O_SMTP_TLS_SERVERNAME'] as const
const saved: Record<string, string | undefined> = {}
const srv = { overrideAccess: true as const, depth: 0 }
let p: Payload
let admin: TestUser
let sales: TestUser
let A: CrmSession
let S: CrmSession
let n = 0
const notify = async () => undefined
const base = { name: 'Workspace', preset: 'CUSTOM', use: 'TRANSACTIONAL', host: 'smtp.example.test', port: '587', tls_servername: 'smtp.example.test', username: 'box@example.test', from_address: 'syed@example.test', from_name: 'ICS Sales Team', password: 'synthetic-pw' }
const later = () => new Date(Date.now() + ++n * 11 * 60_000)
const grantAt = (at: Date) => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: SID, at: at.toISOString() } } as never, ...srv })
const deps = (t: Date, extra: Record<string, unknown> = {}) => ({ verify: async () => undefined, resolve: async () => [{ address: '93.184.216.34' }], notify, now: t, ...extra }) as never
const active = async (id: string) => ((await p.findByID({ collection: 'crm-sending-profiles' as never, id, ...srv })) as unknown as Doc).active

beforeAll(async () => {
  p = await payload()
  await resetCrm()
  for (const k of KEYS) saved[k] = process.env[k]
  Object.assign(process.env, { H2O_SETTINGS_KEY: 'synthetic-settings-key-0000000000000000000000', H2O_EMAIL_SENDER_DOMAINS: 'example.test', H2O_SMTP_CUSTOM_HOSTS: 'smtp.example.test', H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: userEmail('platform-admin'), H2O_EMAIL_FROM: 'ICS Sales Team <syed@example.test>', H2O_SMTP_HOST: 'smtp.example.test', H2O_SMTP_PORT: '587', H2O_SMTP_USER: 'syed@example.test', H2O_SMTP_PASS: 'synthetic-submission-password', H2O_SMTP_TLS_SERVERNAME: 'smtp.example.test' })
  admin = await user('platform-admin')
  sales = await user('sales')
  A = crmSessionFor(p, admin.user)!
  S = crmSessionFor(p, sales.user)!
})
afterAll(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  invalidateProfiles()
})

describe('SENDER-UX-1', () => {
  it('Make active checks then turns on in one action; a failed check returns the real reason and leaves it off', async () => {
    let t = later()
    await grantAt(t)
    const made = await saveProfile(A, SID, base, deps(t))
    const id = (made as { id: string }).id
    expect(await makeProfileActive(S, SID, id, deps(t))).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    t = later()
    await grantAt(t)
    const bad = await makeProfileActive(A, SID, id, deps(t, { verify: async () => Promise.reject(Object.assign(new Error('535 secret banner'), { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN' })) }))
    expect(bad).toMatchObject({ ok: false })
    expect((bad as { message: string }).message).toMatch(/app password|user name or password/)
    expect(JSON.stringify(bad)).not.toContain('banner')
    expect(await active(id)).toBe(false)
    t = later()
    await grantAt(t)
    expect(await makeProfileActive(A, SID, id, deps(t))).toMatchObject({ ok: true })
    expect(await active(id)).toBe(true)
  })

  it('a failed test send says what failed in plain words and gives the code; a good one names the sender to look for', async () => {
    const id = String(((await p.find({ collection: 'crm-sending-profiles' as never, ...srv })).docs[0] as unknown as Doc).id)
    let t = later()
    await grantAt(t)
    const bad = await testSendProfile(A, SID, id, deps(t, { send: async () => { throw Object.assign(new Error('535 secret banner'), { code: 'EAUTH' }) } }))
    expect(bad).toMatchObject({ ok: false })
    expect((bad as { message: string }).message).toContain('did not send')
    expect((bad as { message: string }).message).toMatch(/code /)
    expect(JSON.stringify(bad)).not.toContain('banner')
    t = later()
    await grantAt(t)
    const good = await testSendProfile(A, SID, id, deps(t, { send: async () => undefined }))
    expect(good).toMatchObject({ ok: true })
    expect((good as { message: string }).message).toContain('syed@example.test')
    expect((good as { message: string }).message).toContain('may replace the From') // login box@… differs from the sender
  })

  it('saving a profile whose sender differs from the login says so; one that matches does not', async () => {
    let t = later()
    await grantAt(t)
    const differ = await saveProfile(A, SID, { ...base, name: 'Differs' }, deps(t))
    expect((differ as { message: string }).message).toContain('may replace the From')
    t = later()
    await grantAt(t)
    const same = await saveProfile(A, SID, { ...base, name: 'Same', username: 'syed@example.test' }, deps(t))
    expect((same as { message: string }).message).not.toContain('replace the From')
    expect((same as { message: string }).message).not.toContain('Send-as')
  })
})
