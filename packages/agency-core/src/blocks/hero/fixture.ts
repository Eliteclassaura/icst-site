import type { HeroProps } from './index'
import { placeholderImage } from '../fixtures/placeholder'

export const fixtures: { default: HeroProps } & Record<string, HeroProps> = {
  default: {
    status: 'Two engagement slots open',
    title: 'Your buyer already asked an assistant. It named someone else.',
    lede: 'I use AI to find where your revenue leaks, get you named inside ChatGPT, Perplexity and Google AI Overviews, then convert that attention into monthly cash flow with email.',
    cta: {
      primary: { label: 'See the numbers', href: '#work' },
      secondary: { label: 'Score my visibility', href: '#scorecard' },
    },
    image: placeholderImage({
      width: 1600,
      height: 900,
      alt: '{{brand.heroAlt}}',
      label: 'hero 16:9',
    }),
  },
  plain: {
    variant: 'plain',
    eyebrow: 'Pricing, published',
    title: 'What GEO costs, at every budget.',
    lede: 'Three engagement shapes, one scoreboard. Prices are published so the first call is about the gap, not the rate card.',
    cta: { primary: { label: 'Send a brief', href: '#contact' } },
  },
}
