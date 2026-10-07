import { indexingPolicy } from '../content/config'

/**
 * BRAND-ADMIN-1 (owner request, CT 2026-10-07): the ICS brand on the admin login, the admin nav and the CRM sign-in pages,
 * from the existing site assets in /public/brand. The admin tab title follows the environment: the production indexing
 * policy (H2O_INDEXING_POLICY=production, the one switch that already separates production from staging) reads
 * "· ICS admin"; everything else reads "· ICS staging admin". It used to be a fixed " · H2O staging admin" that would
 * have shipped to production.
 */
export const ADMIN_BRAND_ALT = 'ICS Industrial Cooling Solutions'
export const ADMIN_LOGO = { light: '/brand/ics-logo-original.webp', dark: '/brand/ics-logo-white-transparent.png', width: 1000, height: 256 } as const
export const ADMIN_EMBLEM = { src: '/brand/ics-emblem-favicon-source.png', width: 180, height: 180 } as const

export const adminTitleSuffix = (env: NodeJS.ProcessEnv = process.env): string =>
  indexingPolicy(env) === 'production' ? ' · ICS admin' : ' · ICS staging admin'
