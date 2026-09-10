import { getSiteChrome } from '../../../lib/site'

export const dynamic = 'force-dynamic'

/** robots.txt from seo-defaults (legacy content carried verbatim; AI crawlers explicitly allowed). Staging is noindex via headers (C9). */
export async function GET() {
  const { seoDefaults, origin } = await getSiteChrome()
  const body = (seoDefaults?.robotsTxt || 'User-agent: *\nAllow: /\n').replace(
    /Sitemap: .*/g,
    `Sitemap: ${origin}/sitemap.xml`,
  )
  return new Response(body.endsWith('\n') ? body : body + '\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
