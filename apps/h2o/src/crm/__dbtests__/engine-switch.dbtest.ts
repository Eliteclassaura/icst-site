import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { ersSettings, invalidateErsSettings } from '../ers/settings'
import { setEngineSwitch } from '../ers/switch'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { as, payload, resetCrm, rest, user, type TestUser } from './harness'

/** ENGINE-SCOPE-1a (Auditor F3): the engine ON switch needs admin + step-up; OFF never does; the audit names the actor. */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
let A: CrmSession, S: CrmSession
const srv = { overrideAccess: true as const, depth: 0 }
const SID = 'sid-engine-switch'
const grant = () => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: SID, at: new Date().toISOString() } } as never, ...srv })
const set = async (enabled: boolean) => {
  await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled } as never, ...srv, context: { crmServer: {} } })
  invalidateErsSettings()
}
const isOn = async () => (await ersSettings(p, Date.now() + 1)).enabled === true

beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  A = crmSessionFor(p, admin.user)!
  S = crmSessionFor(p, sales.user)!
})
beforeEach(async () => {
  await resetCrm()
  await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null } as never, ...srv })
  await set(false)
})
afterAll(async () => {
  await set(false)
  await resetCrm()
})

describe('the engine switch', () => {
  it('sales cannot switch it, on or off', async () => {
    expect(await setEngineSwitch(S, SID, { on: true })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await isOn()).toBe(false)
    await set(true)
    expect(await setEngineSwitch(S, SID, { on: false })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await isOn()).toBe(true)
  })

  it('turning it ON needs step-up; without it the engine stays off', async () => {
    expect(await setEngineSwitch(A, SID, { on: true })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await setEngineSwitch(A, null, { on: true })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await isOn()).toBe(false)
  })

  it('with a recent step-up an admin can turn it on, and the audit row names them with false → true', async () => {
    await grant()
    expect(await setEngineSwitch(A, SID, { on: true })).toMatchObject({ ok: true })
    expect(await isOn()).toBe(true)
    const audit = (await p.find({ collection: 'audit-log' as never, where: { collection: { equals: 'crm-ers-settings' } } as never, ...srv, limit: 20 })).docs as unknown as Doc[]
    const mine = audit.filter((a) => String(a.actor) === String(admin.id))
    expect(mine.length).toBeGreaterThan(0)
    const text = JSON.stringify(mine[mine.length - 1])
    expect(text).toContain('enabled')
    expect(text).toContain('true')
    expect(text).toContain('false')
  })

  it('turning it OFF never needs step-up', async () => {
    await set(true)
    expect(await setEngineSwitch(A, null, { on: false })).toMatchObject({ ok: true })
    expect(await isOn()).toBe(false)
  })
})

/** ENGINE-SCOPE-1a.1 (Auditor B1): the same rule holds at the data layer, so no other door turns the engine on. */
describe('the engine cannot be turned on any other way', () => {
  it('updateGlobal as a signed-in admin without the switch is refused and the engine stays off', async () => {
    await expect(p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: true } as never, depth: 0, ...as(admin) })).rejects.toThrow(/verification code/)
    invalidateErsSettings()
    expect(await isOn()).toBe(false)
  })

  it('the REST route is refused even with a fresh step-up recorded', async () => {
    await grant()
    const r = await rest.post('globals/crm-ers-settings', admin.token, { enabled: true })
    expect(r.status).toBeGreaterThanOrEqual(400)
    invalidateErsSettings()
    expect(await isOn()).toBe(false)
  })

  it('a flag from the REST body is not a context, so it cannot be smuggled in', async () => {
    await grant()
    const r = await rest.post('globals/crm-ers-settings', admin.token, { enabled: true, context: { crmServer: { engineOnStepUp: true } } })
    expect(r.status).toBeGreaterThanOrEqual(400)
    invalidateErsSettings()
    expect(await isOn()).toBe(false)
  })

  it('a context in the QUERY STRING is refused too', async () => {
    await grant()
    const r = await rest.post('globals/crm-ers-settings?context[crmServer][engineOnStepUp]=true', admin.token, { enabled: true })
    expect(r.status).toBeGreaterThanOrEqual(400)
    invalidateErsSettings()
    expect(await isOn()).toBe(false)
  })

  it('turning it OFF through the global still works', async () => {
    await set(true)
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: false } as never, depth: 0, ...as(admin) })
    invalidateErsSettings()
    expect(await isOn()).toBe(false)
    await set(true)
    const r = await rest.post('globals/crm-ers-settings', admin.token, { enabled: false })
    expect(r.status).toBeLessThan(400)
    invalidateErsSettings()
    expect(await isOn()).toBe(false)
  })

  it('other settings still save through the global while the engine is already on or off', async () => {
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { daily_cap: 40 } as never, depth: 0, ...as(admin) })
    invalidateErsSettings()
    expect((await ersSettings(p, Date.now() + 1)).enabled).toBe(false)
  })

  it('the switch with step-up still works, and a server script with no signed-in user is allowed', async () => {
    await grant()
    expect(await setEngineSwitch(A, SID, { on: true })).toMatchObject({ ok: true })
    expect(await isOn()).toBe(true)
    await set(false)
    await set(true)
    expect(await isOn()).toBe(true)
  })
})
