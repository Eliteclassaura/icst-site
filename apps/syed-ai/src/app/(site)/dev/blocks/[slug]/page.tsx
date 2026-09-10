import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { bySlug } from '@factory/agency-core/blocks'
import { applyBrand } from '@factory/design-bundle/brand'
import { fixtureBrand } from '../../../../../lib/fixture-brand'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }>; searchParams: Promise<{ fixture?: string }> }

/**
 * Renders one registry fixture in isolation. Wrapped in <main> and a container for layout blocks;
 * chrome blocks render bare so header/footer keep their full-bleed geometry.
 */
export default async function BlockPreview({ params, searchParams }: Args) {
  if (process.env.NODE_ENV === 'production' && process.env.DEV_ROUTES !== '1') notFound()
  const { slug } = await params
  const { fixture = 'default' } = await searchParams
  const def = bySlug[slug]
  if (!def) notFound()
  const raw = def.fixtures[fixture]
  if (!raw) notFound()
  // Fixtures are brand-neutral; this site's identity is injected here, exactly as design:bundle does.
  const props = applyBrand(raw, fixtureBrand)
  const C = def.Component
  const body = <C {...props} />
  if (def.kind === 'chrome') {
    return (
      <>
        {slug === 'header' ? body : null}
        <main id="main" data-block={slug} data-fixture={fixture} style={{ minBlockSize: '20vh' }}>
          <h1 className="visually-hidden">{def.label} fixture</h1>
        </main>
        {slug === 'footer' ? body : null}
      </>
    )
  }
  const bleed = slug === 'hero' || slug === 'cta'
  return (
    <main id="main" data-block={slug} data-fixture={fixture}>
      {slug !== 'hero' && <h1 className="visually-hidden">{def.label} fixture</h1>}
      {bleed ? (
        body
      ) : (
        <div className="ds-container" style={{ paddingBlock: 'var(--s-7)' }}>
          {body}
        </div>
      )}
    </main>
  )
}
