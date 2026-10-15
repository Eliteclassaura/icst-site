import config from '@payload-config'
import { getPayload } from 'payload'
import { client } from '../../../../../client'
import { unsubscribeByToken, verifyUnsubscribeToken } from '../../../../../crm/ers/unsubscribe'

/**
 * Revenue Engine slice 1: unsubscribe from sequence emails (RFC 8058 one-click, and a confirmation page for people).
 *
 *   GET  ?t=<token>  a small page with one button (mail scanners prefetch links, so GET never unsubscribes);
 *   POST ?t=<token>  unsubscribes: the mailbox provider's one-click POST (body "List-Unsubscribe=One-Click") or the
 *                    page's button. The suppression is written before the 200. Idempotent.
 * No cross-site check: providers post from their own servers. The token is the only authority, it names no address,
 * and the page shows none. Plain HTML, no scripts, no styles, no external resources.
 */
export const dynamic = 'force-dynamic'
const HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`,
    { status, headers: HEADERS },
  )

const tokenOf = (request: Request) => new URL(request.url).searchParams.get('t') ?? ''
const escapeAttr = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function GET(request: Request): Promise<Response> {
  const t = tokenOf(request)
  if (!verifyUnsubscribeToken(t)) return page('This link is not valid', '<p>The unsubscribe link is incomplete or has been changed. Reply to the email and ask us to stop, and we will.</p>', 400)
  return page(
    'Stop these follow-up emails?',
    `<p>You will no longer receive follow-up emails from ${escapeAttr(client().brandName('site'))} about your request. Replies to messages you send us are not affected.</p><form method="post" action="/api/ers/unsubscribe/?t=${escapeAttr(encodeURIComponent(t))}"><button type="submit">Unsubscribe</button></form>`,
  )
}

/** SEC-CRM-1: the largest body read (a one-click POST is "List-Unsubscribe=One-Click"; the page's form is empty). */
const MAX_BODY_BYTES = 1024

/** The body as text, at most MAX_BODY_BYTES; null when it is (or declares itself) larger — it is never buffered. */
async function smallBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.byteLength
    if (n > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    parts.push(value)
  }
  return Buffer.concat(parts).toString('utf8')
}

export async function POST(request: Request): Promise<Response> {
  // SEC-CRM-1: the token is checked first and the body is read only up to 1 KB, so an anonymous large POST costs
  // nothing.
  if (!verifyUnsubscribeToken(tokenOf(request))) return page('This link is not valid', '<p>The unsubscribe link is incomplete or has been changed. Reply to the email and ask us to stop, and we will.</p>', 400)
  const body = request.headers.get('content-type')?.includes('form') ? await smallBody(request) : ''
  if (body === null) return page('Request too large', '<p>Please use the unsubscribe button on the page.</p>', 413)
  const payload = await getPayload({ config })
  try {
    const out = await unsubscribeByToken(payload, tokenOf(request), body.includes('List-Unsubscribe=One-Click') ? 'ONE_CLICK' : 'PAGE')
    if (out === 'INVALID') return page('This link is not valid', '<p>The unsubscribe link is incomplete or has been changed. Reply to the email and ask us to stop, and we will.</p>', 400)
    return page('You are unsubscribed', '<p>You will not receive further follow-up emails from us. If you send us a new request, we will still reply to it.</p>')
  } catch (err) {
    payload.logger.error({ scope: 'crm.ers', code: 'UNSUBSCRIBE_FAILED', errName: (err as Error)?.name })
    return page('Something went wrong', '<p>Please try again in a minute, or reply to the email and ask us to stop.</p>', 500)
  }
}
