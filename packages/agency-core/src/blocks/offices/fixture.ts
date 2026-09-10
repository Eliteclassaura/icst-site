import type { OfficesProps } from './index'
import { brandList } from '../fixtures/brand'

// Office rows are client identity (ADR-026 §3): injected at render time, never held here.
export const fixtures: { default: OfficesProps } & Record<string, OfficesProps> = {
  default: {
    eyebrow: 'Offices',
    title: '{{count}} time zones, one program.',
    offices: [brandList<{ city: string; region: string; hours: string }>('offices')],
  },
}
