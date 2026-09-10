import type { RichTextProps } from './index'
import { lexical } from '../fixtures/lexical'

export const fixtures: { default: RichTextProps } & Record<string, RichTextProps> = {
  default: {
    body: lexical([
      {
        p: [
          {
            bold: 'Generative engine optimization (GEO) is the practice of getting a brand named inside AI-generated answers',
          },
          ' — the paragraph ChatGPT, Perplexity, Google AI Overviews or Copilot returns instead of a list of links.',
        ],
      },
      { h2: 'Why it is measured in revenue' },
      {
        p: [
          'AI-referred traffic is high-intent and low-volume, so the scoreboard is a prompt set weighted by the revenue behind each question, not a keyword list. ',
          { link: 'See the pricing table', href: '/geo-pricing/' },
          '.',
        ],
      },
      {
        ul: [
          ['One name, one category, one claim across your site, schema and third-party profiles.'],
          ['Answer-first pages a retriever can lift whole.'],
          ['Corroboration on review sites, roundups and comparison pages.'],
        ],
      },
    ]),
  },
  wide: {
    measure: 'wide',
    body: lexical([
      {
        p: [
          'I run GEO alongside technical and content SEO, and lifecycle and outbound email, as one program, because AI-referred traffic is high-intent and low-volume.',
        ],
      },
      {
        p: [
          'Typical clients are direct-to-consumer brands, B2B SaaS companies and multi-location service businesses where a shortlist decision is being made by an assistant before anyone visits a website.',
        ],
      },
    ]),
  },
}
