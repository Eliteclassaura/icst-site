import type { FooterProps } from './index'
import { brandList } from '../fixtures/brand'

// Identity (social links, offices, copyright holder) is injected at render time (ADR-026 §3).

export const fixtures: { default: FooterProps } & Record<string, FooterProps> = {
  default: {
    year: 2026,
    columns: [
      {
        heading: 'Work',
        links: [
          { label: 'Case studies', href: '/work/' },
          { label: 'Building', href: '/building/' },
          { label: 'Engagements', href: '/geo-pricing/#rates' },
        ],
      },
      {
        heading: 'Disciplines',
        links: [
          { label: 'AI search & GEO', href: '/work/skincare/' },
          { label: 'Technical & content SEO', href: '/work/marketplace/' },
          { label: 'Cold email & lifecycle', href: '/work/lifecycle/' },
        ],
      },
      {
        heading: 'Tools',
        links: [
          { label: 'AI Visibility Scorecard', href: '/#scorecard' },
          { label: 'Revenue model', href: '/#roi' },
          { label: 'Answer simulator', href: '/#overview' },
        ],
      },
      {
        heading: 'Reference',
        links: [
          { label: 'What GEO costs', href: '/geo-pricing/' },
          { label: 'GEO vs SEO compared', href: '/geo-vs-seo/' },
          { label: 'Cited ≠ recommended', href: '/cited-not-recommended/' },
          { label: 'AI search glossary', href: '/glossary/' },
        ],
      },
      {
        heading: 'Contact',
        links: [
          { label: 'Send a brief', href: '/#contact' },
          { label: 'The Answer Layer', href: '/#newsletter' },
          brandList<{ label: string; href: string; external?: boolean }>('social'),
        ],
      },
    ],
    offices: [brandList<{ city: string; region: string; hours: string }>('offices')],
    copyrightHolder: '{{brand.copyrightHolder}}',
  },
}
