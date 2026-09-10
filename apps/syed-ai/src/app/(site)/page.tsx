import type { Metadata } from 'next'
import { CmsPage, pageMetadata } from '../../lib/page'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata([])
}
export default function Home() {
  return <CmsPage segments={[]} />
}
