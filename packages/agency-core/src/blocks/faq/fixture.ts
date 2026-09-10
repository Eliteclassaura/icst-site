import type { FaqProps } from './index'

export const fixtures: { default: FaqProps } & Record<string, FaqProps> = {
  default: {
    eyebrow: 'Questions',
    title: 'What people ask before they hire me.',
    lede: 'Answer first, reasoning second — the same format I write client pages in, for the same reason.',
    items: [
      {
        question: 'What is generative engine optimization (GEO)?',
        answer:
          'GEO is the practice of getting a brand named inside AI-generated answers, such as those from ChatGPT, Perplexity, Google AI Overviews and Copilot. It works by making a clear, corroborated, machine-parsable claim about what a business is and what it is for.',
      },
      {
        question: 'How is GEO different from SEO?',
        answer:
          'Search engine optimization competes for a slot in a list of ten results; GEO competes to be one of two or three sources named in a single paragraph. The practical difference is where the work goes: GEO weights entity consistency, answer-first pages and third-party corroboration.',
      },
      {
        question: 'How long does it take to get cited by ChatGPT?',
        answer:
          'First movement usually shows in six to ten weeks, and a meaningful change in citation share takes a full quarter. The fastest wins come from fixing entity inconsistency — one name, one category, one claim across your site, schema and third-party profiles.',
      },
      {
        question: 'What does GEO cost?',
        answer:
          'Engagements are priced by scope and published on the pricing page, so the first conversation is about the gap, not the rate card.',
      },
    ],
  },
}
