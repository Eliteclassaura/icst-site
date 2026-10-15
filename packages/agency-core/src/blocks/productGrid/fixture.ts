import type { ProductGridProps } from './index'

/** Synthetic product names and copy; no prices, no part numbers, no claims. */
export const fixtures: { default: ProductGridProps } & Record<string, ProductGridProps> = {
  default: {
    eyebrow: 'Parts',
    title: 'Explore our parts',
    lede: 'Synthetic copy: one line about the parts range.',
    items: [
      { title: 'Product one', text: 'Synthetic product summary.', href: '/client-preview/' },
      { title: 'Product two', text: 'Synthetic product summary.', href: '/client-preview/' },
      { title: 'Product three', text: 'Synthetic product summary.', href: '/client-preview/' },
    ],
  },
}
