import type { Payload } from 'payload'
import { ingestInbound, recordProcessingFailure, type IngestResult } from '../crm/inbound'
import { readInboundConfig, type InboundConfig } from './config'
import { invalidateErsSettings } from '../crm/ers/settings'
import { httpsTransport, jmapMailbox, JmapError, type InboundMailbox, type JmapEmail } from './jmap'
import { imapMailbox, ImapError } from './imap'
import { dbCursorStore } from './imap-cursor'

/**
 * CRM email M3 — the inbound poller. Runs in the runner role only (one replica), when H2O_EMAIL_INBOUND=on.
 * Patch C: the reader is JMAP (Stalwart) or IMAP (Google Workspace), per H2O_INBOUND_PROTOCOL; everything else is shared.
 *
 * Each poll: read up to `limit` Inbox messages not yet marked `$h2o_ingested`, store each one (idempotent:
 * linked to its RFQ by reply token, or placed in the review queue), then mark the stored ones. A message whose
 * processing fails stays unmarked and is retried next poll; after MAX_FAILURES it is recorded in the review
 * queue as PROCESSING_FAILED and marked, so one bad message can never block the mailbox. Logs carry counts and
 * codes only.
 */

export const MAX_FAILURES = 5
const failures = new Map<string, number>()

export type PollResult = {
  fetched: number
  linked: number
  review: number
  duplicate: number
  failed: number
}

export async function pollInbound(
  payload: Payload,
  opts: { cfg?: InboundConfig; mailbox?: InboundMailbox; now?: Date; limit?: number } = {},
): Promise<PollResult | null> {
  const cfg = opts.cfg ?? readInboundConfig()
  if (!cfg.enabled || !cfg.settings) return null
  const ctx = { roleLocal: cfg.settings.roleLocal, domain: cfg.settings.domain }
  const mailbox =
    opts.mailbox ??
    (cfg.settings.protocol === 'imap'
      ? imapMailbox(cfg.settings, { cursor: dbCursorStore(payload), log: (code) => console.warn(`[h2o] email inbound: ${code}`) })
      : jmapMailbox(httpsTransport(cfg.settings)))
  const out: PollResult = { fetched: 0, linked: 0, review: 0, duplicate: 0, failed: 0 }
  let emails: JmapEmail[]
  try {
    emails = await mailbox.fetchNew(opts.limit ?? 25)
  } catch (err) {
    console.error(`[h2o] email inbound: fetch failed ${err instanceof JmapError || err instanceof ImapError ? err.code : 'UNKNOWN'}`)
    return out
  }
  out.fetched = emails.length
  // Revenue Engine slice 1 (CT ruling 3): the heartbeat sequences need — reply detection is live.
  await payload
    .updateGlobal({ slug: 'crm-ers-settings' as never, data: { inbound_last_ok_at: (opts.now ?? new Date()).toISOString() } as never, depth: 0, overrideAccess: true, context: { crmServer: {} } })
    .then(() => invalidateErsSettings())
    .catch(() => console.error('[h2o] email inbound: heartbeat write failed'))
  const done: string[] = []
  for (const email of emails) {
    try {
      const r: IngestResult = await ingestInbound(payload, email, ctx, opts.now ?? new Date())
      if (r === 'LINKED') out.linked++
      else if (r === 'REVIEW') out.review++
      else out.duplicate++
      failures.delete(email.id)
      done.push(email.id)
    } catch {
      const n = (failures.get(email.id) ?? 0) + 1
      failures.set(email.id, n)
      out.failed++
      if (n >= MAX_FAILURES) {
        try {
          await recordProcessingFailure(payload, email, opts.now ?? new Date())
          failures.delete(email.id)
          done.push(email.id)
        } catch {
          // leave it for the next poll
        }
      }
    }
  }
  try {
    await mailbox.markIngested(done)
  } catch (err) {
    // Stored rows are idempotent by mailbox id: the next poll sees these again and records them as duplicates.
    console.error(`[h2o] email inbound: mark failed ${err instanceof JmapError || err instanceof ImapError ? err.code : 'UNKNOWN'}`)
  }
  if (out.fetched > 0)
    console.warn(
      `[h2o] email inbound: fetched=${out.fetched} linked=${out.linked} review=${out.review} duplicate=${out.duplicate} failed=${out.failed}`,
    )
  return out
}
