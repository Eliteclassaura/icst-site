import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The dev badge must not appear in review screenshots; the setting is dev-only, so the production build is unchanged.
describe('next.config.ts dev indicators', () => {
  const source = readFileSync(path.join(__dirname, '..', '..', '..', 'next.config.ts'), 'utf8')
  it('turns the dev indicators off', () => {
    expect(source).toMatch(/devIndicators:\s*false/)
  })
  it('keeps the production output settings', () => {
    expect(source).toMatch(/output:\s*'standalone'/)
    expect(source).toMatch(/trailingSlash:\s*true/)
  })
})
