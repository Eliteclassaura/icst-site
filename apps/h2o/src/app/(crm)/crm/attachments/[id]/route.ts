import { contentDisposition } from '../../../../../crm/attachments/validate'
import { jsonResponse, sameOriginOnly, sessionFromRequest, storeFromEnv } from '../../../../../crm/attachments/http'
import { downloadBytes } from '../../../../../crm/attachments/service'

/**
 * CRM-ATTACH-1: `GET /crm/attachments/<id>/` streams one file as an attachment. Never rendered on this origin:
 * `application/octet-stream`, `Content-Disposition: attachment`, `nosniff`, a sandboxing CSP, and no caching.
 * The person must see the record the file belongs to; the download is audited. Cross-site requests are refused.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOriginOnly(request, true)) return jsonResponse(403, { ok: false, code: 'FORBIDDEN', message: 'Refused.' })
  const s = await sessionFromRequest(request)
  if (!s) return jsonResponse(403, { ok: false, code: 'FORBIDDEN', message: 'Sign in to open files.' })
  const { id } = await ctx.params
  const { store, error } = storeFromEnv()
  if (error) return jsonResponse(503, { ok: false, code: error.code, message: 'File storage is not set up on this server yet.' })
  const out = await downloadBytes(s, id, { store })
  if (!out.ok) return jsonResponse(out.status, { ok: false, code: out.code, message: out.message })
  return new Response(out.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': contentDisposition(out.name),
      'content-length': String(out.bytes.length),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, no-store',
    },
  })
}
