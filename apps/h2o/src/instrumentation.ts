/**
 * Server start-up and request error observability.
 *
 * `register` — the publishing runner role (H2O_PUBLISHING_RUNNER=1, exactly one replica) initialises Payload
 * with its job crons at server start. Payload only starts `jobs.autoRun` crons when it is initialised with
 * `cron: true`; without this the runner would idle until some route happened to initialise it that way, and
 * queued publishing jobs would wait. Web replicas never start crons (`shouldAutoRun` also refuses there).
 * The runner also reconciles pending publication events every minute (./content/jobs `reconcilePending`).
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
}

export function onRequestError(err: unknown, request: { path: string; method: string }) {
  const e = err as { message?: string; digest?: string }
  console.error(`[h2o] request error ${request.method} ${request.path} digest=${e.digest ?? '-'} ${String(e.message ?? err).slice(0, 300)}`)
}
