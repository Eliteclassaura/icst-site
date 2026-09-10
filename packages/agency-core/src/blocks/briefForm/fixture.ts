import type { BriefFormProps } from './index'

export const fixtures: { default: BriefFormProps } & Record<string, BriefFormProps> = {
  default: {
    eyebrow: 'Contact',
    title: 'Tell me what is not working.',
    lede: 'Only a few engagements run at a time. The more specific you are about the gap, the faster I can tell you whether I am the right person for it — or point you at who is.',
    action: '/api/forms/brief',
    selects: [
      {
        name: 'revenue',
        label: 'Monthly revenue',
        options: ['Under $50K', '$50K – $250K', '$250K – $1M', '$1M+', 'Prefer not to say'],
        defaultValue: '$50K – $250K',
      },
      {
        name: 'budget',
        label: 'Monthly budget',
        options: ['Under $5,000', '$5,000 – $10,000', '$10,000 – $25,000', '$25,000+', 'Not sure yet'],
        defaultValue: '$5,000 – $10,000',
      },
      {
        name: 'timeline',
        label: 'Timeline',
        options: ['Starting now', 'Next 30 days', 'This quarter', 'Just researching'],
        defaultValue: 'Next 30 days',
      },
      {
        name: 'focus',
        label: 'Primary focus',
        options: [
          'AI search visibility / GEO',
          'Traditional SEO',
          'Cold email / outbound',
          'Lifecycle email',
          'Not sure — diagnose it',
        ],
      },
    ],
    briefPlaceholder: 'We rank top-3 for our category but ChatGPT recommends two competitors and never us.',
    optIn: {
      name: 'want_plan',
      label: 'Send me the automated read of my site too.',
      text: 'I check your homepage, robots.txt and llms.txt, then email a ranked fix list and a ninety-day sequence.',
      defaultChecked: false,
    },
    submitLabel: 'Send the brief',
  },
  submitted: {
    eyebrow: 'Contact',
    title: 'Tell me what is not working.',
    action: '/api/forms/brief',
    selects: [
      { name: 'focus', label: 'Primary focus', options: ['AI search visibility / GEO', 'Traditional SEO'] },
    ],
    submitLabel: 'Send the brief',
    status: { kind: 'ok', message: 'Sent. I reply within one working day.' },
  },
}
