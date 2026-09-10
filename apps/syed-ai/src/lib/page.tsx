import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RenderBlocks, type LayoutBlockData } from '@factory/agency-core/blocks'
import { SiteFrame, getSiteChrome } from './site'
import { buildJsonLd, buildMetadata, pagePath } from './seo'
import { HashRoutes } from './HashRoutes'
import { FormEnhance } from './FormEnhance'
import blueprint from '../../content/syed-ai.blueprint.json'

// Legacy hash routes that still live on the home page map to block anchors; the rest redirect (A4).
const HOME_HASH_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(blueprint.hashRoutes as Record<string, string>)
    .filter(([k]) => !k.includes('<'))
    .map(([k, v]) => [k, v.startsWith('/#') ? v.slice(1) : v]),
)

/**
 * Resolve a URL path (segments) to a page: the last segment is the slug, the segments before it must
 * match the parent chain (A4: /work/<id>/ is the page `<id>` with parent `work`). Anything else is a 404.
 */
export async function getPage(segments: string[]) {
  const payload = await getPayload({ config })
  const slug = segments.length ? segments[segments.length - 1]! : 'home'
  const res = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    draft: false,
  })
  const page = res.docs[0] ?? null
  if (!page) return null
  if (pagePath(page) !== (segments.length ? `/${segments.join('/')}/` : '/')) return null
  return page
}

export async function pageMetadata(segments: string[]): Promise<Metadata> {
  const page = await getPage(segments)
  if (!page) return {}
  const chrome = await getSiteChrome()
  return buildMetadata(
    page,
    { origin: chrome.origin, siteName: chrome.siteName, defaults: chrome.seoDefaults },
    pagePath(page),
  )
}

/** Renders a CMS page through the registry inside the site chrome. The page's h1 comes from its hero block (or its title when no hero leads). */
export async function CmsPage({ segments }: { segments: string[] }) {
  const page = await getPage(segments)
  if (!page) notFound()
  const chrome = await getSiteChrome()
  const layout = (page.layout ?? []) as unknown as LayoutBlockData[]
  const leadsWithHero = layout.some(
    (b, i) => i < 3 && b.blockType === 'hero' && (b as { as?: string }).as !== 'h2',
  )
  const path = pagePath(page)
  const jsonLd = buildJsonLd({
    page,
    path,
    site: {
      origin: chrome.origin,
      siteName: chrome.siteName,
      defaults: chrome.seoDefaults,
      entities: chrome.entities,
    },
    layout,
    siteSettings: chrome.site,
  })
  const ctx = { ...chrome.ctx, currentPath: path }
  return (
    <SiteFrame currentPath={path}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      {path === '/' && <HashRoutes map={HOME_HASH_MAP} />}
      {!leadsWithHero && (
        <div className="ds-container">
          <h1 className="t-d2">{page.title}</h1>
        </div>
      )}
      <RenderBlocks layout={layout} ctx={ctx} />
      {layout.some((b) => b.blockType === 'briefForm') && <FormEnhance />}
    </SiteFrame>
  )
}
