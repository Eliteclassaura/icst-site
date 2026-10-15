import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FooterBlock, HeaderBlock, RenderBlocks } from '@factory/agency-core/blocks'
import { client } from '../../../client'
import { listPages, loadChrome, requestPath } from '../../../client/site/content'
import { expandCookieBlocks, loadInventory } from '../../../client/site/cookies'
import { canonicalUrl, indexingOn, robotsMeta, schemaGraph } from '../../../client/site/seo'

/**
 * The client's public pages: `/` is `content/pages/home.json`, `/about/` is `about.json` (clients/<slug>/content). Header, blocks and
 * footer come from the agency-core block library; a path that is not a plain page slug is a 404.
 */
type Params = { params: Promise<{ path?: string[] }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = client()
  const here = requestPath((await params).path ?? [])
  const found = listPages(c.slug).find((p) => p.path === here)
  if (!found) return { title: 'Page not found', robots: { index: false, follow: false } }
  const title = found.path === '/' ? found.page.title : `${found.page.title} | ${c.brandName('site')}`
  const url = canonicalUrl(c.origin, found.path)
  return {
    title,
    description: found.page.description,
    alternates: { canonical: url },
    robots: robotsMeta(indexingOn(), found.page),
    openGraph: { title, description: found.page.description, url, siteName: c.brandName('site'), type: 'website' },
  }
}

export default async function ClientPreviewPage({ params }: Params) {
  const c = client()
  const segments = (await params).path ?? []
  const pages = listPages(c.slug)
  const found = pages.find((p) => p.path === requestPath(segments))
  if (!found) notFound()
  const page = found.page
  const chrome = loadChrome(c.slug)
  const currentPath = found.path
  // The `offices` block's context comes from the manifest (public offices only). Phones are read from `client().offices[].phones`
  // (E.164 `tel` and display form), never typed into a page file.
  const offices = c.offices.filter((o) => o.publicOnSite).map((o) => ({ city: o.address.city, region: o.address.region, hours: '' }))
  const phone = c.offices.find((o) => o.publicOnSite && o.phones.length)?.phones[0]
  return (
    <>
      {/* Structured data: a data block, not executed, so the script CSP does not apply. `<` is escaped so page text can never close the tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph(c.manifest, found, pages)).replace(/</g, '\\u003c') }} />
      <HeaderBlock {...chrome.header} currentPath={currentPath} />
      <main id="main">
        <RenderBlocks layout={expandCookieBlocks(page.layout, loadInventory(c.slug))} ctx={{ currentPath, offices, phone }} />
      </main>
      <FooterBlock {...chrome.footer} />
    </>
  )
}
