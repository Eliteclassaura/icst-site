import { getPayload } from 'payload'
import config from '@payload-config'
import { getSiteChrome } from '../../../lib/site'
import { pagePath } from '../../../lib/seo'

export const dynamic = 'force-dynamic'

/** Every published, indexable page; priority/changefreq mirror the legacy sitemap for the five legacy URLs. */
export async function GET() {
  const payload = await getPayload({ config })
  const { origin } = await getSiteChrome()
  const res = await payload.find({
    collection: 'pages',
    where: { _status: { equals: 'published' } },
    limit: 500,
    depth: 1,
    draft: false,
  })
  const legacy: Record<string, { priority: string; changefreq: string }> = {
    '/': { priority: '1.0', changefreq: 'weekly' },
    '/geo-pricing/': { priority: '0.9', changefreq: 'monthly' },
    '/geo-vs-seo/': { priority: '0.8', changefreq: 'monthly' },
    '/cited-not-recommended/': { priority: '0.8', changefreq: 'monthly' },
    '/glossary/': { priority: '0.7', changefreq: 'monthly' },
  }
  const urls = res.docs
    .filter((p) => !p.seo?.noindex)
    .map((p) => {
      const path = pagePath(p)
      const meta = legacy[path] ?? { priority: '0.6', changefreq: 'monthly' }
      return `  <url><loc>${origin}${path}</loc><lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod><changefreq>${meta.changefreq}</changefreq><priority>${meta.priority}</priority></url>`
    })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
