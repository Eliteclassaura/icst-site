import type { StepsProps } from './index'

export const fixtures: { default: StepsProps } & Record<string, StepsProps> = {
  default: {
    eyebrow: 'Method',
    title: '{{count}} moves, in order.',
    lede: 'Every engagement runs the same sequence. The AI work is not a content shortcut — it is how we read the customer data fast enough to know which of these five actually holds the revenue.',
    ordered: true,
    howTo: true,
    items: [
      {
        title: 'Read the revenue data with a model',
        text: 'Support tickets, reviews, won and lost CRM notes, order intervals — clustered by a language model into the questions customers actually ask, weighted by revenue.',
      },
      {
        title: 'Build the prompt set',
        text: 'Not keywords — the 150–400 real questions your buyer types into an assistant, weighted by the revenue behind each and scored monthly across four engines.',
      },
      {
        title: 'Fix the entity, then the pages',
        text: 'One name, one category, one claim everywhere. Then answers written to be extractable: the direct answer first, then the evidence.',
      },
      {
        title: 'Earn corroboration',
        text: 'Models trust consensus, and they pull heavily from pages ranking well below your own. Get named in the listings, roundups and comparisons they read.',
      },
      {
        title: 'Convert it with email',
        text: 'AI search traffic is high-intent and low-volume. Lifecycle and outbound sequences are what turn it into cash flow.',
      },
    ],
  },
  warnings: {
    eyebrow: 'Red flags',
    title: '{{count}} things that should worry you in a GEO quote.',
    ordered: false,
    layout: 'stack',
    items: [
      {
        title: 'A guaranteed position or citation',
        text: 'Nobody controls what an assistant says. A guarantee means the measurement is being chosen to be met.',
      },
      {
        title: 'Reporting on mentions rather than revenue',
        text: 'A mention that produces no buyer is a vanity metric with a monthly invoice.',
      },
      {
        title: 'A keyword list where a prompt set should be',
        text: 'Assistants answer questions; a keyword list measures the wrong game.',
      },
    ],
  },
}
