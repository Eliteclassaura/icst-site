import blueprint from '../../content/syed-ai.blueprint.json' with { type: 'json' }
import overrides from '../../design/fixture-brand.json' with { type: 'json' }
import { resolveBrand } from '@factory/design-bundle/brand'
import type { BrandOverrides, FixtureBrand } from '@factory/design-bundle/brand'

/**
 * This client's identity, injected into the shared registry fixtures (ADR-026 §3).
 *
 * Fixtures carry no client's identity, so anything that renders one — the seed's chrome globals,
 * the `/dev/blocks` gallery, `design:bundle` — resolves it here. Fields the blueprint owns are
 * read from the blueprint; the rest come from the committed overrides file, and a unit test
 * asserts the two agree.
 */
export const SITE_ID = 'syed-ai'

export const fixtureBrand: FixtureBrand = resolveBrand(
  SITE_ID,
  blueprint as Parameters<typeof resolveBrand>[1],
  overrides as BrandOverrides,
)
