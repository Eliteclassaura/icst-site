import type { PhoneCtaProps } from './index'

/** Synthetic copy; the number is supplied by the render context in tests and by the client manifest in the page. */
export const fixtures: { default: PhoneCtaProps } & Record<string, PhoneCtaProps> = {
  default: {
    eyebrow: 'Call us',
    title: 'Speak to an engineer',
    text: 'Synthetic supporting line for the phone call-to-action.',
  },
}
