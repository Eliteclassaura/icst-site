import type { ServiceBandProps } from './index'

/** Synthetic copy: section and card wording to be replaced by the client's content pack. No claims. */
export const fixtures: { default: ServiceBandProps } & Record<string, ServiceBandProps> = {
  default: {
    eyebrow: 'What we do',
    title: 'Three services, one team',
    lede: 'Short description of the service area, written from the client content pack.',
    items: [
      { title: 'Service one', text: 'Short description of the first service.', href: '/service-one/', label: 'View service' },
      { title: 'Service two', text: 'Short description of the second service.', href: '/service-two/', label: 'View service' },
      { title: 'Service three', text: 'Short description of the third service.' },
    ],
  },
}
