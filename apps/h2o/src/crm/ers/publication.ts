import type { Payload } from 'payload'
import { createEnrollment, type CreateResult } from './create'
import { slotIdentity } from './identity'

/**
 * ENGINE-SCOPE-1b — the monthly technical program (E2) is an explicit publication slot, never a catch-up. One enrollment per
 * subscriber per slot (`program:slot:publication`). A slot is enrolled only inside its send window:
 *   - before the window opens: the enrollment waits and its first step is due when the window opens;
 *   - inside the window: due now;
 *   - after the window has closed: NOTHING is sent. A record is written as EXITED with the exit reason MISSED, so a
 *     subscriber added late can see which slots they missed and none of them is ever sent late or in a burst.
 * Replaying the same slot for the same subscriber (a retry, a second worker) creates nothing (see ers/create.ts).
 */
export type SlotInput = {
  sequenceId: string
  versionId: string
  versionHash: string
  contactId: string
  program: string
  slot: number
  publicationId: string
  windowStart: Date
  windowEnd: Date
  now: Date
  ownerId?: string | null
  user?: unknown
}

export async function enrollPublicationSlot(payload: Payload, i: SlotInput): Promise<CreateResult & { missed?: boolean }> {
  const identity = slotIdentity(i.sequenceId, i.contactId, i.program, i.slot, i.publicationId)
  const missed = i.now.getTime() > i.windowEnd.getTime()
  const base = {
    sequence: i.sequenceId,
    version: i.versionId,
    content_version: i.versionHash,
    contact: i.contactId,
    owner: i.ownerId ?? null,
    enrolled_via: 'PUBLICATION',
    enrolled_at: i.now.toISOString(),
    current_step: 0,
  }
  const out = await createEnrollment(payload, {
    identity,
    eventRef: identity.scopeRef,
    user: i.user,
    data: missed
      ? { ...base, status: 'EXITED', exit_reason: 'MISSED', exited_at: i.now.toISOString(), next_action_at: null }
      : { ...base, status: 'ACTIVE', next_action_at: new Date(Math.max(i.now.getTime(), i.windowStart.getTime())).toISOString() },
  })
  return out.ok ? { ...out, missed } : out
}
