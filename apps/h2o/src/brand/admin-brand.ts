import { client } from '../client'

/**
 * BRAND-ADMIN-1 (owner request, CT 2026-10-07): the ICS brand on the admin login, the admin nav and the CRM sign-in pages,
 * from the existing site assets in /public/brand. The admin tab title follows the environment: the production indexing
 * policy (H2O_INDEXING_POLICY=production, the one switch that already separates production from staging) reads
 * "· ICS admin"; everything else reads "· ICS staging admin". It used to be a fixed "· H2O staging admin" that would
 * have shipped to production.
 */
/**
 * KIT-0 H1: the names and logo paths come from the client manifest (`client()`); for H2O they equal the strings that used to be
 * written here. The pixel sizes are the supplied H2O assets' and stay fixed.
 */
/** The one switch that separates production from everything else (kept under its existing env name). */
const indexingPolicy = (env: NodeJS.ProcessEnv = process.env): 'private' | 'production' => (env.H2O_INDEXING_POLICY === 'production' ? 'production' : 'private')
const BRAND = client().manifest
export const ADMIN_BRAND_ALT = `${BRAND.client.shortName} ${BRAND.client.displayName}`
export const ADMIN_LOGO = { light: BRAND.brand.logo.light, dark: BRAND.brand.logo.dark, width: 1000, height: 256 } as const
export const ADMIN_EMBLEM = { src: BRAND.brand.logo.emblem, width: 180, height: 180 } as const

/** No leading space: Payload joins the page title and `meta.titleSuffix` with one space itself (QA R17B M1: "Login  · …" had two). */
export const adminTitleSuffix = (env: NodeJS.ProcessEnv = process.env): string =>
  indexingPolicy(env) === 'production' ? `· ${BRAND.brand.names.admin}` : `· ${BRAND.client.shortName} staging admin`
