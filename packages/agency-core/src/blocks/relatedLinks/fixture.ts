import type { RelatedLinksProps } from './index'

export const fixtures: { default: RelatedLinksProps } & Record<string, RelatedLinksProps> = {
  default: {
    label: 'Keep reading',
    links: [
      {
        label: 'GEO vs SEO compared',
        href: '/geo-vs-seo/',
        description: 'Nine decisions that differ in practice.',
      },
      {
        label: 'Cited ≠ recommended',
        href: '/cited-not-recommended/',
        description: 'Why a citation is not a sale.',
      },
      { label: 'AI search glossary', href: '/glossary/', description: 'The vocabulary, defined once.' },
    ],
  },
}
