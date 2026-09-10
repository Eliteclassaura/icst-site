import type { CtaProps } from './index'
import { placeholderImage } from '../fixtures/placeholder'

export const fixtures: { default: CtaProps } & Record<string, CtaProps> = {
  default: {
    eyebrow: 'Next step',
    title: 'Before any call, a free twenty-prompt read.',
    text: 'I check your visibility on twenty prompts from your category and send you what I find, with the revenue behind each one. You leave with the fix list whether or not you hire me.',
    cta: {
      primary: { label: 'Start a project', href: '#contact' },
      secondary: { label: 'Email me a roadmap', href: '#contact' },
    },
    image: placeholderImage({ width: 1600, height: 612, alt: '', label: 'cta 1600×612', decorative: true }),
  },
  textOnly: {
    title: 'Tell me what is not working.',
    text: 'Only a few engagements run at a time. The more specific you are about the gap, the faster I can tell you whether I am the right person for it.',
    cta: { primary: { label: 'Send a brief', href: '#contact' } },
  },
}
