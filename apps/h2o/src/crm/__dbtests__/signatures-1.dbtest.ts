import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'
import { SAMPLE_RECIPIENTS, renderSample } from '../library/service'
import { STANDARD_SIGNATURE_DEFAULT } from '../globals/signatures'
import { listUserSignatures, loadStandard, resolveSignature, saveStandard, saveUserSignature, signatureMergeValues } from '../settings/signatures'
import { mergeValuesFor } from '../settings/templates'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/** SIGNATURES-1: standard + per-user signatures, resolution, advisory, audit, permissions. Synthetic data only. */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser
let sales: TestUser
let A: CrmSession
let S: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
const auditRows = async (action: string) => (await p.find({ collection: 'audit-log', where: { collection: { in: ['crm-signatures', 'users'] } } as never, limit: 200, ...sys })).docs.filter((d) => (d as unknown as Doc).action === action)

beforeAll(async () => {
  p = await payload()
  await resetCrm()
  admin = await user('platform-admin')
  sales = await user('sales')
  A = crmSessionFor(p, admin.user)!
  S = crmSessionFor(p, sales.user)!
})

describe('SIGNATURES-1 the standard signature', () => {
  it('is seeded and never contains a phone number or address', async () => {
    const t = await loadStandard(p)
    expect(t.startsWith('ICS Sales Team')).toBe(true)
    expect(/\d{3}/.test(STANDARD_SIGNATURE_DEFAULT)).toBe(false)
  })

  it('the seed is idempotent: running its INSERT again changes nothing and never overwrites an edit', async () => {
    const saved = await saveStandard(A, { text: 'ICS Sales Team\nSynthetic edit' })
    expect(saved.ok).toBe(true)
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle
    await drizzle.execute(sql`INSERT INTO "crm_signatures" ("standard_text", "updated_at", "created_at") SELECT 'x', now(), now() WHERE NOT EXISTS (SELECT 1 FROM "crm_signatures")`)
    const n = await drizzle.execute(sql`SELECT count(*)::int AS n FROM "crm_signatures"`)
    expect(Number(n.rows[0]!.n)).toBe(1)
    expect(await loadStandard(p)).toBe('ICS Sales Team\nSynthetic edit')
  })

  it('only admins change it; the change is audited with lengths and no text', async () => {
    const no = await saveStandard(S, { text: 'Nope' })
    expect(no.ok).toBe(false)
    const ok = await saveStandard(A, { text: 'ICS Sales Team\nIndustrial Cooling Solutions' })
    expect(ok.ok).toBe(true)
    const rows = await auditRows('signature-standard-updated')
    expect(rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(rows)).not.toContain('Industrial Cooling Solutions')
  })

  it('a blank value restores the default', async () => {
    await saveStandard(A, { text: '' })
    expect(await loadStandard(p)).toBe(STANDARD_SIGNATURE_DEFAULT)
  })
})

describe('SIGNATURES-1 resolution', () => {
  it('uses the standard by default, a sequence always uses the standard', async () => {
    const r = await resolveSignature(p, sales.id)
    expect(r.source).toBe('STANDARD')
    expect((await resolveSignature(p, null)).source).toBe('STANDARD')
  })

  it('a person with the toggle OFF and their own text uses it; toggling back restores the standard; sequences stay standard', async () => {
    expect((await saveUserSignature(S, { text: 'Synthetic Sales\nSales Engineer', useStandard: false })).ok).toBe(true)
    const own = await resolveSignature(p, sales.id)
    expect(own).toMatchObject({ source: 'USER', text: 'Synthetic Sales\nSales Engineer' })
    expect((await signatureMergeValues(p, sales.id)).sequence_signature).toBe(await loadStandard(p))
    expect((await saveUserSignature(S, { text: 'Synthetic Sales\nSales Engineer', useStandard: true })).ok).toBe(true)
    expect((await resolveSignature(p, sales.id)).source).toBe('STANDARD')
    // the text is kept, so switching back off needs no retyping
    expect(String((await p.findByID({ collection: 'users', id: sales.id, ...sys }) as unknown as Doc).signature_text)).toContain('Synthetic Sales')
  })

  it('turning the toggle off with no text is refused', async () => {
    const r = await saveUserSignature(S, { text: '', useStandard: false })
    expect(r.ok).toBe(false)
  })

  it('manual reply merge values carry the resolved signature', async () => {
    await saveUserSignature(S, { text: 'Own Line', useStandard: false })
    const v = await mergeValuesFor(p, { rfq_number: 'RFQ-SYN-1' } as Doc, sales.user as never)
    expect(v.email_signature).toBe('Own Line')
    await saveUserSignature(S, { text: 'Own Line', useStandard: true })
    const v2 = await mergeValuesFor(p, { rfq_number: 'RFQ-SYN-1' } as Doc, sales.user as never)
    expect(v2.email_signature).toBe(await loadStandard(p))
  })

  it('the held reason is gone: every sample preview with a signature field renders the standard signature, none is missing', async () => {
    const sig = await signatureMergeValues(p, admin.id)
    const out = renderSample('Hello', 'Hi\n\n{{sequence_signature}}\n{{email_signature}}', { ...SAMPLE_RECIPIENTS[0]!.values, email_signature: sig.email_signature, sequence_signature: sig.sequence_signature })
    expect(out.missing).not.toContain('sequence_signature')
    expect(out.missing).not.toContain('email_signature')
    expect(out.body).toContain('ICS Sales Team')
  })
})

describe('SIGNATURES-1 permissions and audit', () => {
  it('a sales user cannot change another person’s signature; an admin can, and it is audited as admin', async () => {
    const denied = await saveUserSignature(S, { userId: admin.id, text: 'Hijack', useStandard: false })
    expect(denied.ok).toBe(false)
    const ok = await saveUserSignature(A, { userId: sales.id, text: 'Set by admin', useStandard: false })
    expect(ok.ok).toBe(true)
    expect((await resolveSignature(p, sales.id)).text).toBe('Set by admin')
    const rows = await auditRows('signature-user-updated')
    expect(JSON.stringify(rows)).toContain('"by":"admin"')
    expect(JSON.stringify(rows)).not.toContain('Set by admin')
    await saveUserSignature(A, { userId: sales.id, text: 'Set by admin', useStandard: true })
  })

  it('the signature list is for admins only', async () => {
    expect(await listUserSignatures(S)).toEqual([])
    expect((await listUserSignatures(A)).length).toBeGreaterThan(0)
  })

  it('the API cannot write the fields directly (field access is closed)', async () => {
    const res = await p.update({ collection: 'users', id: sales.id, data: { signature_text: 'direct' } as never, user: sales.user as never, overrideAccess: false, depth: 0 }).catch(() => null)
    const now = (await p.findByID({ collection: 'users', id: sales.id, ...sys })) as unknown as Doc
    expect(now.signature_text).not.toBe('direct')
    void res
  })
})

describe('SIGNATURES-1 sanitiser and advisory (through the save path)', () => {
  it('strips markup and keeps the words', async () => {
    const r = await saveUserSignature(S, { text: '<b>Bold</b> Name<script>alert(1)</script>', useStandard: false })
    expect(r.ok).toBe(true)
    const t = String((await p.findByID({ collection: 'users', id: sales.id, ...sys }) as unknown as Doc).signature_text)
    expect(t).not.toContain('<')
    expect(t).toContain('Bold Name')
    await saveUserSignature(S, { text: t, useStandard: true })
  })

  it('a phone number or address saves with a gentle advisory, not a block', async () => {
    const r = await saveStandard(A, { text: 'ICS Sales Team\nCall +1 303 555 0100\n123 Main Street' })
    expect(r.ok).toBe(true)
    expect(r.ok && (r as { warnings?: string[] }).warnings?.length).toBe(2)
    await saveStandard(A, { text: '' })
  })

  it('too many lines, too-long lines and non-text are refused', async () => {
    expect((await saveStandard(A, { text: '1\n2\n3\n4\n5\n6\n7' })).ok).toBe(false)
    expect((await saveStandard(A, { text: 'x'.repeat(130) })).ok).toBe(false)
    expect((await saveStandard(A, { text: { a: 1 } })).ok).toBe(false)
  })
})
