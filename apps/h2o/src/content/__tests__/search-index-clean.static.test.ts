import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** SEARCH-CLEAN-1: the index builder cleans the title, the SEO title and the body before Pagefind sees them. */
describe('search index input is cleaned', () => {
  it('the builder passes the title, the SEO title and the body through cleanSearchText', () => {
    const src = readFileSync(path.join(__dirname, '..', 'search-index.ts'), 'utf8')
    expect(src).toContain("import { cleanSearchText } from './search-clean'")
    expect(src).toMatch(/const seoTitle = cleanSearchText\(/)
    expect(src).toMatch(/const title = cleanSearchText\(/)
    expect(src).toMatch(/const content = cleanSearchText\(publicBodyText\(/)
    expect(src).toContain('addCustomRecord({ url: row.path, content: `${title}\\n${seoTitle}\\n${content}`')
  })
})
