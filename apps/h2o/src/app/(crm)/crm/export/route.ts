import config from '@payload-config'
import { getPayload } from 'payload'
import { EXPORT_LISTS, exportRows, pickColumns, type ExportList } from '../../../../crm/export/csv-export'
import { listSearchCookie, searchRequested, storedTerm } from '../../../../crm/workspace/prefs'
import { crmSessionFor } from '../../../../crm/workspace/session'

/**
 * Wave 1 W1-4: `GET /crm/export/?list=contacts|accounts|inbox&cols=…&<the list's filters>[&s=1]` → CSV download.
 * Admin only (Sales get 403), same-origin only, streamed, audited (see `csv-export.ts`). The search term comes from the
 * list-search cookie when `s=1`, exactly as on screen; it is never in this URL.
 */
export const dynamic = 'force-dynamic'

/** One cookie from the request's Cookie header (the list-search term is an HttpOnly cookie scoped to /crm/). */
function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim())
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export async function GET(request: Request): Promise<Response> {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return new Response('Refused.', { status: 403 })
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  const s = user ? crmSessionFor(payload, user) : null
  if (!s || !s.isAdmin) return new Response('Only an admin can export.', { status: 403 })
  const url = new URL(request.url)
  const list = url.searchParams.get('list') as ExportList
  if (!(EXPORT_LISTS as readonly string[]).includes(list)) return new Response('Unknown list.', { status: 400 })
  const sp: Record<string, string | string[] | undefined> = {}
  for (const k of new Set(url.searchParams.keys())) {
    if (k === 'list' || k === 'cols') continue
    const all = url.searchParams.getAll(k)
    sp[k] = all.length > 1 ? all : all[0]
  }
  const cookieList = list === 'inbox' ? 'inbox' : list
  const term = searchRequested(sp) ? storedTerm(cookieValue(request.headers.get('cookie'), listSearchCookie(cookieList))) : null
  const columns = pickColumns(list, url.searchParams.get('cols'))
  const gen = exportRows(s, list, sp, term, columns)
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gen.next()
        if (done) controller.close()
        else controller.enqueue(enc.encode(value))
      } catch {
        controller.error(new Error('EXPORT_FAILED'))
      }
    },
    async cancel() {
      await gen.return(undefined)
    },
  })
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="h2o-${list}-${stamp}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
