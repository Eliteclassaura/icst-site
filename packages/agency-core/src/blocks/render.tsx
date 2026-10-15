import type { ReactNode } from 'react'
import type { ImageRef } from './types'
import { HeroBlock, type HeroProps } from './hero/index'
import { RichTextBlock, type RichTextProps } from './richText/index'
import { TakeawayListBlock, type TakeawayListProps } from './takeawayList/index'
import { EvidenceGridBlock, type EvidenceGridProps } from './evidenceGrid/index'
import { FaqBlock, type FaqProps } from './faq/index'
import { GlossaryListBlock, type GlossaryListProps } from './glossaryList/index'
import { CtaBlock, type CtaProps } from './cta/index'
import { BriefFormBlock, type BriefFormProps, type SelectField } from './briefForm/index'
import { DataTableBlock, type DataTableProps } from './dataTable/index'
import { StepsBlock, type StepsProps } from './steps/index'
import { RelatedLinksBlock, type RelatedLinksProps } from './relatedLinks/index'
import { BreadcrumbBlock, type BreadcrumbProps } from './breadcrumb/index'
import { SubNavBlock, type SubNavProps } from './subNav/index'
import { OfficesBlock, type OfficesProps } from './offices/index'
import { ServiceBandBlock, type ServiceBandProps } from './serviceBand/index'
import { ProjectCarouselBlock, type ProjectCarouselProps } from './projectCarousel/index'
import { PhoneCtaBlock, type PhoneCtaProps } from './phoneCta/index'
import { ArticleBodyBlock } from './articleBody/index'
import { ProductGridBlock, type ProductGridProps } from './productGrid/index'
import { ChipNavBlock, type ChipNavProps } from './chipNav/index'

/** The shape of one `pages.layout` row as Payload returns it (depth ≥ 1 so uploads are populated). */
export type LayoutBlockData = { blockType: string; id?: string | null; blockName?: string | null } & Record<
  string,
  unknown
>

type MediaDoc = {
  url?: string | null
  alt?: string | null
  width?: number | null
  height?: number | null
  decorative?: boolean | null
  sizes?: Record<
    string,
    { url?: string | null; width?: number | null; mimeType?: string | null } | undefined
  > | null
}

/** Map a populated Media document to the ImageRef blocks consume. Returns undefined for unpopulated ids. */
export function resolveImage(m: unknown): ImageRef | undefined {
  if (!m || typeof m !== 'object' || !('url' in m)) return undefined
  const d = m as MediaDoc
  if (!d.url || !d.width || !d.height) return undefined
  const sources = Object.values(d.sizes ?? {})
    .filter((s): s is { url: string; width: number; mimeType?: string | null } => Boolean(s?.url && s?.width))
    .filter((s) => s.width < 1601) // 'og' is 1200×630 crop; all others are width-only resizes — fine for srcset
    .sort((a, b) => a.width - b.width)
    .map((s) => ({ url: s.url, width: s.width, type: s.mimeType ?? undefined }))
  return {
    url: d.url,
    alt: d.alt ?? '',
    width: d.width,
    height: d.height,
    decorative: Boolean(d.decorative),
    sources,
  }
}

const linkOf = (g: unknown) => {
  const l = g as { label?: string | null; href?: string | null; external?: boolean | null } | null | undefined
  return l?.label && l?.href ? { label: l.label, href: l.href, external: Boolean(l.external) } : undefined
}
const ctaOf = (g: unknown) => {
  const c = g as { primary?: unknown; secondary?: unknown } | null | undefined
  return { primary: linkOf(c?.primary), secondary: linkOf(c?.secondary) }
}

export type RenderContext = {
  /** From the `form-config` global — select options shared by chat and form. */
  formSelects?: SelectField[]
  turnstileSiteKey?: string
  formAction?: string
  /** From the Offices collection (via contact-legal), shared by the footer and the offices block. */
  offices?: OfficesProps['offices']
  /** Path of the page being rendered — for aria-current in sub navigation. */
  currentPath?: string
  /** The client's public phone (from the manifest). The phoneCta block renders nothing without it. */
  phone?: { display: string; tel: string } | null
}

/**
 * Renders a page's layout through the registry. Unknown block types render nothing and are reported
 * through `onUnknown` so a stale document never breaks a page (and the gate can count them).
 */
const BLEED = new Set(['hero', 'cta', 'subNav'])

/** Full-bleed blocks own their geometry; every other block sits in a band inside the container. */
function Band({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section className="ds-band" id={id}>
      <div className="ds-container">{children}</div>
    </section>
  )
}

export function RenderBlocks({
  layout,
  ctx = {},
  onUnknown,
}: {
  layout: LayoutBlockData[] | null | undefined
  ctx?: RenderContext
  onUnknown?: (blockType: string) => void
}): ReactNode {
  return (layout ?? []).map((b, i) => {
    const key = b.id ?? `${b.blockType}-${i}`
    const node = renderOne(b, key, ctx, onUnknown)
    if (node === null || BLEED.has(b.blockType)) return node
    return (
      <Band key={key} id={b.blockName || `s-${b.blockType}-${i}`}>
        {node}
      </Band>
    )
  })
}

function renderOne(
  b: LayoutBlockData,
  key: string,
  ctx: RenderContext,
  onUnknown?: (blockType: string) => void,
): ReactNode {
  {
    switch (b.blockType) {
      case 'hero': {
        const p = b as unknown as Omit<HeroProps, 'image' | 'cta'> & { image?: unknown; cta?: unknown }
        return <HeroBlock key={key} {...p} image={resolveImage(p.image)} cta={ctaOf(p.cta)} />
      }
      case 'richText':
        return <RichTextBlock key={key} {...(b as unknown as RichTextProps)} />
      case 'takeawayList':
        return <TakeawayListBlock key={key} {...(b as unknown as TakeawayListProps)} />
      case 'evidenceGrid':
        return <EvidenceGridBlock key={key} {...(b as unknown as EvidenceGridProps)} />
      case 'faq':
        return <FaqBlock key={key} {...(b as unknown as FaqProps)} />
      case 'glossaryList': {
        const p = b as unknown as Omit<GlossaryListProps, 'more'> & { more?: unknown }
        return <GlossaryListBlock key={key} {...p} more={linkOf(p.more)} />
      }
      case 'cta': {
        const p = b as unknown as Omit<CtaProps, 'image' | 'cta'> & { image?: unknown; cta?: unknown }
        return <CtaBlock key={key} {...p} image={resolveImage(p.image)} cta={ctaOf(p.cta)} />
      }
      case 'briefForm': {
        const p = b as unknown as Omit<BriefFormProps, 'selects' | 'action' | 'optIn'> & {
          optIn?: { enabled?: boolean | null; label?: string | null; text?: string | null } | null
        }
        const optIn =
          p.optIn?.enabled && p.optIn.label
            ? { name: 'want_plan', label: p.optIn.label, text: p.optIn.text ?? '', defaultChecked: false }
            : undefined
        return (
          <BriefFormBlock
            key={key}
            {...p}
            optIn={optIn}
            selects={ctx.formSelects ?? []}
            action={ctx.formAction ?? '/api/forms/brief'}
            turnstileSiteKey={ctx.turnstileSiteKey}
          />
        )
      }
      case 'dataTable': {
        const p = b as unknown as Omit<DataTableProps, 'columns' | 'rows'> & {
          columns: Array<{ label: string }>
          rows: Array<{ label: string; cells: Array<{ text: string }> }>
        }
        return (
          <DataTableBlock
            key={key}
            {...p}
            columns={(p.columns ?? []).map((c) => c.label)}
            rows={(p.rows ?? []).map((r) => ({ label: r.label, cells: (r.cells ?? []).map((c) => c.text) }))}
          />
        )
      }
      case 'steps':
        return <StepsBlock key={key} {...(b as unknown as StepsProps)} />
      case 'relatedLinks':
        return <RelatedLinksBlock key={key} {...(b as unknown as RelatedLinksProps)} />
      case 'breadcrumb':
        return <BreadcrumbBlock key={key} {...(b as unknown as BreadcrumbProps)} />
      case 'subNav': {
        const p = b as unknown as SubNavProps
        return <SubNavBlock key={key} {...p} currentHref={p.currentHref ?? ctx.currentPath} />
      }
      case 'offices': {
        const p = b as unknown as Omit<OfficesProps, 'offices'>
        return <OfficesBlock key={key} {...p} offices={ctx.offices ?? []} />
      }
      case 'phoneCta': {
        if (!ctx.phone) return null
        return <PhoneCtaBlock key={key} {...(b as unknown as PhoneCtaProps)} phone={ctx.phone} />
      }
      case 'articleBody': {
        // Payload rows are objects (paragraph text, link label/href); the block takes plain strings and links.
        type Row = Record<string, unknown>
        const p = b as unknown as { meta?: string; sourceNote?: string; readMore?: unknown; sections?: Row[] }
        const str = (v: unknown) => (typeof v === 'string' ? v : '')
        const sections = (p.sections ?? []).map((s) => ({
          heading: str(s.heading),
          paragraphs: ((s.paragraphs as unknown[]) ?? []).map((x) => (typeof x === 'string' ? x : str((x as Row).text))).filter(Boolean),
          bullets: ((s.bullets as Row[]) ?? []).map((x) => ({ lead: str(x.lead) || undefined, text: str(x.text) })),
          numbered: ((s.numbered as Row[]) ?? []).map((x) => ({ title: str(x.title), text: str(x.text) })),
          links: ((s.links as Row[]) ?? []).map((x) => ({ label: str(x.label), href: str(x.href) })).filter((l) => l.href),
        }))
        return (
          <ArticleBodyBlock
            key={key}
            meta={p.meta}
            sourceNote={p.sourceNote}
            sections={sections}
            readMore={linkOf(p.readMore)}
          />
        )
      }
      case 'productGrid': {
        const p = b as unknown as Omit<ProductGridProps, 'items'> & { items: Array<Record<string, unknown>> }
        return (
          <ProductGridBlock
            key={key}
            {...p}
            items={(p.items ?? []).map((it) => ({
              title: String(it.title ?? ''),
              text: String(it.text ?? ''),
              href: typeof it.href === 'string' && it.href ? it.href : undefined,
              image: resolveImage(it.image),
            }))}
          />
        )
      }
      case 'chipNav': {
        const p = b as unknown as Omit<ChipNavProps, 'links'> & { links: Array<Record<string, unknown>> }
        return (
          <ChipNavBlock
            key={key}
            label={String(p.label ?? '')}
            currentPath={p.currentPath}
            links={(p.links ?? [])
              .map((l) => ({ label: String(l.label ?? ''), href: String(l.href ?? '') }))
              .filter((l) => l.href)}
          />
        )
      }
      case 'serviceBand': {
        // Payload rows carry the media document; the block takes an ImageRef (resolved here, like projectCarousel).
        const p = b as unknown as Omit<ServiceBandProps, 'items'> & { items: Array<Record<string, unknown>> }
        return (
          <ServiceBandBlock
            key={key}
            {...p}
            items={(p.items ?? []).map((it) => ({
              title: String(it.title ?? ''),
              text: String(it.text ?? ''),
              href: typeof it.href === 'string' && it.href ? it.href : undefined,
              label: typeof it.label === 'string' && it.label ? it.label : undefined,
              date: typeof it.date === 'string' && it.date ? it.date : undefined,
              image: resolveImage(it.image),
            }))}
          />
        )
      }
      case 'projectCarousel': {
        const p = b as unknown as Omit<ProjectCarouselProps, 'items'> & { items: Array<Record<string, unknown>> }
        return (
          <ProjectCarouselBlock
            key={key}
            {...p}
            items={(p.items ?? []).map((it) => ({
              title: String(it.title ?? ''),
              text: String(it.text ?? ''),
              href: typeof it.href === 'string' && it.href ? it.href : undefined,
              image: resolveImage(it.image),
            }))}
          />
        )
      }
      default:
        onUnknown?.(b.blockType)
        return null
    }
  }
}
