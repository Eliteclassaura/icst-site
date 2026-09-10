import type { SubNavProps } from './index'

export const fixtures: { default: SubNavProps } & Record<string, SubNavProps> = {
  default: {
    currentHref: '/geo-pricing/',
    links: [
      { label: 'What GEO costs', href: '/geo-pricing/' },
      { label: 'GEO vs SEO', href: '/geo-vs-seo/' },
      { label: 'Cited ≠ recommended', href: '/cited-not-recommended/' },
      { label: 'Glossary', href: '/glossary/' },
    ],
  },
}
