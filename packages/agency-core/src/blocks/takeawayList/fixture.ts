import type { TakeawayListProps } from './index'

export const fixtures: { default: TakeawayListProps } & Record<string, TakeawayListProps> = {
  default: {
    label: 'The short version',
    items: [
      {
        lead: 'Position one is no longer the finish line.',
        text: 'Around 90% of ChatGPT’s search citations point at pages ranking 21 or lower, so a page-one strategy misses most of the retrieval pool.',
      },
      {
        lead: 'The unit of visibility changed from a link to a sentence.',
        text: 'Ten blue links became two or three named sources inside one paragraph, and there is no slot four.',
      },
      {
        lead: 'Entity consistency beats content volume.',
        text: 'Models hedge while your site, your schema and your third-party profiles disagree about what you are; fixing that is the fastest movement available.',
      },
      {
        lead: 'Corroboration is the ranking factor of AI search.',
        text: 'Being described the same way on review sites, roundups and comparison pages is what turns a claim into a retrievable fact.',
      },
      {
        lead: 'Being cited is not the same as being recommended.',
        text: 'In one 2026 study 43% of the answers that cited a page never named that page’s brand — the model used the source and recommended a competitor out of it.',
      },
      {
        lead: 'Traffic from assistants is small and expensive to waste.',
        text: 'It converts at roughly 4.4× the value of ordinary organic, which is why email sits inside the program rather than beside it.',
      },
      {
        lead: 'The scoreboard is a prompt set, not a keyword list.',
        text: '150–400 buyer questions, weighted by the revenue behind each, scored monthly against four engines.',
      },
    ],
  },
}
