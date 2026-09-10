import { getSiteChrome } from '../../../lib/site'

export const dynamic = 'force-dynamic'

/** llms.txt — an experimental, transparent aid only; never represented as a ranking requirement (master prompt). */
export async function GET() {
  const { seoDefaults } = await getSiteChrome()
  if (!seoDefaults?.llmsTxt) return new Response('Not found', { status: 404 })
  return new Response(seoDefaults.llmsTxt, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
