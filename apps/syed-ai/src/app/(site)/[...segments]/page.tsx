import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { CmsPage, pageMetadata } from '../../../lib/page'

type Args = { params: Promise<{ segments: string[] }> }
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { segments } = await params
  if (segments.join('/') === 'home') return {}
  return pageMetadata(segments)
}
export default async function Page({ params }: Args) {
  const { segments } = await params
  // The home page lives at `/` (canonical); `/home/` must not become a duplicate.
  if (segments.join('/') === 'home') permanentRedirect('/')
  if (segments[0] === 'dev' || segments[0] === 'api' || segments[0] === 'admin') notFound()
  return <CmsPage segments={segments} />
}
