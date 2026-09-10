import type { HeaderProps } from './index'

// Identity is injected at render time from the client's brand (ADR-026 §3); fixtures stay neutral.

export const fixtures: { default: HeaderProps } & Record<string, HeaderProps> = {
  default: {
    brand: {
      name: '{{brand.wordmark}}',
      accent: '{{brand.accent}}',
      role: '{{brand.role}}',
      href: '/',
      monogramPath: '{{brand.monogramPath}}',
    },
    links: [
      { label: 'Overview', href: '/' },
      { label: 'Case studies', href: '/work/' },
      { label: 'Building', href: '/building/' },
      { label: 'Engagements', href: '/geo-pricing/#rates' },
      { label: 'Pricing', href: '/geo-pricing/' },
      { label: 'Glossary', href: '/glossary/' },
      { label: 'Contact', href: '/#contact' },
    ],
    currentPath: '/',
    cta: { label: 'Book an audit', href: '/#contact' },
  },
}
