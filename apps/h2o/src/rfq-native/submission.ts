/**
 * Native RFQ: the submit client (H2O_NATIVE_RFQ_REGISTRY_CONTRACT_R1 §3–§4). Answers travel only in this POST body, to this
 * site's own /api/rfq/submit/; nothing is sent before the visitor selects "Send request". The `submissionId` is created
 * with the draft and reused on every retry, so a retry after a lost response returns the same RFQ (replay).
 */
export type RfqSource = 'NATIVE_CHAT' | 'NATIVE_FORM'
export type RfqContext = {
  context_type?: 'product' | 'service' | 'category' | 'page' | 'search'
  context_id?: string
  page_path?: string
  product_id?: string
  product_slug?: string
  product_path?: string
  product_title?: string
  cta_placement?: string
}
export type Attribution = Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_term' | 'utm_content' | 'gclid' | 'gbraid' | 'wbraid' | 'ga_client_id' | 'landing_page' | 'referrer', string>>
export type SubmitRequest = {
  submissionId: string
  source: RfqSource
  registryVersion: string
  locale: string
  answers: Record<string, string>
  context: RfqContext
  attribution: Attribution
  antiAbuse: { formToken: string; hp: string; turnstileToken?: string }
}
/** What the UI does next. */
export type SubmitOutcome =
  | { kind: 'sent'; rfqNumber: string | null }
  | { kind: 'invalid'; fields: Record<string, string> }
  | { kind: 'error'; key: 'err.rate_limited' | 'err.offline' | 'err.server' | 'err.too_long'; disabled?: boolean }

/** Context keys and the server's length limits (contract §4: the safe-context limits). */
const CONTEXT_LIMITS: Record<keyof RfqContext, number> = { context_type: 16, context_id: 64, page_path: 512, product_id: 64, product_slug: 128, product_path: 512, product_title: 160, cta_placement: 64 }
const CONTEXT_TYPES = new Set(['product', 'service', 'category', 'page', 'search'])
/** Context as the page supplies it, reduced to what the contract accepts: known keys, in limits, paths without a query. */
export function cleanContext(input: Record<string, unknown>): RfqContext {
  const out: RfqContext = {}
  for (const [k, max] of Object.entries(CONTEXT_LIMITS) as Array<[keyof RfqContext, number]>) {
    const v = input[k]
    if (typeof v !== 'string' || !v.trim() || v.length > max || v.includes('@')) continue
    if ((k === 'page_path' || k === 'product_path') && !/^\/[^\s?#]*$/.test(v)) continue
    if (k === 'context_type' && !CONTEXT_TYPES.has(v)) continue
    ;(out as Record<string, string>)[k] = v.trim()
  }
  // a search term is never sent: a search context carries no id
  if (out.context_type === 'search') delete out.context_id
  return out
}

export const newSubmissionId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (crypto.getRandomValues(new Uint8Array(1))[0]! & 15); return (c === 'x' ? r : (r & 3) | 8).toString(16) })

type Fetch = typeof fetch
type Token = { formToken: string; fetchedAt: number }
const TOKEN_MAX_AGE_MS = 90 * 60 * 1000

/** A form token (§3), fetched when the panel opens or the form is first focused, refreshed when older than 90 minutes. */
export async function formToken(fetcher: Fetch, held: Token | null, now = Date.now()): Promise<Token | null> {
  if (held && now - held.fetchedAt < TOKEN_MAX_AGE_MS) return held
  try {
    const res = await fetcher('/api/rfq/token/', { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) return null
    const body = (await res.json()) as { formToken?: unknown }
    return typeof body.formToken === 'string' ? { formToken: body.formToken, fetchedAt: now } : null
  } catch {
    return null
  }
}

/**
 * Send, following the contract §4.1 table: TOKEN_INVALID → a new token and one automatic resend; SUBMISSION_CONFLICT →
 * a new submissionId and one resend (`onNewSubmissionId` lets the caller keep its draft in step); network failure → offline
 * (the draft stays; the same submissionId resends later).
 */
export async function submitRfq(
  fetcher: Fetch,
  request: Omit<SubmitRequest, 'antiAbuse'> & { hp: string },
  token: Token | null,
  onNewSubmissionId: (id: string) => void = () => {},
): Promise<{ outcome: SubmitOutcome; token: Token | null }> {
  let tok = token ?? (await formToken(fetcher, null))
  let body: SubmitRequest = { submissionId: request.submissionId, source: request.source, registryVersion: request.registryVersion, locale: request.locale, answers: request.answers, context: request.context, attribution: request.attribution, antiAbuse: { formToken: tok?.formToken ?? '', hp: request.hp } }
  let retriedToken = false, retriedConflict = false
  for (;;) {
    let res: Response
    try {
      res = await fetcher('/api/rfq/submit/', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      return { outcome: { kind: 'error', key: 'err.offline' }, token: tok }
    }
    let data: { ok?: boolean; rfqNumber?: string | null; code?: string; fields?: Record<string, string> } = {}
    try {
      data = (await res.json()) as typeof data
    } catch {
      /* a body that is not JSON is a server error */
    }
    if (res.ok && data.ok) return { outcome: { kind: 'sent', rfqNumber: typeof data.rfqNumber === 'string' ? data.rfqNumber : null }, token: tok }
    if (res.status === 409 && data.code === 'TOKEN_INVALID' && !retriedToken) {
      retriedToken = true
      tok = await formToken(fetcher, null)
      body = { ...body, antiAbuse: { ...body.antiAbuse, formToken: tok?.formToken ?? '' } }
      continue
    }
    if (res.status === 409 && data.code === 'SUBMISSION_CONFLICT' && !retriedConflict) {
      retriedConflict = true
      const id = newSubmissionId()
      onNewSubmissionId(id)
      body = { ...body, submissionId: id }
      continue
    }
    if (res.status === 422 && data.code === 'VALIDATION' && data.fields) return { outcome: { kind: 'invalid', fields: data.fields }, token: tok }
    if (res.status === 429) return { outcome: { kind: 'error', key: 'err.rate_limited' }, token: tok }
    if (res.status === 413) return { outcome: { kind: 'error', key: 'err.too_long' }, token: tok }
    if (res.status === 503) return { outcome: { kind: 'error', key: 'err.server', disabled: true }, token: tok }
    return { outcome: { kind: 'error', key: 'err.server' }, token: tok }
  }
}
