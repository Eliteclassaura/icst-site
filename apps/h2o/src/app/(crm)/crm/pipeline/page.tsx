import { redirect } from 'next/navigation'
import { requireCrmSession } from '../session'

/** OPP-1: the pipeline table is now the Deals board. Old links and bookmarks land there (after the sign-in check). */
export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCrmSession('/crm/pipeline/')
  const sp = await searchParams
  const q = new URLSearchParams({ view: 'board' })
  if (sp.owner === 'me') q.set('owner', 'me')
  if (sp.closed === '1') q.set('closed', '1')
  redirect(`/crm/deals/?${q}`)
}
