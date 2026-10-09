import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { importLibrary } from '../library/import'
import { changeApprovalMode, runImport } from '../library/service'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * EMAIL-LIB-1 follow-up (Security Auditor): service gates, audit actor + from→to, and the AUTO default on a fresh
 * database. Synthetic only; nothing sends.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
let A: CrmSession, S: CrmSession
const srv = { overrideAccess: true as const, depth: 0 }
const SID = 'sid-library-gates'
const LIB = 'crm-email-library' as never
const grant = () => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: SID, at: new Date().toISOString() } } as never, ...srv })
const emailRow = async (): Promise<Doc> =>
  (await p.find({ collection: LIB, where: { and: [{ type: { equals: 'EMAIL' } }, { status: { equals: 'IMPORTED_EXACT' } }] } as never, limit: 1, ...srv })).docs[0] as unknown as Doc

beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  A = crmSessionFor(p, admin.user)!
  S = crmSessionFor(p, sales.user)!
})
beforeEach(async () => {
  await resetCrm()
  await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null } as never, ...srv })
})
afterAll(async () => {
  await resetCrm()
})

describe('approval-mode and import gates', () => {
  it('sales is forbidden; an admin without step-up is refused; a short reason and a skeleton are refused', async () => {
    await importLibrary(p)
    const r = await emailRow()
    const input = { id: String(r.id), mode: 'REQUIRED', reason: 'owner asked for review' }
    expect(await changeApprovalMode(S, SID, input)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    // STEP-UP-1: only switching to AUTOMATIC sending needs the step-up; the stricter modes never do.
    expect(await changeApprovalMode(A, SID, { ...input, mode: 'AUTO' })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await changeApprovalMode(A, SID, { ...input, reason: 'x' })).toMatchObject({ ok: false, code: 'LIBRARY_REASON_REQUIRED' })
    await grant()
    expect(await changeApprovalMode(A, SID, { ...input, reason: 'x' })).toMatchObject({ ok: false, code: 'LIBRARY_REASON_REQUIRED' })
    const sk = (await p.find({ collection: LIB, where: { status: { equals: 'SKELETON' } } as never, limit: 1, ...srv })).docs[0] as unknown as Doc
    expect(await changeApprovalMode(A, SID, { id: String(sk.id), mode: 'REQUIRED', reason: 'try it' })).toMatchObject({ ok: false, code: 'LIBRARY_SKELETON' })
  })

  it('a real import needs the step-up; a dry run does not and writes nothing; sales cannot do either', async () => {
    expect(await runImport(S, SID, true)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await runImport(A, SID, true)).toMatchObject({ ok: true })
    expect((await p.count({ collection: LIB, overrideAccess: true })).totalDocs).toBe(0)
    expect(await runImport(A, SID, false)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect((await p.count({ collection: LIB, overrideAccess: true })).totalDocs).toBe(0)
    await grant()
    expect(await runImport(A, SID, false)).toMatchObject({ ok: true })
    expect((await p.count({ collection: LIB, overrideAccess: true })).totalDocs).toBeGreaterThan(80)
  })

  it('success writes by / at / reason, and the audit row names the actor with from → to', async () => {
    await grant()
    await runImport(A, SID, false)
    const r = await emailRow()
    expect(r.approval_mode).toBe('AUTO')
    expect(await changeApprovalMode(A, SID, { id: String(r.id), mode: 'REQUIRED', reason: 'owner asked for review' })).toMatchObject({ ok: true })
    const after = (await p.findByID({ collection: LIB, id: String(r.id), ...srv })) as unknown as Doc
    expect(after).toMatchObject({ approval_mode: 'REQUIRED', approval_reason: 'owner asked for review' })
    expect(String((after.approval_changed_by as Doc | string) && ((after.approval_changed_by as Doc).id ?? after.approval_changed_by))).toBe(String(admin.id))
    expect(after.approval_changed_at).toBeTruthy()
    const audit = (await p.find({ collection: 'audit-log' as never, where: { and: [{ collection: { equals: 'crm-email-library' } }, { docId: { equals: String(r.id) } }, { action: { equals: 'update' } }] } as never, ...srv, limit: 20 })).docs as unknown as Doc[]
    expect(audit.length).toBeGreaterThan(0)
    const row = audit[audit.length - 1]!
    expect(String(row.actor)).toBe(String(admin.id))
    expect(JSON.stringify(row)).toContain('AUTO')
    expect(JSON.stringify(row)).toContain('REQUIRED')
    expect(JSON.stringify(row)).not.toContain('owner asked for review') // the free-text reason stays on the row only
  })
})

describe('AUTO is the effective default for every importable program on a fresh database', () => {
  it('every email row is AUTO and records the contract recommendation (REQUIRED) for Details', async () => {
    await importLibrary(p)
    const rows = (await p.find({ collection: LIB, where: { type: { equals: 'EMAIL' } } as never, limit: 1000, pagination: false, ...srv })).docs as unknown as Doc[]
    expect(rows.length).toBeGreaterThan(60)
    expect(rows.every((r) => r.approval_mode === 'AUTO')).toBe(true)
    expect(rows.filter((r) => String(r.program).startsWith('E')).every((r) => r.approval_recommended === 'REQUIRED')).toBe(true)
  })
})

describe('engine switch audit', () => {
  it('an engine on/off change by an admin is audited with the actor and from → to', async () => {
    const { engineSwitchAction } = await import('../../app/(crm)/crm/sequences/actions')
    void engineSwitchAction
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: false } as never, ...srv, context: { crmServer: {} } })
    // ENGINE-SCOPE-1a.1: ON goes through the step-up switch (the global alone refuses it).
    const { setEngineSwitch } = await import('../ers/switch')
    const { crmSessionFor } = await import('../workspace/session')
    await p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: 'sid-gates', at: new Date().toISOString() } } as never, ...srv })
    expect(await setEngineSwitch(crmSessionFor(p, admin.user)!, 'sid-gates', { on: true })).toMatchObject({ ok: true })
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: false } as never, ...srv, context: { crmServer: {} } })
    const audit = (await p.find({ collection: 'audit-log' as never, where: { collection: { equals: 'crm-ers-settings' } } as never, ...srv, limit: 20 })).docs as unknown as Doc[]
    const mine = audit.filter((a) => String(a.actor) === String(admin.id))
    expect(mine.length).toBeGreaterThan(0)
    expect(JSON.stringify(mine[mine.length - 1])).toMatch(/enabled/)
  })
})
