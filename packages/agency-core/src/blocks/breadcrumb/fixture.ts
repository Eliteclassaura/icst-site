import type { BreadcrumbProps } from './index'

export const fixtures: { default: BreadcrumbProps } & Record<string, BreadcrumbProps> = {
  default: { trail: [{ label: '{{brand.siteName}}', href: '/' }], current: 'What GEO costs' },
}
