/**
 * Server start-up and request error observability.
 *
 * `register` — the publishing runner role (H2O_PUBLISHING_RUNNER=1, exactly one replica) initialises Payload
 * with its job crons at server start. Payload only starts `jobs.autoRun` crons when it is initialised with
 * `cron: true`; without this the runner would idle until some route happened to initialise it that way, and
 * queued publishing jobs would wait. Web replicas never start crons (`shouldAutoRun` also refuses there).
 * The runner also reconciles pending publication events every minute (./content/jobs `reconcilePending`)
 * and drains the email outbox every 15 s (./email/outbox-worker, CRM email M1), and — when
 * H2O_EMAIL_INBOUND=on — polls the role mailbox for customer replies every 60 s (./email/inbound-poller, M3), and
 * advances Revenue Engine sequences every 60 s (./crm/ers/engine, slice 1), and finishes stranded native quote requests every
 * 60 s (./crm/intake/native/sweep, RFQ-FIX-1).
 *
 * `onRequestError` — production builds hide Server Component error messages from the browser (correctly);
 * this records them in the server log with the request path and digest so a failed render is diagnosable.
 * Only the error message and path are logged — never headers, cookies or bodies.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.H2O_PUBLISHING_RUNNER !== '1') return
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
  const payload = await getPayload({ config, cron: true })
  console.warn('[h2o] publishing runner: job crons started')
  // R1B: committed public changes the active release does not reflect (a failed job that exhausted its
  // retries, a crash between commit and queue) are re-queued here, so a backlog always converges.
  const { reconcilePending } = await import('./content/jobs')
  const tick = async () => {
    try {
      const r = await reconcilePending(payload)
      if (r === 'QUEUED') console.warn('[h2o] publishing runner: pending changes re-queued')
    } catch {
      console.error('[h2o] publishing runner: reconcile failed')
    }
  }
  void tick()
  setInterval(() => void tick(), Number(process.env.H2O_RECONCILE_INTERVAL_MS) || 60_000).unref()
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
  let sweeping = false
  const sweep = async () => {
    if (sweeping) return
    sweeping = true
    try {
      const r = await sweepStrandedIntake(payload)
      if (r.found > 0) console.warn(`[h2o] intake sweep: found=${r.found} finished=${r.finished} skipped=${r.skipped} failed=${r.failed}`)
    } catch {
      console.error('[h2o] intake sweep: failed')
    } finally {
      sweeping = false
    }
  }
  setInterval(() => void sweep(), Number(process.env.H2O_INTAKE_SWEEP_INTERVAL_MS) || 60_000).unref()
}

export function onRequestError(err: unknown, request: { path: string; method: string }) {
  const e = err as { message?: string; digest?: string }
  console.error(`[h2o] request error ${request.method} ${request.path} digest=${e.digest ?? '-'} ${String(e.message ?? err).slice(0, 300)}`)
}
