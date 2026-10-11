import { NextResponse } from 'next/server'
import { releaseLedger } from '../../../../content/runtime-read'
import { LLMS_PATHS, buildLlmsTxt, type LlmsPage } from '../../../../content/llms-txt'
import { releaseRoutes, salmonDocument } from '../../../../site/salmon'
import { servedDescription, servedTitle } from '../../../../site/SalmonCanonical'

/**
 * /llms.txt (the proxy rewrites it here): the site map for AI assistants, built from the release data (./content/llms-txt). Built once per
 * ledger object (a published generation), so a publish replaces it. Short cache; no noindex of its own (the proxy's policy floor still
 * marks staging private).
 */
export const dynamic = 'force-dynamic'
let built: { ledger: object; text: string } | undefined

function pages(): LlmsPage[] {
  const ledger = releaseLedger() as { routes: Array<{ path: string; state: string; export: boolean; indexable: boolean }> }
  const open = new Set(ledger.routes.filter((r) => r.state === 'PUBLIC' && r.export && r.indexable).map((r) => r.path))
  const routes = releaseRoutes()
  return LLMS_PATHS.flatMap((path) => {
    const route = open.has(path) ? routes.find((r) => r.targetPath === path) : undefined
    if (!route) return []
    try {
      const doc = salmonDocument(route)
      return [{ path, title: servedTitle(doc), description: servedDescription(doc) ?? '' }]
    } catch {
      return []
    }
  })
}

export async function GET() {
  const ledger = releaseLedger() as object
  if (!built || built.ledger !== ledger) built = { ledger, text: buildLlmsTxt(pages()) }
  return new NextResponse(built.text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300', 'X-Content-Type-Options': 'nosniff' },
  })
}
