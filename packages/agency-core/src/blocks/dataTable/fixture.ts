import type { DataTableProps } from './index'

export const fixtures: { default: DataTableProps } & Record<string, DataTableProps> = {
  default: {
    eyebrow: 'Side by side',
    title: 'GEO vs SEO: what actually changes.',
    lede: 'Same website, two different games. This is the comparison I draw on a whiteboard in the first call, so it may as well be on the page.',
    caption:
      'Generative engine optimization compared with search engine optimization across the {{count}} decisions that differ in practice.',
    rowHeader: 'Dimension',
    columns: ['SEO', 'GEO / AEO', 'Why it differs'],
    variant: 'compare',
    rows: [
      {
        label: 'What you win',
        cells: [
          'A slot in a list of ten links',
          'A named mention inside one generated paragraph',
          'There is no slot four in an answer.',
        ],
      },
      {
        label: 'Unit of measurement',
        cells: [
          'Keyword ranking position',
          'Citation share across a prompt set',
          'Answers vary per user; a single rank has no meaning.',
        ],
      },
      {
        label: 'Where the source sits',
        cells: [
          'Positions 1–10',
          '~90% of ChatGPT citations come from 21+',
          'Retrieval samples far deeper than a results page.',
        ],
      },
      {
        label: 'Time to signal',
        cells: [
          '3–6 months for competitive terms',
          '6–10 weeks for entity fixes, a quarter for share',
          'Entity corrections propagate faster than links.',
        ],
      },
    ],
  },
  price: {
    caption:
      'What generative engine optimization costs at {{brand.siteName}}, and what is included at each level. Published rates, not a “request a quote” form.',
    rowHeader: '',
    columns: ['Visibility Audit', 'Answer Engine Program', 'Owned Channel Build'],
    variant: 'price',
    rows: [
      { label: 'Price', cells: ['$4,500 one-off', '$9,800/month', '$6,400/month'] },
      { label: 'Commitment', cells: ['3 weeks, fixed scope', '6 months minimum', '3 months minimum'] },
      {
        label: 'Best for',
        cells: [
          'Deciding whether GEO is worth it',
          'Being named in the answer',
          'Turning attention into cash flow',
        ],
      },
    ],
    footnote:
      'Prices are owner-verified facts in the content ledger; the table is data, never typed into copy.',
  },
}
