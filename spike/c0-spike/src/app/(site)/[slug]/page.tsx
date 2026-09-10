import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'

type Args = { params: Promise<{ slug: string }> }
export const dynamic = 'force-dynamic'

async function getPage(slug: string) {
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'pages', where: { slug: { equals: slug } }, limit: 1, draft: false })
  return res.docs[0] ?? null
}
export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const page = await getPage(slug)
  if (!page) return {}
  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description || undefined,
    alternates: { canonical: `${process.env.NEXT_PUBLIC_SERVER_URL}/${slug}/` },
  }
}
export default async function Page({ params }: Args) {
  const { slug } = await params
  const page = await getPage(slug)
  if (!page) notFound()
  return (
    <main>
      <h1>{page.title}</h1>
      {page.body ? <RichText data={page.body} /> : null}
    </main>
  )
}
