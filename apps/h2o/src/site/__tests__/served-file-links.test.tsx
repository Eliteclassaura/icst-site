/**
 * File links keep their canonical served path (CT follow-up from Commander's Round 1 hosted checks, R5.2): a link that already
 * names a file this site serves (a held public file, public-files.ts) renders that path, not the hashed media alias of the
 * same bytes. Links without a held file are unchanged (alias), and foreign hosts or query strings are never treated as ours.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderSalmonNode, servedFilePath } from '../SalmonCanonical'
import { salmonDocument, salmonRoutes, type SalmonNode } from '../salmon'

// any imported page: the link resolves against its source host
const doc = salmonDocument(salmonRoutes()[0]!)
const link = (href: string) => renderToStaticMarkup(<>{renderSalmonNode({ tag: 'a', attrs: { href }, children: ['Manual'] } as SalmonNode, 't', doc)}</>)

describe('file links to held public files', () => {
  it('the ruled Dynafab manual path is kept as written (it is a held public file)', () => {
    expect(link('/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf')).toContain('href="/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf"')
    expect(link('https://h2ocooling.com/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf')).toContain('href="/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf"')
    expect(link('/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf')).not.toContain('/media/salmon/')
  })
  it('only own hosts, no query string, and only files that exist', () => {
    expect(servedFilePath('/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf', doc.sourceUrl)).toBe('/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf')
    expect(servedFilePath('https://example.com/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf', doc.sourceUrl)).toBeUndefined()
    expect(servedFilePath('/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf?x=1', doc.sourceUrl)).toBeUndefined()
    expect(servedFilePath('/wp-content/uploads/2099/01/missing.pdf', doc.sourceUrl)).toBeUndefined()
  })
  it('a held media file without a public path still renders its media alias', () => {
    expect(link('https://salmon-rhinoceros-754457.hostingersite.com/wp-content/uploads/2026/07/Dynafab_FanStacks.jpg')).toContain('href="/media/salmon/623405a352c25f61b42ee439cf9d0873cdfb02b9e0d1e81928712d036374319b.jpg"')
  })
})
