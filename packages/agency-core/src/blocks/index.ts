import type { BlockDefinition } from './types'
import { header } from './header/index'
import { footer } from './footer/index'
import { hero } from './hero/index'
import { richText } from './richText/index'
import { takeawayList } from './takeawayList/index'
import { evidenceGrid } from './evidenceGrid/index'
import { faq } from './faq/index'
import { glossaryList } from './glossaryList/index'
import { cta } from './cta/index'
import { briefForm } from './briefForm/index'
import { dataTable } from './dataTable/index'
import { steps } from './steps/index'
import { relatedLinks } from './relatedLinks/index'
import { breadcrumb } from './breadcrumb/index'
import { subNav } from './subNav/index'
import { offices } from './offices/index'

export * from './types'
export { Picture } from './shared/Picture'
export { SectionHead } from './shared/SectionHead'
export { placeholderImage } from './fixtures/placeholder'
export { lexical } from './fixtures/lexical'
export { RenderBlocks, resolveImage } from './render'
export type { LayoutBlockData } from './render'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const registry: ReadonlyArray<BlockDefinition<any>> = [
  header,
  footer,
  hero,
  richText,
  takeawayList,
  evidenceGrid,
  faq,
  glossaryList,
  cta,
  briefForm,
  dataTable,
  steps,
  relatedLinks,
  breadcrumb,
  subNav,
  offices,
]

export const bySlug = Object.fromEntries(registry.map((b) => [b.slug, b])) as Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BlockDefinition<any>
>

export {
  header,
  footer,
  hero,
  richText,
  takeawayList,
  evidenceGrid,
  faq,
  glossaryList,
  cta,
  briefForm,
  dataTable,
  steps,
  relatedLinks,
  breadcrumb,
  subNav,
  offices,
}
export { headerProps, footerProps, formSelects } from './chrome'
export { HeaderBlock, type HeaderProps } from './header/index'
export { FooterBlock, type FooterProps } from './footer/index'
export { HeroBlock, type HeroProps } from './hero/index'
export { RichTextBlock, type RichTextProps } from './richText/index'
export { TakeawayListBlock, type TakeawayListProps } from './takeawayList/index'
export { EvidenceGridBlock, type EvidenceGridProps } from './evidenceGrid/index'
export { FaqBlock, type FaqProps } from './faq/index'
export { GlossaryListBlock, type GlossaryListProps } from './glossaryList/index'
export { CtaBlock, type CtaProps } from './cta/index'
export { BriefFormBlock, type BriefFormProps, type SelectField } from './briefForm/index'
export type { RenderContext } from './render'
export { DataTableBlock, type DataTableProps } from './dataTable/index'
export { StepsBlock, type StepsProps } from './steps/index'
export { RelatedLinksBlock, type RelatedLinksProps } from './relatedLinks/index'
export { BreadcrumbBlock, type BreadcrumbProps } from './breadcrumb/index'
export { SubNavBlock, type SubNavProps } from './subNav/index'
export { OfficesBlock, type OfficesProps } from './offices/index'
