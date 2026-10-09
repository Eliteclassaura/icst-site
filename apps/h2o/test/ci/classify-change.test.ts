import { describe, expect, it } from 'vitest'
import { classify, MAX_LIGHT_FILES } from '../../ops/ci/classify-change.mjs'

const H = 'apps/h2o/'
const c = (...p: string[]) => (classify(p) as { class: string; reasons: string[] }).class

describe('DEPLOY-PIPE-1 classify-change', () => {
  it('CSS and plain copy (and their tests and docs) are LIGHT', () => {
    expect(c(`${H}src/site/Header.module.css`)).toBe('light')
    expect(c(`${H}src/rfq-native/NativeRfq.module.css`, `${H}src/rfq-native/__tests__/x.test.tsx`)).toBe('light')
    expect(c(`${H}content/rfq/ogcs-native-rfq-copy-r1.tsv`)).toBe('light')
    expect(c(`${H}content/pages/about.md`, `${H}docs/NOTES.md`)).toBe('light')
    expect(c(`${H}src/x/__tests__/only-a-test.test.ts`)).toBe('light')
  })
  it('CRM, migrations, collections, seeds, catalog, site-chrome, config and anything unknown are FULL', () => {
    for (const p of [
      `${H}src/crm/workspace/ui/crm.css`, // even CSS under src/crm
      `${H}src/crm/notify.ts`,
      `${H}src/migrations/20261009_000000_x.ts`,
      `${H}src/migrations/index.ts`,
      `${H}src/payload.config.ts`,
      `${H}src/collections/Pages.ts`,
      `${H}src/globals/site-chrome.ts`,
      `${H}content/catalog/products.tsv`,
      `${H}content/seed/batch.md`,
      `${H}content/release/route-ledger.json`,
      `${H}content/site-chrome/footer.md`,
      `${H}ops/catalog-seed/cli.ts`,
      `${H}Dockerfile.runtime`,
      `${H}package.json`,
      'pnpm-lock.yaml',
      '.github/workflows/h2o-release.yml',
      `${H}src/site/Header.tsx`,
      'something/unknown.bin',
    ])
      expect(c(p), p).toBe('full')
  })
  it('one full path makes the whole change full, and the reason names it', () => {
    const r = classify([`${H}src/site/a.module.css`, `${H}src/crm/x.ts`]) as { class: string; reasons: string[] }
    expect(r.class).toBe('full')
    expect(r.reasons.join()).toContain('src/crm/x.ts')
  })
  it('an empty change fails closed; a very large "light" change is FULL', () => {
    expect(c()).toBe('full')
    const many = Array.from({ length: MAX_LIGHT_FILES + 1 }, (_, i) => `${H}src/site/f${i}.module.css`)
    expect(c(...many)).toBe('full')
    expect(c(...many.slice(0, MAX_LIGHT_FILES))).toBe('light')
  })
  it('a sensitive word in a content path keeps it FULL even when it is a .md/.tsv', () => {
    expect(c(`${H}content/rfq/form-notice-source.md`)).toBe('light') // plain copy (its own tests pin the hash)
    expect(c(`${H}content/catalog-notes.md`)).toBe('full')
    expect(c(`${H}content/x/redirects.tsv`)).toBe('full')
  })
})
