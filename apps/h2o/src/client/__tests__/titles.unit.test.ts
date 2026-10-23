import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Title rules for the ICST client (CT-1 ruling, 23 Oct): the page title is the final title and carries the brand once. The code appends
 * nothing (a second suffix would double it), and the old "ICS" brand never appears (the other company's name). Titles are content and
 * are not edited here; this test only fails on a bare " - ICS", a bare "ICS" token, or a doubled brand.
 */
const pagesDir = path.resolve(__dirname, '..', '..', '..', '..', '..', 'clients', 'icst', 'content', 'pages')

describe('ICST titles', () => {
  const pages = readdirSync(pagesDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  it.each(pages)('%s: no " - ICS" or bare ICS, and the brand appears at most once', (file) => {
    const title = (JSON.parse(readFileSync(path.join(pagesDir, file), 'utf8')) as { title?: string }).title ?? ''
    expect(title, file).not.toMatch(/ - ICS(?!T)/)
    expect(title, file).not.toMatch(/\bICS\b/)
    expect((title.match(/ICST/g) ?? []).length, file).toBeLessThanOrEqual(1)
  })

  it('the page builder passes the page title through unchanged (no second suffix is appended in code)', () => {
    const src = readFileSync(path.resolve(__dirname, '..', '..', 'app', '(client)', '[[...path]]', 'page.tsx'), 'utf8')
    expect(src).toMatch(/const title = found\.page\.title/)
    expect(src).not.toMatch(/title[^\n]*\+\s*['"` ]\s*-\s*ICS/)
    expect(src).not.toMatch(/brandName\('site'\)\s*\}\s*\|/)
  })
})
