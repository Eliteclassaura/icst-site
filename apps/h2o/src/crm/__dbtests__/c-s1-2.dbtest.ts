import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readEmailConfig } from '../../email/config'
import { invalidateProfiles, resolveSending } from '../../email/profiles'
import { checkProfile, saveProfile, setProfileActive } from '../../email/sending-settings'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/** CRM-C-S1-2: a sending profile's host is default-deny (H2O_SMTP_CUSTOM_HOSTS). Synthetic only. */
const SID = 'sid-c-s1-2'
const KEYS = ['H2O_SETTINGS_KEY', 'H2O_EMAIL_SENDER_DOMAINS', 'H2O_SMTP_CUSTOM_HOSTS'] as const
const saved: Record<string, string | undefined> = {}
let p: Payload
let admin: TestUser
let A: CrmSession
const srv = { overrideAccess: true as const, depth: 0 }
const deps = { verify: async () => undefined, resolve: async () => [{ address: '93.184.216.34' }], notify: async () => undefined }
const custom = { name: 'Custom', preset: 'CUSTOM', use: 'TRANSACTIONAL', host: 'mail.partner.example', port: '587', tls_servername: 'mail.partner.example', username: 'box@example.test', from_address: 'sales@example.test', from_name: 'ICS Sales Team', password: 'synthetic-pw' }
const grant = () => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: SID, at: new Date().toISOString() } } as never, ...srv })
const setHosts = (v: string | undefined) => { if (v === undefined) delete process.env.H2O_SMTP_CUSTOM_HOSTS; else process.env.H2O_SMTP_CUSTOM_HOSTS = v }

beforeAll(async () => {
  p = await payload()
  await resetCrm()
  for (const k of KEYS) saved[k] = process.env[k]
  process.env.H2O_SETTINGS_KEY = 'synthetic-settings-key-0000000000000000000000'
  process.env.H2O_EMAIL_SENDER_DOMAINS = 'example.test'
  admin = await user('platform-admin')
  A = crmSessionFor(p, admin.user)!
  await grant()
})
afterAll(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  invalidateProfiles()
})

describe('C-S1-2: default-deny host allowlist', () => {
  it('with nothing configured a custom host cannot be saved, and the message says what to do', async () => {
    setHosts(undefined)
    const out = await saveProfile(A, SID, custom, deps)
    expect(out).toMatchObject({ ok: false, code: 'PROFILE_HOST_NOT_ALLOWED' })
    expect((out as { message: string }).message).toContain('Ask the server operator to allow this host.')
    expect(await saveProfile(A, SID, { ...custom, preset: 'STALWART' }, deps)).toMatchObject({ ok: false, code: 'PROFILE_HOST_NOT_ALLOWED' })
    expect((await p.find({ collection: 'crm-sending-profiles' as never, ...srv })).totalDocs).toBe(0)
  })

  it('a listed host (exact or *.suffix) saves, checks and turns on; the Workspace preset never needed listing', async () => {
    setHosts('mail.partner.example')
    const made = await saveProfile(A, SID, custom, deps)
    expect(made).toMatchObject({ ok: true })
    const id = (made as { id: string }).id
    expect(await checkProfile(A, SID, id, deps)).toMatchObject({ ok: true })
    expect(await setProfileActive(A, SID, id, true, deps)).toMatchObject({ ok: true })
    setHosts(undefined)
    invalidateProfiles()
    const gmail = await saveProfile(A, SID, { ...custom, name: 'Workspace', preset: 'GMAIL', host: 'smtp.gmail.com', tls_servername: 'smtp.gmail.com', password: 'abcd efgh ijkl mnop' }, deps)
    expect(gmail).toMatchObject({ ok: true })
    setHosts('*.partner.example')
    expect(await saveProfile(A, SID, { ...custom, name: 'Suffix', use: 'REVENUE', host: 'smtp.partner.example', tls_servername: 'smtp.partner.example' }, deps)).toMatchObject({ ok: true })
  })

  it('upgrade and removal: an active custom profile whose host is no longer listed stops sending (fails closed, no fallback) and cannot be turned on again', async () => {
    setHosts('mail.partner.example')
    invalidateProfiles()
    const id = String(((await p.find({ collection: 'crm-sending-profiles' as never, where: { name: { equals: 'Custom' } } as never, ...srv })).docs[0] as unknown as { id: string }).id)
    const ok = await resolveSending(p, readEmailConfig(), 'TRANSACTIONAL', Date.now(), { resolve: deps.resolve })
    expect(ok).toMatchObject({ ok: true, source: 'profile' })
    setHosts(undefined)
    invalidateProfiles()
    const closed = await resolveSending(p, readEmailConfig(), 'TRANSACTIONAL', Date.now(), { resolve: deps.resolve })
    expect(closed).toMatchObject({ ok: false, source: 'profile', code: 'PROFILE_HOST_NOT_ALLOWED' })
    await setProfileActive(A, SID, id, false, deps)
    expect(await checkProfile(A, SID, id, deps)).toMatchObject({ ok: false, code: 'PROFILE_HOST_NOT_ALLOWED' })
    expect(await setProfileActive(A, SID, id, true, deps)).toMatchObject({ ok: false, code: 'PROFILE_HOST_NOT_ALLOWED' })
  })
})
