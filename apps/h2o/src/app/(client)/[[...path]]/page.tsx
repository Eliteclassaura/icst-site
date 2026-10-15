import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FooterBlock, HeaderBlock, RenderBlocks } from '@factory/agency-core/blocks'
import { client } from '../../../client'
import { loadChrome, loadPage } from '../../../client/site/content'

/**
 * The client's public pages: `/` is `content/pages/home.json`, `/about/` is `about.json` (clients/<slug>/content). Header, blocks and
 * footer come from the agency-core block library; a path that is not a plain page slug is a 404.
 */
type Params = { params: Promise<{ path?: string[] }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = client()
  const page = loadPage(c.slug, (await params).path ?? [])
  return page ? { title: `${page.title} | ${c.brandName('site')}`, description: page.description } : {}
}

export default async function ClientPreviewPage({ params }: Params) {
  const c = client()
  const segments = (await params).path ?? []
  const page = loadPage(c.slug, segments)
  if (!page) notFound()
  const chrome = loadChrome(c.slug)
  const currentPath = segments.length ? `/${segments.join('/')}/` : '/'
  // The `offices` block's context comes from the manifest (public offices only). Phones are read from `client().offices[].phones`
  // (E.164 `tel` and display form), never typed into a page file.
  const offices = c.offices.filter((o) => o.publicOnSite).map((o) => ({ city: o.address.city, region: o.address.region, hours: '' }))
  return (
    <>
      <HeaderBlock {...chrome.header} currentPath={currentPath} />
      <main id="main">
        <RenderBlocks layout={page.layout} ctx={{ currentPath, offices }} />
      </main>
      <FooterBlock {...chrome.footer} />
    </>
  )
}
