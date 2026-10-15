import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountDomainLinks, accountDomainHref } from '../../app/(crm)/crm/accounts/[id]/AccountDomainLinks'

describe('account website domains', () => {
  it('links each public domain separately while preserving labels and excluding retired domains', () => {
    const html = renderToStaticMarkup(
      <AccountDomainLinks
        domains={[
          { domain: 'Example.com', domain_status: 'VERIFIED_OWNER' },
          { domain: 'www.Second.com', domain_status: 'CANDIDATE' },
          { domain: 'retired.com', domain_status: 'RETIRED' },
        ]}
      />,
    )
    expect(html).toContain('href="https://example.com/"')
    expect(html).toContain('href="https://www.second.com/"')
    expect(html).toContain('Example.com</a> (verified), ')
    expect(html).toContain('www.Second.com</a> (unverified)')
    expect(html).not.toContain('retired.com')
    expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2)
    expect(html.match(/opens in a new tab/g)).toHaveLength(2)
  })

  it('normalizes bare and www hosts to HTTPS and refuses unsafe or malformed destinations', () => {
    expect(accountDomainHref('Example.com')).toBe('https://example.com/')
    expect(accountDomainHref('WWW.Example.com')).toBe('https://www.example.com/')
    expect(accountDomainHref('https://example.com')).toBe('https://example.com/')
    for (const value of [
      'javascript:alert(1)', 'http://example.com', 'ftp://example.com',
      'https://user@example.com', 'example.com/path', 'example.com:8443',
      'example.com?next=evil', 'example.com#x', 'localhost', 'example.local', 'host.alt',
      '127.0.0.1', '-bad.com', 'bad-.com', 'example..com', 'example.com\\@evil.com',
      `${Array(40).fill('ä').join('.')}.com`,
    ]) expect(accountDomainHref(value)).toBeNull()
  })

  it('keeps invalid values as text and preserves the empty state', () => {
    const longIdn = `${Array(40).fill('ä').join('.')}.com`
    const html = renderToStaticMarkup(<AccountDomainLinks domains={[
      { domain: 'javascript:alert(1)', domain_status: 'CANDIDATE' },
      { domain: 'host.alt', domain_status: 'CANDIDATE' },
      { domain: longIdn, domain_status: 'CANDIDATE' },
    ]} />)
    expect(html).toContain('javascript:alert(1) (unverified)')
    expect(html).toContain('host.alt (unverified)')
    expect(html).toContain(`${longIdn} (unverified)`)
    expect(html).not.toContain('<a ')
    expect(renderToStaticMarkup(<AccountDomainLinks domains={[]} />)).toBe('<span class="c-unknown">None recorded</span>')
    expect(renderToStaticMarkup(<AccountDomainLinks domains={[{ domain: 'old.com', domain_status: 'RETIRED' }]} />)).toBe('<span class="c-unknown">None recorded</span>')
  })
})
