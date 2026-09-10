import type { GlossaryListProps } from './index'

export const fixtures: { default: GlossaryListProps } & Record<string, GlossaryListProps> = {
  default: {
    eyebrow: 'Definitions',
    title: 'The vocabulary, defined once.',
    lede: 'Every term below gets used loosely somewhere on the internet. These are the meanings I use in reports, so there is no ambiguity about what a number refers to.',
    more: { label: 'Expanded, with examples →', href: '/glossary/' },
    terms: [
      {
        anchor: 'geo',
        term: 'Generative engine optimization (GEO)',
        definition:
          'The practice of getting a brand named inside AI-generated answers. Distinct from SEO in that the target is a sentence in a paragraph rather than a position in a list.',
        aside: 'Also called answer engine optimization.',
      },
      {
        anchor: 'aeo',
        term: 'Answer engine optimization (AEO)',
        definition:
          'A synonym for GEO, more common in B2B marketing teams. Where the two are distinguished at all, AEO usually implies the narrower job of formatting content so a machine can lift a direct answer from it.',
      },
      {
        anchor: 'citation-share',
        term: 'Citation share',
        definition:
          'The percentage of prompts in a defined prompt set where a brand is named or linked in the generated answer. This is the primary scoreboard metric, tracked per engine and weighted by the revenue behind each prompt.',
      },
      {
        anchor: 'prompt-set',
        term: 'Prompt set',
        definition:
          'The 150–400 buyer questions a category is scored against every month. Each carries a revenue weight so a gain on a high-value question moves the score more than one on a curiosity.',
      },
    ],
  },
}
