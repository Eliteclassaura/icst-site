import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EmailTypoHint } from '../EmailTypoHint'
import { suggestEmail } from '../emailHint'
import { fixtureRegistry } from '../registry'

describe('RFQ-EMAIL-CHECK-1 "Did you mean …?"', () => {
  it('suggests the provider for the usual typos', () => {
    for (const [typed, want] of [
      ['ana@gmial.com', 'ana@gmail.com'],
      ['ana@gmai.com', 'ana@gmail.com'],
      ['ana@gmail.co', 'ana@gmail.com'],
      ['ana@gmail.con', 'ana@gmail.com'],
      ['ana@yaho.com', 'ana@yahoo.com'],
      ['ana@yahooo.com', 'ana@yahoo.com'],
      ['ana@hotmial.com', 'ana@hotmail.com'],
      ['ana@hotmail.con', 'ana@hotmail.com'],
      ['ana@outlok.com', 'ana@outlook.com'],
      ['ana@outlook.cm', 'ana@outlook.com'],
      ['Ana.R+rfq@GMIAL.com', 'Ana.R+rfq@gmail.com'],
    ] as const)
      expect(suggestEmail(typed), typed).toBe(want)
  })
  it('stays quiet for correct and unrelated addresses', () => {
    for (const ok of ['ana@gmail.com', 'ana@yahoo.co.jp', 'ana@icloud.com', 'ana@company.com', 'ana@mail.com', 'ana@gmx.com', 'ana@live.com', 'ana@outlook.jp', 'ana', 'ana@', '@gmail.com', 'ana@gmial', 'a b@gmial.com'])
      expect(suggestEmail(ok), ok).toBeNull()
  })
  it('renders the hint with a "Use ana@gmail.com" button, and never changes the value by itself', () => {
    const reg = fixtureRegistry()
    const onUse = vi.fn()
    const html = renderToStaticMarkup(<EmailTypoHint reg={reg} value="ana@gmial.com" onUse={onUse} />)
    expect(html).toContain('Did you mean ana@gmail.com?')
    expect(html).toContain('<button type="button"')
    expect(html).toContain('Use ana@gmail.com</button>')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('role="alert"')
    expect(onUse).not.toHaveBeenCalled()
    expect(renderToStaticMarkup(<EmailTypoHint reg={reg} value="ana@gmail.com" onUse={onUse} />)).toBe('')
  })
})
