import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'
import { configHash } from './simulate'
export { simulationReviewFor } from './review-read'

/**
 * SEQ-BUILD-1 — the one thing a simulation ever stores: an admin's approval of it (see simulate.ts). Kept apart from the
 * simulation so that file can stay free of any write.
 */
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

/** An admin records that they reviewed this exact simulation. Authorises nothing; it is one activation gate. */
export async function approveSimulation(s: CrmSession, input: { sequenceId?: string; snapshotHash?: string }, now = new Date()): Promise<Outcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Only an admin approves a simulation.')
  if (!input.sequenceId || !input.snapshotHash) return fail('NOT_FOUND', 'Run a simulation first.')
  const cfg = await configHash(s.payload, input.sequenceId)
  if (!cfg) return fail('NOT_PUBLISHED', 'That sequence has no published version.')
  if (cfg.hash !== input.snapshotHash) return fail('STALE', 'This simulation is out of date. Run it again.')
  await s.payload.create({
    collection: 'crm-ers-simulations',
    data: { sequence: input.sequenceId, version_hash: cfg.versionHash, snapshot_hash: cfg.hash, approved_at: now.toISOString(), approved_by: s.userId } as never,
    overrideAccess: true,
    depth: 0,
    context: { crmServer: {} },
    user: s.user as never,
  })
  return { ok: true, message: 'Recorded. This simulation was reviewed. Nothing was sent.' }
}
