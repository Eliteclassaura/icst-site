export { configHash } from './simulate'
import type { Payload } from 'payload'

/** The latest simulation review for a sequence, compared with the hash it must match now (read only). */
export async function simulationReviewFor(payload: Payload, sequenceId: string, currentHash: string | null): Promise<{ state: 'NONE' | 'CURRENT' | 'STALE'; hash: string | null; at: string | null }> {
  const res = await payload.find({ collection: 'crm-ers-simulations', where: { sequence: { equals: sequenceId } } as never, sort: '-approved_at', limit: 1, overrideAccess: true, depth: 0 })
  const last = res.docs[0] as unknown as Record<string, unknown> | undefined
  if (!last) return { state: 'NONE', hash: null, at: null }
  return { state: currentHash && last.snapshot_hash === currentHash ? 'CURRENT' : 'STALE', hash: String(last.snapshot_hash), at: String(last.approved_at) }
}
