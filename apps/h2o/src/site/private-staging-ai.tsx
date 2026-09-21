import type { ReactNode } from 'react'

/**
 * Control Tower's R3 private-staging visual authorization.
 *
 * This module is intentionally isolated from the recovered-media authorities. These assets are
 * decorative staging treatments, never documentary evidence, and must not displace recovered
 * capability images or enter production without a later approval.
 */
const visual = (asset: string, id: string) => ({
  asset,
  id,
  productionStatus: 'NOT_PRODUCTION_APPROVED',
  provenance: 'NON_DOCUMENTARY_CONCEPTUAL_PHOTOREAL',
} as const)

const visuals = {
  hero: visual('/media/private-staging/ai-r3-001-hero-structural-abstraction.png', 'AI-R3-001'),
  heroAlternate: visual('/media/private-staging/ai-r3-008-mega-tower-alternate.png', 'AI-R3-008'),
  parts: visual('/media/private-staging/ai-r3-004-parts-louver-macro.png', 'AI-R3-004'),
  resources: visual('/media/private-staging/ai-r3-005-resources-fill-plate.png', 'AI-R3-005'),
  service: visual('/media/private-staging/ai-r3-003-service-blueprint-plate.png', 'AI-R3-003'),
  serviceAlternate: visual('/media/private-staging/ai-r3-009-service-alternate.png', 'AI-R3-009'),
} as const

/**
 * Private screenshot alternates are selected only at build/render time. The choice is never
 * exposed in public route copy, metadata, captions, or alt text.
 */
const requestedVariant = (): 'home-008' | 'service-009' | null => {
  const value = process.env.H2O_PRIVATE_STAGING_AI_VARIANT
  return value === 'home-008' || value === 'service-009' ? value : null
}

const selected = (kind: 'hero' | 'parts' | 'resources' | 'service') => {
  const variant = requestedVariant()
  if (kind === 'hero' && variant === 'home-008') return visuals.heroAlternate
  if (kind === 'service' && variant === 'service-009') return visuals.serviceAlternate
  return visuals[kind]
}

export const PrivateStagingVisual = ({ kind }: { kind: 'hero' | 'parts' | 'resources' | 'service' }): ReactNode => {
  const item = selected(kind)
  return (
    <figure
      aria-hidden="true"
      className={`private-staging-visual private-staging-visual--${kind}`}
      data-ai-asset={item.id}
      data-production-status={item.productionStatus}
      data-provenance={item.provenance}
    >
      <img alt="" decoding="sync" src={item.asset} />
    </figure>
  )
}

export const privateStagingVisuals = visuals
