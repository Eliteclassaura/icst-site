import { mkdtempSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { GET as downloadRoute } from '../../app/(crm)/crm/attachments/[id]/route'
import { POST as uploadRoute } from '../../app/(crm)/crm/attachments/upload/route'
import { attachmentForPerson, canSeeRecord, downloadBytes, listAttachments, removeAttachment, uploadAttachment } from '../attachments/service'
import { volumeStore } from '../attachments/store'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, rest, user, userWith, type TestUser } from './harness'

/**
 * CRM-ATTACH-1 against Postgres: who may attach, open and remove files; the record-visibility rule; the per-record cap;
 * the size limit; the refusals; the integrity check; the audit trail; the collection's write guard; and both routes end to
 * end with real sign-ins. Synthetic records and bytes only; storage is a temporary directory.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser, editor: TestUser
let A: CrmSession, S: CrmSession, S2: CrmSession
let root: string
let accountId: string
const srv = { overrideAccess: true as const, depth: 0 }
const PDF = new TextEncoder().encode('%PDF-1.4\n% synthetic quote\n1 0 obj<<>>endobj\n')
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])
const deps = () => ({ store: volumeStore(root), env: {} as Record<string, string | undefined> })

async function newAccount(name: string): Promise<string> {
  const doc = (await p.create({ collection: 'crm-accounts', data: { canonical_name: name } as never, ...srv })) as unknown as Doc
  return String(doc.id)
}
const auditFor = async (docId: string, event: string) =>
  (await p.find({ collection: 'audit-log' as never, where: { docId: { equals: docId } } as never, limit: 50, ...srv })).docs.filter(
    (a) => JSON.stringify((a as Doc).detail ?? {}).includes(event),
  )
const filesOn = async (id: string) => (await listAttachments(S, 'ACCOUNT', id)).length
const storedCount = () => readdirSync(root, { recursive: true }).filter((f) => statSync(path.join(root, String(f))).isFile()).length

beforeAll(async () => {
  p = await payload()
  ;[admin, sales, editor] = await Promise.all([user('platform-admin'), user('sales'), user('editor')])
  S2 = crmSessionFor(p, (await userWith('sales.two.user@example.test', 'sales')).user)!
  A = crmSessionFor(p, admin.user)!
  S = crmSessionFor(p, sales.user)!
})
beforeEach(async () => {
  await resetCrm()
  root = mkdtempSync(path.join(tmpdir(), 'attach-db-'))
  accountId = await newAccount('Contoso Cooling (synthetic)')
})
afterAll(async () => {
  await resetCrm()
})

describe('attaching a file', () => {
  it('a sales person attaches a PDF: the row, the stored bytes, the hash and the audit trail', async () => {
    const out = await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'Quote Q-1.pdf', bytes: PDF, note: 'Signed copy' }, deps())
    expect(out).toMatchObject({ ok: true, name: 'Quote Q-1.pdf' })
    const id = (out as { id: string }).id
    const row = (await p.findByID({ collection: 'crm-attachments', id, overrideAccess: true, depth: 0 })) as unknown as Doc
    expect(row).toMatchObject({ record_kind: 'ACCOUNT', account: accountId, original_name: 'Quote Q-1.pdf', extension: 'pdf', mime: 'application/pdf', size_bytes: PDF.length, note: 'Signed copy' })
    expect(String(row.storage_key)).toMatch(/^crm\/account\//)
    expect(storedCount()).toBe(1)
    expect((await auditFor(id, 'attachment_upload')).length).toBe(1)
    expect(await filesOn(accountId)).toBe(1)
  })

  it('refuses an executable renamed to .pdf, and stores nothing and records nothing', async () => {
    const out = await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'invoice.pdf', bytes: EXE, note: null }, deps())
    expect(out).toMatchObject({ ok: false, status: 422, code: 'EXECUTABLE_REFUSED' })
    expect(storedCount()).toBe(0)
    expect(await filesOn(accountId)).toBe(0)
  })

  it('refuses a file over the size limit before it is stored', async () => {
    const out = await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'big.pdf', bytes: PDF, note: null }, { store: volumeStore(root), env: { H2O_ATTACH_MAX_MB: '0.00001' } })
    expect(out).toMatchObject({ ok: false, status: 413, code: 'TOO_LARGE' })
    expect(storedCount()).toBe(0)
  })

  it('caps the files on one record (50 by default; here 2) and says so', async () => {
    const env = { H2O_ATTACH_MAX_PER_RECORD: '2' }
    expect(await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'a.pdf', bytes: PDF, note: null }, { store: volumeStore(root), env })).toMatchObject({ ok: true })
    expect(await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'b.pdf', bytes: PDF, note: null }, { store: volumeStore(root), env })).toMatchObject({ ok: true })
    expect(await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'c.pdf', bytes: PDF, note: null }, { store: volumeStore(root), env })).toMatchObject({ ok: false, status: 409, code: 'LIMIT' })
  })

  it('refuses a record that is not visible to the person, as if it did not exist', async () => {
    expect(await canSeeRecord(crmSessionFor(p, editor.user) as CrmSession, 'ACCOUNT', accountId)).toBe(false)
    const out = await uploadAttachment(crmSessionFor(p, editor.user) as CrmSession, { kind: 'ACCOUNT', recordId: accountId, name: 'a.pdf', bytes: PDF, note: null }, deps())
    expect(out).toMatchObject({ ok: false, status: 404 })
  })

  it('fails closed when no store is configured', async () => {
    const out = await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'a.pdf', bytes: PDF, note: null }, { store: null, env: {} })
    expect(out).toMatchObject({ ok: false, status: 503, code: 'STORAGE_NOT_CONFIGURED' })
    expect(await filesOn(accountId)).toBe(0)
  })
})

describe('opening and removing files', () => {
  it('download returns the same bytes and is audited', async () => {
    const id = ((await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'Q.pdf', bytes: PDF, note: null }, deps())) as { id: string }).id
    const got = await downloadBytes(S2, id, deps())
    expect(got).toMatchObject({ ok: true, name: 'Q.pdf', mime: 'application/pdf' })
    expect(Buffer.from((got as { bytes: Uint8Array }).bytes)).toEqual(Buffer.from(PDF))
    expect((await auditFor(id, 'attachment_download')).length).toBe(1)
  })

  it('a stored object that no longer matches its hash is not opened, and that is recorded', async () => {
    const out = (await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'Q.pdf', bytes: PDF, note: null }, deps())) as { id: string }
    const row = (await p.findByID({ collection: 'crm-attachments', id: out.id, overrideAccess: true, depth: 0 })) as unknown as Doc
    writeFileSync(path.join(root, ...String(row.storage_key).split('/')), 'tampered')
    const got = await downloadBytes(S, out.id, deps())
    expect(got).toMatchObject({ ok: false, status: 500, code: 'INTEGRITY' })
    expect((await auditFor(out.id, 'attachment_integrity_mismatch')).length).toBe(1)
  })

  it('the uploader removes a file (soft, audited); the file then disappears for everyone', async () => {
    const id = ((await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'Q.pdf', bytes: PDF, note: null }, deps())) as { id: string }).id
    expect(await removeAttachment(S, id)).toMatchObject({ ok: true })
    expect(await filesOn(accountId)).toBe(0)
    expect(await downloadBytes(S, id, deps())).toMatchObject({ ok: false, status: 404 })
    const row = (await p.findByID({ collection: 'crm-attachments', id, overrideAccess: true, depth: 0 })) as unknown as Doc
    expect(row.deleted_at).toBeTruthy()
    expect((await auditFor(id, 'attachment_remove')).length).toBe(1)
  })

  it('another sales person cannot remove it; an admin can', async () => {
    const id = ((await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'Q.pdf', bytes: PDF, note: null }, deps())) as { id: string }).id
    expect(await removeAttachment(S2, id)).toMatchObject({ ok: false, status: 403 })
    expect(await removeAttachment(A, id)).toMatchObject({ ok: true })
  })

  it('a file on a record the person cannot see is not found, even by id', async () => {
    const id = ((await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'Q.pdf', bytes: PDF, note: null }, deps())) as { id: string }).id
    expect(await attachmentForPerson(crmSessionFor(p, editor.user) as CrmSession, id)).toBeNull()
    expect(await downloadBytes(crmSessionFor(p, editor.user) as CrmSession, id, deps())).toMatchObject({ ok: false, status: 404 })
  })
})

describe('the collection and the API', () => {
  it('no one writes an attachment through the API, and sales cannot list them', async () => {
    const r = await rest.post('crm-attachments', admin.token, { record_kind: 'ACCOUNT', account: accountId, original_name: 'x.pdf' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    const list = await rest.get('crm-attachments', sales.token)
    expect(list.status).toBeGreaterThanOrEqual(400)
  })

  it('a direct write without the trusted server context is refused by the collection', async () => {
    await expect(
      p.create({ collection: 'crm-attachments', data: { record_kind: 'ACCOUNT', account: accountId, original_name: 'x.pdf', extension: 'pdf', mime: 'application/pdf', size_bytes: 3, sha256: 'a'.repeat(64), storage_key: 'crm/account/x/y' } as never, overrideAccess: true }),
    ).rejects.toThrow(/service/)
  })

  it('the record a file belongs to is fixed: it cannot be moved to another record afterwards', async () => {
    const id = ((await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'Q.pdf', bytes: PDF, note: null }, deps())) as { id: string }).id
    const other = await newAccount('Fabrikam Cooling (synthetic)')
    await expect(p.update({ collection: 'crm-attachments', id, data: { account: other, original_name: 'renamed.pdf' } as never, overrideAccess: true, context: { crmServer: {} } })).rejects.toThrow(/cannot change/)
  })
})

describe('the two routes, with real sign-ins', () => {
  const token = (u: TestUser) => u.token
  const form = (fields: Record<string, string>, file?: { name: string; bytes: Uint8Array }) => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.append(k, v)
    if (file) fd.append('file', new File([Uint8Array.from(file.bytes)], file.name, { type: 'application/octet-stream' }))
    return fd
  }
  /** A browser sends a multipart body with its Content-Length (ATTACH-1.1 C2 refuses one without). */
  const encode = async (fd: FormData) => {
    const r = new Response(fd)
    const bytes = new Uint8Array(await r.arrayBuffer())
    return { bytes, type: r.headers.get('content-type')!, length: String(bytes.length) }
  }
  const post = async (t: string | null, body: FormData) => {
    const e = await encode(body)
    const headers = new Headers({ 'content-type': e.type, 'content-length': e.length })
    if (t) headers.set('authorization', `JWT ${t}`)
    return uploadRoute(new Request('http://127.0.0.1:3200/crm/attachments/upload/', { method: 'POST', headers, body: e.bytes }))
  }

  it('upload: the sales token attaches; no token is refused; a cross-site post is refused', async () => {
    process.env.H2O_ATTACH_STORE = 'volume'
    process.env.H2O_ATTACH_DIR = root
    try {
      const ok = await post(token(sales), form({ kind: 'ACCOUNT', recordId: accountId }, { name: 'Route Q.pdf', bytes: PDF }))
      expect(ok.status).toBe(201)
      expect(ok.headers.get('cache-control')).toContain('no-store')
      const denied = await post(null, form({ kind: 'ACCOUNT', recordId: accountId }, { name: 'Q.pdf', bytes: PDF }))
      expect(denied.status).toBe(403)
      const headers = new Headers({ authorization: `JWT ${token(sales)}`, 'sec-fetch-site': 'cross-site' })
      const e = await encode(form({ kind: 'ACCOUNT', recordId: accountId }, { name: 'Q.pdf', bytes: PDF }))
      headers.set('content-type', e.type)
      headers.set('content-length', e.length)
      const cross = await uploadRoute(new Request('http://127.0.0.1:3200/crm/attachments/upload/', { method: 'POST', headers, body: e.bytes }))
      expect(cross.status).toBe(403)
    } finally {
      delete process.env.H2O_ATTACH_STORE
      delete process.env.H2O_ATTACH_DIR
    }
  })

  it('download: streamed as an attachment, nosniff, sandboxed and never cached; cross-site is refused', async () => {
    process.env.H2O_ATTACH_STORE = 'volume'
    process.env.H2O_ATTACH_DIR = root
    try {
      const up = await (await post(token(sales), form({ kind: 'ACCOUNT', recordId: accountId }, { name: 'Route Q.pdf', bytes: PDF }))).json()
      const { id } = up as { id: string }
      const headers = new Headers({ authorization: `JWT ${token(sales)}` })
      const res = await downloadRoute(new Request(`http://127.0.0.1:3200/crm/attachments/${id}/`, { headers }), { params: Promise.resolve({ id }) })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/octet-stream')
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="Route Q\.pdf"/)
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('content-security-policy')).toContain('sandbox')
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from(PDF))
      const nosign = await downloadRoute(new Request(`http://127.0.0.1:3200/crm/attachments/${id}/`), { params: Promise.resolve({ id }) })
      expect(nosign.status).toBe(403)
      const cross = await downloadRoute(new Request(`http://127.0.0.1:3200/crm/attachments/${id}/`, { headers: new Headers({ authorization: `JWT ${token(sales)}`, 'sec-fetch-site': 'cross-site' }) }), { params: Promise.resolve({ id }) })
      expect(cross.status).toBe(403)
    } finally {
      delete process.env.H2O_ATTACH_STORE
      delete process.env.H2O_ATTACH_DIR
    }
  })
})

/** ATTACH-1.1 (Auditor C2, C3): a request must say its size; a person's day and the whole store are capped before storing. */
describe('ATTACH-1.1: size declared, caps enforced', () => {
  it('the upload route refuses a body with no declared length (a chunked body could bypass the early size check)', async () => {
    process.env.H2O_ATTACH_STORE = 'volume'
    process.env.H2O_ATTACH_DIR = root
    try {
      const fd = new FormData()
      fd.append('kind', 'ACCOUNT')
      fd.append('recordId', accountId)
      fd.append('file', new File([PDF], 'Q.pdf', { type: 'application/pdf' }))
      const streamed = new Response(fd).body!
      const headers = new Headers({ authorization: `JWT ${sales.token}` })
      const res = await uploadRoute(new Request('http://127.0.0.1:3200/crm/attachments/upload/', { method: 'POST', headers, body: streamed, duplex: 'half' } as RequestInit))
      expect(res.status).toBe(411)
      expect(storedCount()).toBe(0)
    } finally {
      delete process.env.H2O_ATTACH_STORE
      delete process.env.H2O_ATTACH_DIR
    }
  })

  it('a person cannot add more than the daily allowance: refused before anything is stored', async () => {
    const out = await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'a.pdf', bytes: PDF, note: null }, { store: volumeStore(root), env: { H2O_ATTACH_MAX_USER_MB_PER_DAY: '0.00001' } })
    expect(out).toMatchObject({ ok: false, status: 429, code: 'USER_QUOTA' })
    expect(storedCount()).toBe(0)
  })

  it('the whole store is capped: refused with a plain message, nothing stored', async () => {
    await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'a.pdf', bytes: PDF, note: null }, deps())
    const out = await uploadAttachment(S, { kind: 'ACCOUNT', recordId: accountId, name: 'b.pdf', bytes: PDF, note: null }, { store: volumeStore(root), env: { H2O_ATTACH_MAX_TOTAL_MB: '0.00001' } })
    expect(out).toMatchObject({ ok: false, status: 507, code: 'STORE_FULL' })
    expect(storedCount()).toBe(1)
  })
})
