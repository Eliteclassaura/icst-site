import config from '@payload-config'
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from '@payloadcms/next/routes'
import { getPayload } from 'payload'
import { anyUserExists, firstUserGone, isFirstRegisterSlug } from '../../../../auth/first-user'
import { isMediaFileSlug, withMediaFileHeaders } from '../../../../media/upload-guard'

type Handler = (request: Request, args: { params: Promise<{ slug?: string[] }> }) => Promise<Response>

// SEC-MAIN-1: /api/users/first-register is 404 once any user exists (src/auth/first-user.ts).
// SEC-MAIN-1.1: /api/media/file/* is served as a sandboxed, inert document (src/media/upload-guard.ts).
const guarded =
  (handler: Handler): Handler =>
  async (request, args) => {
    const { slug } = await args.params
    if (isFirstRegisterSlug(slug) && (await anyUserExists(await getPayload({ config })))) return firstUserGone()
    const res = await handler(request, args)
    return isMediaFileSlug(slug) ? withMediaFileHeaders(res) : res
  }

export const GET = guarded(REST_GET(config))
export const POST = guarded(REST_POST(config))
export const DELETE = guarded(REST_DELETE(config))
export const PATCH = guarded(REST_PATCH(config))
export const PUT = guarded(REST_PUT(config))
export const OPTIONS = guarded(REST_OPTIONS(config))
