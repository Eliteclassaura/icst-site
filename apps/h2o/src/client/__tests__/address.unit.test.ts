import { describe, expect, it } from 'vitest'
import { addressLines } from '../site/address'
import manifest from '../../../../../clients/icst/manifest.json'

describe('office address lines (footer)', () => {
  it('adds city with postcode and the country name to the street lines', () => {
    expect(addressLines({ country: 'TH', address: { lines: ['A', 'B'], city: 'Bangkok', postalCode: '10110' } })).toEqual(['A', 'B', 'Bangkok 10110', 'Thailand'])
  })
  it('skips an empty postcode', () => {
    expect(addressLines({ country: 'TH', address: { lines: ['A'], city: 'Bangkok', postalCode: '' } })).toEqual(['A', 'Bangkok', 'Thailand'])
  })
  it('the ICST public office renders the full address', () => {
    const lines = addressLines(manifest.offices[0] as never)
    expect(lines.slice(-2)).toEqual(['Bangkok 10110', 'Thailand'])
    expect(lines).toContain('North Klongtoey, Wattana')
  })
})
