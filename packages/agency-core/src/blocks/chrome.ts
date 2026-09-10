/**
 * Map CMS globals to the chrome blocks' props. Kept separate from render.tsx so the app decides
 * which globals to fetch (and with what depth) while the mapping stays testable without Payload.
 */
import type { HeaderProps } from './header/index'
import type { FooterProps } from './footer/index'
import type { SelectField } from './briefForm/index'

type LinkRow = { label?: string | null; href?: string | null; external?: boolean | null }
const links = (rows: unknown): { label: string; href: string; external?: boolean }[] =>
  ((rows as LinkRow[] | null | undefined) ?? [])
    .filter((r) => r?.label && r?.href)
    .map((r) => ({ label: r.label as string, href: r.href as string, external: Boolean(r.external) }))

export function headerProps(
  header: { primary?: unknown; ctaLabel?: string | null; ctaHref?: string | null } | null | undefined,
  brand:
    | {
        brandName?: string | null
        wordmark?: { text?: string | null; accentSuffix?: string | null; subline?: string | null } | null
      }
    | null
    | undefined,
  opts: { currentPath?: string; monogramPath?: string } = {},
): HeaderProps {
  return {
    brand: {
      name: brand?.wordmark?.text || brand?.brandName || 'Site',
      accent: brand?.wordmark?.accentSuffix ?? undefined,
      role: brand?.wordmark?.subline ?? undefined,
      href: '/',
      monogramPath: opts.monogramPath,
    },
    links: links(header?.primary),
    currentPath: opts.currentPath,
    cta: header?.ctaLabel && header?.ctaHref ? { label: header.ctaLabel, href: header.ctaHref } : undefined,
  }
}

type OfficeDoc = {
  name?: string | null
  address?: { country?: string | null } | null
  footerRole?: string | null
  hoursDisplay?: string | null
}

export function footerProps(
  footer: { columns?: unknown } | null | undefined,
  contact: { legalName?: string | null; offices?: unknown } | null | undefined,
  site: { siteName?: string | null } | null | undefined,
): FooterProps {
  const cols = (
    (footer?.columns as Array<{ heading?: string | null; links?: unknown }> | null | undefined) ?? []
  )
    .filter((c) => c?.heading)
    .map((c) => ({ heading: c.heading as string, links: links(c.links) }))
  const offices = ((contact?.offices as OfficeDoc[] | null | undefined) ?? [])
    .filter((o) => o && typeof o === 'object' && o.name)
    .map((o) => ({
      city: o.name as string,
      region: [o.address?.country, o.footerRole].filter(Boolean).join(' · '),
      hours: o.hoursDisplay ?? '',
    }))
  return {
    columns: cols,
    offices,
    copyrightHolder: contact?.legalName || site?.siteName || '',
  }
}

export function formSelects(cfg: { selects?: unknown } | null | undefined): SelectField[] {
  type Row = {
    key?: string | null
    label?: string | null
    options?: Array<{ label?: string | null; value?: string | null; default?: boolean | null }> | null
  }
  return ((cfg?.selects as Row[] | null | undefined) ?? [])
    .filter((r) => r?.key && r?.label && r.options?.length)
    .map((r) => ({
      name: r.key as string,
      label: r.label as string,
      options: (r.options ?? []).map((o) => o.label ?? o.value ?? '').filter(Boolean),
      defaultValue: (r.options ?? []).find((o) => o.default)?.label ?? undefined,
    }))
}
