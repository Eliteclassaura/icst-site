/**
 * BYLINE-GAP-1 (DD 2026-10-09, CT): in the locale (and other body-article) layout the first paragraph sat directly under the byline row.
 * The body-article byline now has 24px below it, 24px of padding and a hairline, like the English article header. The English
 * masthead byline rule is unchanged.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.join(process.cwd(), 'src/app/(site)/public-chrome-article.css'), 'utf8')
describe('BYLINE-GAP-1', () => {
  it('the body-article byline has a 24px gap, 24px padding and a hairline below it', () => {
    const rule = /\.figma-wave4 \.wave4-detail-body \.wave4-byline\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/margin-block-end:\s*24px/)
    expect(rule).toMatch(/padding-block-end:\s*24px/)
    expect(rule).toMatch(/border-block-end:\s*1px solid rgb\(/)
  })
  it('the shared byline rule (English masthead) is unchanged: no margin, padding or border added', () => {
    const rule = /\.figma-wave4 \.wave4-byline\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toContain('margin:0;')
    expect(rule).not.toMatch(/padding|border/)
  })
})
