import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FooterBlock, HeaderBlock, RenderBlocks } from '@factory/agency-core/blocks'
import { client, DEFAULT_CLIENT } from '../../../../client'
import { loadChrome, loadPage } from '../../../../client/site/content'

/**
 * KIT-0 H6: preview route for a non-default client (`CLIENT=icst`): `/client-preview/` is its home, `/client-preview/about/` is
 * `content/pages/about.json`. It is the way to see a client's pages on a dev server before the build switch rewrites `/` to it (H6b).
 * With CLIENT unset (the default client) every path here is a 404.
 */
type Params = { params: Promise<{ path?: string[] }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = client()
  if (c.slug === DEFAULT_CLIENT) return {}
  const page = loadPage(c.slug, (await params).path ?? [])
  return page ? { title: `${page.title} | ${c.brandName('site')}`, description: page.description, robots: { index: false, follow: false } } : {}
}

export default async function ClientPreviewPage({ params }: Params) {
  const c = client()
  if (c.slug === DEFAULT_CLIENT) notFound()
  const segments = (await params).path ?? []
  const page = loadPage(c.slug, segments)
  if (!page) notFound()
  const chrome = loadChrome(c.slug)
  const currentPath = segments.length ? `/${segments.join('/')}/` : '/'
  return (
    <>
      <HeaderBlock {...chrome.header} currentPath={currentPath} />
      <main id="main">
        <RenderBlocks layout={page.layout} ctx={{ currentPath }} />
      </main>
      <FooterBlock {...chrome.footer} />
    </>
  )
}
