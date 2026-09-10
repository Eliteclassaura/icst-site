import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  HeaderBlock,
  FooterBlock,
  headerProps,
  footerProps,
  formSelects,
  type RenderContext,
} from '@factory/agency-core/blocks'

const SYED_MONOGRAM =
  'M27.4 11.6c-2.7-2.3-6.7-2.7-9.4-1-3.1 2-3 5.8.4 7.4 2.2 1.1 5.5 1.4 7.5 2.7 3.1 2.1 2.7 6.2-.7 8-3.1 1.7-7.4 1-10-1.4'

/** Globals every public page needs, fetched once per request (React cache) through the local API. */
export const getSiteChrome = cache(async () => {
  const payload = await getPayload({ config })
  const [header, brand, footer, contact, site, forms, integrations, seoDefaults] = await Promise.all([
    payload.findGlobal({ slug: 'header' }),
    payload.findGlobal({ slug: 'brand-settings' }),
    payload.findGlobal({ slug: 'footer' }),
    payload.findGlobal({ slug: 'contact-legal', depth: 1 }),
    payload.findGlobal({ slug: 'site-settings' }),
    payload.findGlobal({ slug: 'form-config' }),
    payload.findGlobal({ slug: 'integrations', overrideAccess: true }),
    payload.findGlobal({ slug: 'seo-defaults', depth: 1 }),
  ])
  const origin = (process.env.NEXT_PUBLIC_SERVER_URL || site?.siteUrl || 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
  const entities = ((seoDefaults?.entities ?? []) as unknown[])
    .filter((e): e is { schemaId: string; type: string; data: unknown; emitOn?: string | null } =>
      Boolean(e && typeof e === 'object' && 'schemaId' in e),
    )
    .map((e) => ({ schemaId: e.schemaId, type: e.type, data: e.data, emitOn: e.emitOn }))
  const offices = footerProps(footer, contact, site).offices ?? []
  const turnstile = integrations?.turnstile
  const ctx: RenderContext = {
    formSelects: formSelects(forms),
    formAction: '/api/forms/brief',
    turnstileSiteKey: turnstile?.enabled && turnstile.siteKey ? turnstile.siteKey : undefined,
    offices,
  }
  return {
    header,
    brand,
    footer,
    contact,
    site,
    ctx,
    seoDefaults,
    origin,
    entities,
    siteName: site?.siteName || 'syed.ai',
  }
})

/** Header + footer around a page's blocks. Chrome comes from globals, never from fixtures. */
export async function SiteFrame({
  currentPath,
  children,
}: {
  currentPath: string
  children: React.ReactNode
}) {
  const { header, brand, footer, contact, site } = await getSiteChrome()
  return (
    <>
      <HeaderBlock {...headerProps(header, brand, { currentPath, monogramPath: SYED_MONOGRAM })} />
      <main id="main">{children}</main>
      <FooterBlock {...footerProps(footer, contact, site)} />
    </>
  )
}
