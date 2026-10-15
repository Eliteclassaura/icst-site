import type { ArticleBodyProps } from './index'

/** Synthetic article copy: structure only. The real article text comes from the content import (separate step). */
export const fixtures: { default: ArticleBodyProps } & Record<string, ArticleBodyProps> = {
  default: {
    meta: 'Synthetic date · By the author · Article excerpt',
    sections: [
      {
        heading: 'Section one heading',
        paragraphs: ['Synthetic paragraph for the first section.', 'Second synthetic paragraph for the first section.'],
        bullets: [
          { lead: 'Point one:', text: 'Synthetic supporting detail.' },
          { lead: 'Point two:', text: 'Synthetic supporting detail.' },
        ],
      },
      {
        heading: 'Section two heading',
        paragraphs: ['Synthetic paragraph for the second section.'],
        numbered: [
          { title: 'Factor one', text: 'Synthetic description of the first factor.' },
          { title: 'Factor two', text: 'Synthetic description of the second factor.' },
        ],
      },
      {
        heading: 'How the client can help',
        paragraphs: ['Synthetic paragraph describing how the client can support the reader.'],
        links: [
          { label: 'Related topic one', href: '/topic-one/' },
          { label: 'Related topic two', href: '/topic-two/' },
        ],
      },
    ],
    sourceNote: 'Synthetic source note.',
    readMore: { label: 'Read the full article', href: '/client-preview/article/' },
  },
}
