import type { EvidenceGridProps } from './index'

export const fixtures: { default: EvidenceGridProps } & Record<string, EvidenceGridProps> = {
  default: {
    eyebrow: 'The evidence',
    title: '{{count}} published numbers that explain why this is urgent.',
    lede: 'None of these are mine. They are from independent studies you can open and check — the same standard I hold my own reporting to.',
    items: [
      {
        figure: '90%',
        claim: 'of ChatGPT search citations go to pages ranking 21 or lower',
        detail:
          'Position one in Google buys you almost nothing here. The assistant retrieves from a different pool than the one you have been optimising for.',
        source: {
          publisher: 'Semrush',
          title: 'AI Search & SEO Traffic Study',
          href: 'https://www.semrush.com/blog/ai-search-seo-traffic-study/',
          date: 'July 2025',
        },
      },
      {
        figure: '4.4×',
        claim: 'the value of an ordinary organic visitor',
        detail:
          'Measured by conversion rate. AI-referred visitors arrive further down the funnel because the assistant already did the shortlisting.',
        source: {
          publisher: 'Semrush',
          title: 'AI Search & SEO Traffic Study',
          href: 'https://www.semrush.com/blog/ai-search-seo-traffic-study/',
          date: 'July 2025',
        },
      },
      {
        figure: '−34.5%',
        claim: 'clickthrough for top-ranking pages when an AI Overview appears',
        detail:
          'Across 300,000 keywords, comparing March 2024 with March 2025. Your rankings can hold perfectly still while the traffic behind them drains.',
        source: {
          publisher: 'Ahrefs',
          title: 'AI Overviews Reduce Clicks',
          href: 'https://ahrefs.com/blog/ai-overviews-reduce-clicks/',
          date: '2025',
        },
      },
      {
        figure: '45:1',
        claim: 'email marketing ROI in retail and e-commerce',
        detail:
          'Software returns 36:1, agencies 42:1. This is why every engagement ends in email — it is the highest-return place to put AI-referred attention.',
        source: {
          publisher: 'Litmus',
          title: 'The ROI of Email Marketing',
          href: 'https://www.litmus.com/blog/infographic-the-roi-of-email-marketing',
          date: '2025',
        },
      },
    ],
  },
}
