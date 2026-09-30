import type { PayloadRequest } from 'payload'
import { recordPublicationEvent } from './events'

/**
 * Publication change notification.
 *
 * Every public-affecting change (publish, republish, unpublish, delete, redirect change) queues one
 * `publishingSync` job on the single `publishing` queue. The job never carries content: it only says
 * "public state changed at T". The runner always rebuilds from Payload's *current* published state, so a
 * stale job (queued before a later publish or withdrawal) can never resurrect older content; a job whose
 * change is already reflected in a newer promoted generation is a recorded no-op.
 *
 * A bulk import passes `bulk: true` and queues one sync at the end instead of one per record.
 */
export type PublicChange = { reason: 'publish' | 'unpublish' | 'delete' | 'redirect' | 'import' | 'rebuild'; routeId?: string; path?: string; bulk?: boolean }

export const PUBLISHING_QUEUE = 'publishing'
export const SYNC_TASK = 'publishingSync'

export async function notePublicChange(req: PayloadRequest, change: PublicChange): Promise<void> {
  if (change.bulk) return
  // R1B: the event row is written in the same transaction as the change, so it exists iff the change
  // committed; the job carries its sequence number and completes only when a release reflects it.
  const seq = await recordPublicationEvent(req.payload, req, change.reason, change.routeId ?? null, change.path ?? null)
  await req.payload.jobs.queue({
    task: SYNC_TASK,
    queue: PUBLISHING_QUEUE,
    input: { reason: change.reason, routeId: change.routeId ?? null, requestedAt: new Date().toISOString(), eventSeq: seq },
    req,
  } as never)
}
