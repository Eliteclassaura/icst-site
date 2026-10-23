/**
 * Server start-up and request error observability.
 *
 * `register` — the publishing runner role (H2O_PUBLISHING_RUNNER=1, exactly one replica) initialises Payload
 * with its job crons at server start. Payload only starts `jobs.autoRun` crons when it is initialised with
 * `cron: true`; without this the runner would idle until some route happened to initialise it that way, and
 * queued publishing jobs would wait. Web replicas never start crons (`shouldAutoRun` also refuses there).
 * The runner drains the email outbox every 15 s (./email/outbox-worker, CRM email M1), and — when
 * H2O_EMAIL_INBOUND=on — polls the role mailbox for customer replies every 60 s (./email/inbound-poller, M3), and
 * advances Revenue Engine sequences every 60 s (./crm/ers/engine, slice 1), and finishes stranded native quote requests every
 * 60 s (./crm/intake/native/sweep, RFQ-FIX-1), on the same tick appending new website RFQs to the Google Sheet
 * (./sheets/sync, SHEET-SYNC-1; off unless configured).
 *
 * `onRequestError` — production builds hide Server Component error messages from the browser (correctly);
 * this records that a request failed, with fixed fields only (method, route template, digest, class, error name: see
 * `requestErrorLine`), so a failed render is findable by its digest. It never logs the message or any part of the path.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.H2O_PUBLISHING_RUNNER !== '1') return
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
  const payload = await getPayload({ config, cron: true })
  console.warn('[h2o] runner: started')
  // CRM email M1: drain the notification outbox. It runs in every mode — in `off` it only marks queued rows
  // SUPPRESSED_BY_MODE — and never overlaps itself. Logs carry ids, kinds and codes only.
  const { drainOutbox } = await import('./email/outbox-worker')
  let draining = false
  const drain = async () => {
    if (draining) return
    draining = true
    try {
      await drainOutbox(payload)
    } catch {
      console.error('[h2o] email outbox: drain failed')
    } finally {
      draining = false
    }
  }
  void drain()
  setInterval(() => void drain(), Number(process.env.H2O_EMAIL_OUTBOX_INTERVAL_MS) || 15_000).unref()
  // CRM email M3: poll the role mailbox for customer replies (only when H2O_EMAIL_INBOUND=on).
  const { readInboundConfig } = await import('./email/config')
  if (readInboundConfig().enabled) {
    const { pollInbound } = await import('./email/inbound-poller')
    let polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      try {
        await pollInbound(payload)
      } catch {
        console.error('[h2o] email inbound: poll failed')
      } finally {
        polling = false
      }
    }
    void poll()
    setInterval(() => void poll(), Number(process.env.H2O_EMAIL_INBOUND_INTERVAL_MS) || 60_000).unref()
  }
  // Revenue Engine slice 1: advance sequence enrollments every minute. It does nothing while the engine is switched
  // off (CRM → Settings → Revenue Engine) or reply detection is not live (inbound off or stale, CT ruling 3).
  const [{ tick: ersTick }, { ersSettings, inboundFresh }] = await Promise.all([import('./crm/ers/engine'), import('./crm/ers/settings')])
  let ticking = false
  const ers = async () => {
    if (ticking) return
    ticking = true
    try {
      const inboundOk = readInboundConfig().enabled && inboundFresh(await ersSettings(payload), true)
      const r = await ersTick(payload, { inboundOk })
      if (r.processed > 0) console.warn(`[h2o] revenue engine: processed=${r.processed} ${JSON.stringify(r.results)}`)
    } catch {
      console.error('[h2o] revenue engine: tick failed')
    } finally {
      ticking = false
    }
  }
  setInterval(() => void ers(), Number(process.env.H2O_ERS_INTERVAL_MS) || 60_000).unref()
  // RFQ-FIX-1 (quote-form audit R6): finish native quote requests stranded part-way (failed, or a dead worker's lease).
  const { sweepStrandedIntake } = await import('./crm/intake/native/sweep')
  const { syncSheets } = await import('./sheets/sync')
  let sweeping = false
  const sweep = async () => {
    if (sweeping) return
    sweeping = true
    try {
      const r = await sweepStrandedIntake(payload)
      if (r.found > 0) console.warn(`[h2o] intake sweep: found=${r.found} finished=${r.finished} skipped=${r.skipped} failed=${r.failed}`)
    } catch {
      console.error('[h2o] intake sweep: failed')
    }
    // SHEET-SYNC-1: append new website RFQs to the Google Sheet (off unless the three H2O_SHEETS_* settings are present).
    // Its own try: the sheet can never hold up the sweep, and never the other way round.
    try {
      const r = await syncSheets(payload)
      if (r.enabled && (r.queued || r.appended || r.failed || r.retrying)) console.warn(`[h2o] sheet sync: queued=${r.queued} appended=${r.appended} retrying=${r.retrying} failed=${r.failed}`)
    } catch {
      console.error('[h2o] sheet sync: failed')
    } finally {
      sweeping = false
    }
  }
  setInterval(() => void sweep(), Number(process.env.H2O_INTAKE_SWEEP_INTERVAL_MS) || 60_000).unref()
}

/**
 * 1.3c-8: what a failed request writes to the log: FIXED, non-user-derived fields only. Never the error's message (for a database error it
 * is the SQL and the bound text; for any other it can hold a name, an address or a token), and never any part of the request path (a
 * public URL is attacker text, a CRM path can hold a record id). The line holds:
 *   method    one of a fixed list, else OTHER
 *   route     the framework's own route TEMPLATE (`/crm/contacts/[id]`, from Next's `context.routePath`), validated and bounded, else `-`
 *   digest    Next's error digest, restricted to a short run of letters, digits, hyphen and underscore (it is a hash, not text)
 *   class     DATABASE or OTHER (the message is read only to decide this, never logged)
 *   name      the error's class name (`TypeError`, `DrizzleQueryError`), restricted to word characters
 */
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const DB_ERROR = /failed query|\bparams:|\b(?:select|insert|update|delete)\b[^\n]{0,80}\b(?:from|into|set)\b|\bsyntax error at\b|\binvalid byte sequence\b|\bnull character\b|\bduplicate key value\b|violates (?:unique|foreign|check|not-null)|\brelation "[^"]*" does not exist|\bcolumn "[^"]*" does not exist/i
const ROUTE_TEMPLATE = /^\/[A-Za-z0-9_\-.()@[\]/]{0,119}$/
const WORDS = /^[A-Za-z0-9_]{1,60}$/
const DIGEST = /^[A-Za-z0-9_-]{1,40}$/
export function requestErrorLine(err: unknown, request: { path?: string; method?: string }, context?: { routePath?: unknown }): string {
  const e = (err && typeof err === 'object' ? err : {}) as { message?: unknown; digest?: unknown; name?: unknown; constructor?: { name?: unknown } }
  const message = typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : ''
  const nameRaw = err instanceof Error ? (e.constructor?.name ?? e.name) : undefined
  const name = typeof nameRaw === 'string' && WORDS.test(nameRaw) ? nameRaw : 'Error'
  const digest = typeof e.digest === 'string' && DIGEST.test(e.digest) ? e.digest : '-'
  const method = typeof request.method === 'string' && METHODS.has(request.method.toUpperCase()) ? request.method.toUpperCase() : 'OTHER'
  const routePath = context && typeof context.routePath === 'string' ? context.routePath : ''
  const route = routePath && ROUTE_TEMPLATE.test(routePath) ? routePath : '-'
  return `[h2o] request error ${method} route=${route} digest=${digest} class=${DB_ERROR.test(message) ? 'DATABASE' : 'OTHER'} name=${name}`
}

export function onRequestError(err: unknown, request: { path: string; method: string }, context?: { routePath?: unknown }) {
  console.error(requestErrorLine(err, request, context))
}
