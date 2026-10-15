import type { ChipNavProps } from './index'

/** Synthetic category names; the parts categories come from the content record in the page. */
export const fixtures: { default: ChipNavProps } & Record<string, ChipNavProps> = {
  default: {
    label: 'Parts categories',
    links: [
      { label: 'Category one', href: '/client-preview/' },
      { label: 'Category two', href: '/client-preview/parts/' },
      { label: 'Category three', href: '/client-preview/parts/three/' },
    ],
    currentPath: '/client-preview/parts/',
  },
}
