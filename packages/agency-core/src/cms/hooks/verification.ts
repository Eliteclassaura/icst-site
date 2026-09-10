import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Publish-time verification (ADR-016 made verification a launch gate; ADR-028 §8 enforces it at publish).
 *
 * Mode comes from VERIFICATION_ENFORCEMENT:
 *   - `enforce` (default when NODE_ENV=production): publishing a document whose `verification.status` is not
 *     `verified` throws for everyone — human or machine.
 *   - `warn` (default otherwise; staging/CI/dev set it explicitly): the publish is allowed and recorded, so
 *     review sites can show unverified copy. The C9 launch gate refuses production-launch mode unless enforce.
 */
export function verificationMode(env: NodeJS.ProcessEnv = process.env): 'enforce' | 'warn' {
  const v = (env.VERIFICATION_ENFORCEMENT ?? '').toLowerCase()
  if (v === 'enforce' || v === 'warn') return v
  return env.NODE_ENV === 'production' ? 'enforce' : 'warn'
}

type Doc = { _status?: string | null; verification?: { status?: string | null } | null } & Record<
  string,
  unknown
>

export const requireVerifiedToPublish: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  req,
  collection,
}) => {
  const d = data as Doc
  const prev = originalDoc as Doc | undefined
  const becomingPublished = d._status === 'published' && prev?._status !== 'published'
  if (!becomingPublished) return data
  const status = d.verification?.status ?? prev?.verification?.status ?? 'unverified'
  if (status === 'verified') return data
  if (verificationMode() === 'enforce') {
    throw new Error(
      `Cannot publish ${collection.slug}: verification.status is "${status}". Verify the facts first (ADR-016 / ADR-028 §8).`,
    )
  }
  req.payload.logger.warn(
    { collection: collection.slug, id: prev?.id, status },
    'published with unverified content (VERIFICATION_ENFORCEMENT=warn)',
  )
  return data
}

/**
 * Records the last human edit so a later automation draft can be checked for conflicts (ADR-028 §5, R57).
 * Service accounts are not humans; their writes are stamped by the automation hooks (C6.5).
 */
export const stampHumanEdit: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (operation !== 'update') return data
  const user = req.user as { collection?: string } | null
  if (!user || user.collection === 'service-accounts') return data
  const d = data as Record<string, unknown>
  const automation = (d.automation as Record<string, unknown> | undefined) ?? {}
  d.automation = { ...automation, lastHumanEditAt: new Date().toISOString() }
  return d
}
