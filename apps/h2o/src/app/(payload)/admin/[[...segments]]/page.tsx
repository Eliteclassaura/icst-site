import type { Metadata } from 'next'
import config from '@payload-config'
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminRouteDestination } from '../../../../auth/admin-access'
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
  const payload = await getPayload({ config })
  if (isCreateFirstUserSegments(segments) && (await anyUserExists(payload))) notFound()
  // Payload permits custom views through its public-view branch. Enforce the same role boundary
  // before rendering any admin route, including nested URLs and custom views. Signed-out
  // users still reach the shared login/reset flow; signed-in non-CMS users go to CRM and can still log out.
  const { user } = await payload.auth({ headers: await headers() })
  const destination = adminRouteDestination(user, segments)
  if (destination) redirect(destination)
  return RootPage({ config, params, searchParams, importMap })
}
export default Page
