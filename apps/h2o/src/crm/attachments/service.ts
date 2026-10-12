import { createHash, randomUUID } from 'node:crypto'
import type { PayloadRequest } from 'payload'
import { writeCrmAudit } from '../audit'
import { relId } from '../guards'
import type { CrmSession } from '../workspace/session'
import { isUuid } from '../workspace/validate'
import { StorageError, type AttachmentStore } from './store'
import { attachmentLimits, displayName, formatSize, validateAttachment, type AttachmentCode } from './validate'

/**
 * CRM-ATTACH-1: the rules for attaching files, behind the routes and the one shared component.
 *
 *   - the record is visible to the person (the same check the record page makes: read as the user, never as the server);
 *   - at most `maxPerRecord` live files per record; at most `maxBytes` per file (env-tunable, 25 MB / 50 by default);
 *   - the bytes are validated (`validate.ts`) before anything is stored;
 *   - the stored object is written first and the row second; a failed row write removes the object again;
 *   - uploads, downloads and removals are audited (who, record, file name, size, hash; never the contents);
 *   - removal is soft: the uploader or an admin, and only while the record is visible to them.
 */

export const ATTACH_KINDS = ['CONTACT', 'ACCOUNT', 'OPPORTUNITY', 'RFQ'] as const
export type AttachKind = (typeof ATTACH_KINDS)[number]
const PARENT = { CONTACT: 'crm-contacts', ACCOUNT: 'crm-accounts', OPPORTUNITY: 'crm-opportunities', RFQ: 'crm-rfqs' } as const
const FIELD = { CONTACT: 'contact', ACCOUNT: 'account', OPPORTUNITY: 'opportunity', RFQ: 'rfq' } as const

export type AttachFailure = { ok: false; status: number; code: string; message: string }
export type AttachedFile = { id: string; name: string; extension: string; size: number; sizeLabel: string; note: string | null; uploadedBy: string; createdAt: string; canDelete: boolean }
export type UploadResult = { ok: true; id: string; name: string; size: number; message: string } | AttachFailure

export const isAttachKind = (v: unknown): v is AttachKind => typeof v === 'string' && (ATTACH_KINDS as readonly string[]).includes(v)

const fail = (status: number, code: string, message: string): AttachFailure => ({ ok: false, status, code, message })

const MESSAGE_FOR_STATUS: Partial<Record<AttachmentCode | string, string>> = {
  LIMIT: 'This record already has the most files it can hold. Remove one to add another.',
  STORAGE_NOT_CONFIGURED: 'File storage is not set up on this server yet, so nothing was attached.',
  STORAGE_PUT_FAILED: 'The file could not be saved. Nothing was attached; try again.',
  SAVE_FAILED: 'The file could not be recorded. Nothing was attached; try again.',
}

/** The request as Payload's internals expect it (audit only needs the payload and the user). */
const reqFor = (s: CrmSession) => ({ payload: s.payload, user: s.user }) as unknown as PayloadRequest

/** Read the record as the person. A record they cannot see does not exist for them. */
export async function canSeeRecord(s: CrmSession, kind: AttachKind, recordId: string): Promise<boolean> {
  if (!isUuid(recordId)) return false
  try {
    await s.payload.findByID({ collection: PARENT[kind], id: recordId, depth: 0, overrideAccess: false, user: s.user as never })
    return true
  } catch {
    return false
  }
}

const liveWhere = (kind: AttachKind, recordId: string) => ({
  and: [{ [FIELD[kind]]: { equals: recordId } }, { deleted_at: { exists: false } }],
})

export async function listAttachments(s: CrmSession, kind: AttachKind, recordId: string): Promise<AttachedFile[]> {
  if (!(await canSeeRecord(s, kind, recordId))) return []
  const res = await s.payload.find({
    collection: 'crm-attachments',
    where: liveWhere(kind, recordId) as never,
    sort: '-createdAt',
    limit: 200,
    depth: 1,
    overrideAccess: true,
  })
  return res.docs.map((d) => {
    const row = d as unknown as Record<string, unknown>
    const up = (row.uploaded_by ?? null) as { id?: unknown; name?: unknown } | null
    const uploaderId = relId(up?.id ?? row.uploaded_by)
    const size = Number(row.size_bytes ?? 0)
    return {
      id: String(row.id),
      name: String(row.original_name ?? ''),
      extension: String(row.extension ?? ''),
      size,
      sizeLabel: formatSize(size),
      note: typeof row.note === 'string' && row.note ? row.note : null,
      uploadedBy: typeof up?.name === 'string' && up.name ? up.name : 'A CRM user',
      createdAt: String(row.createdAt ?? ''),
      canDelete: s.isAdmin || uploaderId === s.userId,
    }
  })
}

export type UploadInput = { kind: unknown; recordId: unknown; name: string; bytes: Uint8Array; note: unknown }

export async function uploadAttachment(s: CrmSession, input: UploadInput, deps: { store: AttachmentStore | null; env: Record<string, string | undefined> }): Promise<UploadResult> {
  if (!isAttachKind(input.kind) || !isUuid(input.recordId)) return fail(400, 'INVALID', 'That record reference is not valid.')
  const recordId = input.recordId
  if (!(await canSeeRecord(s, input.kind, recordId))) return fail(404, 'NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
  const limits = attachmentLimits(deps.env)
  const count = await s.payload.count({ collection: 'crm-attachments', where: liveWhere(input.kind, recordId) as never, overrideAccess: true })
  if (count.totalDocs >= limits.maxPerRecord) return fail(409, 'LIMIT', MESSAGE_FOR_STATUS.LIMIT ?? 'Too many files.')
  // ATTACH-1.1 (Auditor C3): a person's bytes in the last 24 hours, and the store's total, are capped (the volume fallback sits on
  // the system disk). A capped answer says what to do, and nothing is stored.
  const sumBytes = (docs: Array<Record<string, unknown>>) => docs.reduce((n, d) => n + Number(d.size_bytes ?? 0), 0)
  const day = new Date(Date.now() - 24 * 3600_000).toISOString()
  const mine = await s.payload.find({
    collection: 'crm-attachments',
    where: { and: [{ uploaded_by: { equals: s.userId } }, { createdAt: { greater_than: day } }] } as never,
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  })
  if (sumBytes(mine.docs as never) + input.bytes.length > limits.maxUserBytesPerDay)
    return fail(429, 'USER_QUOTA', 'You have added the most file data allowed for one day. Try again tomorrow, or ask an admin.')
  const all = await s.payload.find({ collection: 'crm-attachments', where: { deleted_at: { exists: false } } as never, limit: 5000, depth: 0, overrideAccess: true })
  if (sumBytes(all.docs as never) + input.bytes.length > limits.maxTotalBytes)
    return fail(507, 'STORE_FULL', 'File storage is full for now, so nothing was attached. Tell an admin.')
  const checked = validateAttachment(input.name, input.bytes, limits)
  if (!checked.ok) {
    const status = checked.code === 'TOO_LARGE' ? 413 : 422
    return fail(status, checked.code, checked.message)
  }
  if (!deps.store) return fail(503, 'STORAGE_NOT_CONFIGURED', MESSAGE_FOR_STATUS.STORAGE_NOT_CONFIGURED ?? 'File storage is not set up.')
  const name = displayName(input.name) ?? ''
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const key = `crm/${input.kind.toLowerCase()}/${recordId}/${randomUUID()}`
  try {
    await deps.store.put(key, input.bytes)
  } catch (err) {
    if (err instanceof StorageError) return fail(503, err.code, MESSAGE_FOR_STATUS[err.code] ?? 'The file could not be saved.')
    return fail(503, 'STORAGE_PUT_FAILED', MESSAGE_FOR_STATUS.STORAGE_PUT_FAILED ?? 'The file could not be saved.')
  }
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null
  let row: { id: unknown }
  try {
    row = (await s.payload.create({
      collection: 'crm-attachments',
      data: {
        record_kind: input.kind,
        [FIELD[input.kind]]: recordId,
        original_name: name,
        extension: checked.extension,
        mime: checked.mime,
        size_bytes: input.bytes.length,
        sha256,
        storage_key: key,
        note,
        uploaded_by: s.userId,
      } as never,
      overrideAccess: true,
      user: s.user as never,
      context: { crmServer: {} },
      depth: 0,
    })) as unknown as { id: unknown }
  } catch {
    await deps.store.remove(key).catch(() => undefined)
    return fail(500, 'SAVE_FAILED', MESSAGE_FOR_STATUS.SAVE_FAILED ?? 'The file could not be recorded.')
  }
  await writeCrmAudit(reqFor(s), {
    action: 'create',
    collection: 'crm-attachments',
    docId: String(row.id),
    detail: { event: 'attachment_upload', record_kind: input.kind, record_id: recordId, name, size_bytes: input.bytes.length, sha256 },
  })
  return { ok: true, id: String(row.id), name, size: input.bytes.length, message: `Attached ${name} (${formatSize(input.bytes.length)}).` }
}

type Row = Record<string, unknown>

/** The live row and its record, if the person can see that record. Null otherwise (a missing or removed file is a 404). */
export async function attachmentForPerson(s: CrmSession, id: string): Promise<{ row: Row; kind: AttachKind; recordId: string } | null> {
  if (!isUuid(id)) return null
  let row: Row
  try {
    row = (await s.payload.findByID({ collection: 'crm-attachments', id, depth: 0, overrideAccess: true })) as unknown as Row
  } catch {
    return null
  }
  if (!row || row.deleted_at) return null
  const kind = String(row.record_kind) as AttachKind
  if (!isAttachKind(kind)) return null
  const recordId = relId(row[FIELD[kind]])
  if (!recordId || !(await canSeeRecord(s, kind, recordId))) return null
  return { row, kind, recordId }
}

export async function downloadBytes(s: CrmSession, id: string, deps: { store: AttachmentStore | null }): Promise<{ ok: true; name: string; mime: string; bytes: Uint8Array } | AttachFailure> {
  const found = await attachmentForPerson(s, id)
  if (!found) return fail(404, 'NOT_FOUND', 'That file does not exist or you don’t have access to it.')
  if (!deps.store) return fail(503, 'STORAGE_NOT_CONFIGURED', MESSAGE_FOR_STATUS.STORAGE_NOT_CONFIGURED ?? 'File storage is not set up.')
  let bytes: Uint8Array | null
  try {
    bytes = await deps.store.get(String(found.row.storage_key))
  } catch {
    return fail(503, 'STORAGE_GET_FAILED', 'The file could not be read. Try again.')
  }
  if (!bytes) return fail(404, 'NOT_FOUND', 'That file is missing from storage.')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== String(found.row.sha256)) {
    await writeCrmAudit(reqFor(s), { action: 'export', collection: 'crm-attachments', docId: id, detail: { event: 'attachment_integrity_mismatch', record_kind: found.kind, record_id: found.recordId } })
    return fail(500, 'INTEGRITY', 'This file no longer matches what was attached, so it was not opened. Tell an admin.')
  }
  await writeCrmAudit(reqFor(s), {
    action: 'download',
    collection: 'crm-attachments',
    docId: id,
    detail: { event: 'attachment_download', record_kind: found.kind, record_id: found.recordId, name: String(found.row.original_name), size_bytes: bytes.length, sha256 },
  })
  return { ok: true, name: String(found.row.original_name), mime: String(found.row.mime), bytes }
}

export async function removeAttachment(s: CrmSession, id: string): Promise<{ ok: true; message: string } | AttachFailure> {
  const found = await attachmentForPerson(s, id)
  if (!found) return fail(404, 'NOT_FOUND', 'That file does not exist or you don’t have access to it.')
  const uploaderId = relId(found.row.uploaded_by)
  if (!s.isAdmin && uploaderId !== s.userId) return fail(403, 'FORBIDDEN', 'Only the person who attached the file, or an admin, can remove it.')
  await s.payload.update({
    collection: 'crm-attachments',
    id,
    data: { deleted_at: new Date().toISOString(), deleted_by: s.userId } as never,
    overrideAccess: true,
    user: s.user as never,
    context: { crmServer: {} },
    depth: 0,
  })
  await writeCrmAudit(reqFor(s), {
    action: 'delete',
    collection: 'crm-attachments',
    docId: id,
    detail: { event: 'attachment_remove', record_kind: found.kind, record_id: found.recordId, name: String(found.row.original_name), size_bytes: Number(found.row.size_bytes ?? 0), sha256: String(found.row.sha256) },
  })
  return { ok: true, message: `Removed ${String(found.row.original_name)}.` }
}
