import type { Metadata } from 'next'
import config from '@payload-config'
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { anyUserExists, isCreateFirstUserSegments } from '../../../../auth/first-user'
import { importMap } from '../importMap.js'

type Args = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] }>
}
export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })
// SEC-MAIN-1: /admin/create-first-user is 404 once any user exists (src/auth/first-user.ts).
const Page = async ({ params, searchParams }: Args) => {
  const { segments } = await params
  if (isCreateFirstUserSegments(segments) && (await anyUserExists(await getPayload({ config })))) notFound()
  return RootPage({ config, params, searchParams, importMap })
}
export default Page
