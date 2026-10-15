// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountDomainLinks } from '../../app/(crm)/crm/accounts/[id]/AccountDomainLinks'

/**
 * 1.3b-A11Y-DOMAIN-LINK: an account's domain link sits in a sentence-like run ("a.com (verified), b.com (unverified)") and was
 * told apart from its text by colour alone (axe link-in-text-block, WCAG 1.4.1). The CRM stylesheet already has one rule for
 * "a link inside a sentence is underlined"; the new-tab link inside a details cell joins that rule's selector list.
 */
const css = readFileSync(path.join(process.cwd(), 'src/crm/workspace/ui/crm.css'), 'utf8')
const SELECTOR = ".crm-app .c-dl dd a[target='_blank']"
/** The `{ … }` body of the rule whose selector list contains `selector`. */
const ruleOf = (selector: string): string => {
  const at = css.indexOf(selector)
  expect(at, `${selector} is in crm.css`).toBeGreaterThan(-1)
  const open = css.indexOf('{', at)
  return css.slice(open + 1, css.indexOf('}', open))
}

describe('the account domain link is underlined', () => {
  it('the selector is in the shared "link inside a sentence" rule, which underlines', () => {
    expect(css.split(SELECTOR).length - 1).toBe(1) // once, no duplicate rule
    expect(ruleOf(SELECTOR)).toMatch(/text-decoration:\s*underline/)
    // it is one of that rule's own selectors, not a new rule elsewhere
    expect(css).toContain(`.crm-app .c-crumbs a,\n${SELECTOR},\n.crm-app .c-panel-body li > a {`)
  })

  it('the selector matches the links the component renders, and only those', () => {
    const html = renderToStaticMarkup(
      <dl className="c-dl">
        <dt>Domains</dt>
        <dd>
          <AccountDomainLinks domains={[
            { domain: 'valid-among-odd.com', domain_status: 'VERIFIED_OWNED' },
            { domain: 'second.co.th', domain_status: 'CANDIDATE' },
            { domain: 'javascript:alert(1)', domain_status: 'CANDIDATE' },
            { domain: 'intranet.local', domain_status: 'CANDIDATE' },
          ]} />
        </dd>
        <dt>Owner</dt>
        <dd><a href="/crm/accounts/1/">An internal link</a></dd>
      </dl>,
    )
    document.body.innerHTML = html
    const hit = [...document.querySelectorAll(".c-dl dd a[target='_blank']")].map((a) => a.textContent)
    expect(hit).toEqual(['valid-among-odd.com', 'second.co.th']) // both safe domains; not the text-only values, not the internal link
    for (const a of document.querySelectorAll(".c-dl dd a[target='_blank']")) expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
