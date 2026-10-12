import { attachmentLimits } from '../../../../../crm/attachments/validate'
import { jsonResponse, sameOriginOnly, sessionFromRequest, storeFromEnv } from '../../../../../crm/attachments/http'
import { uploadAttachment } from '../../../../../crm/attachments/service'

/**
 * CRM-ATTACH-1: `POST /crm/attachments/upload/` (multipart: `kind`, `recordId`, optional `note`, and one `file`).
 * Signed-in CRM users only (the proxy also requires the two-factor step for /crm). The record must be visible to the person.
 * Answers JSON; the file is refused before it is stored if it fails any check (see `crm/attachments/validate.ts`).
 */
export const dynamic = 'force-dynamic'

/** Room for the multipart envelope on top of the file itself. */
const ENVELOPE_ALLOWANCE = 256 * 1024

export async function POST(request: Request): Promise<Response> {
  if (!sameOriginOnly(request)) return jsonResponse(403, { ok: false, code: 'FORBIDDEN', message: 'Refused.' })
  const s = await sessionFromRequest(request)
  if (!s) return jsonResponse(403, { ok: false, code: 'FORBIDDEN', message: 'Sign in to attach files.' })
  const limits = attachmentLimits(process.env)
  // ATTACH-1.1 (Auditor C2): the size is decided before the body is read. A request with no declared length (a chunked body)
  // could otherwise be read in full first, so it is refused.
  const lengthHeader = request.headers.get('content-length')
  if (lengthHeader === null) return jsonResponse(411, { ok: false, code: 'LENGTH_REQUIRED', message: 'The upload must say how big it is.' })
  const declared = Number(lengthHeader)
  if (!Number.isFinite(declared) || declared < 0) return jsonResponse(400, { ok: false, code: 'INVALID', message: 'The upload could not be read. Try again.' })
  if (declared > limits.maxBytes + ENVELOPE_ALLOWANCE) return jsonResponse(413, { ok: false, code: 'TOO_LARGE', message: 'That file is larger than the limit.' })
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonResponse(400, { ok: false, code: 'INVALID', message: 'The upload could not be read. Try again.' })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return jsonResponse(400, { ok: false, code: 'NO_FILE', message: 'Choose a file first.' })
  if (file.size > limits.maxBytes) return jsonResponse(413, { ok: false, code: 'TOO_LARGE', message: 'That file is larger than the limit.' })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { store, error } = storeFromEnv()
  if (error) return jsonResponse(503, { ok: false, code: error.code, message: 'File storage is not set up on this server yet, so nothing was attached.' })
  const out = await uploadAttachment(
    s,
    { kind: form.get('kind'), recordId: form.get('recordId'), name: file.name, bytes, note: form.get('note') },
    { store, env: process.env },
  )
  if (!out.ok) return jsonResponse(out.status, { ok: false, code: out.code, message: out.message })
  return jsonResponse(201, { ok: true, id: out.id, name: out.name, size: out.size, message: out.message })
}
