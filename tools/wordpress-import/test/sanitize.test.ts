import { describe, it, expect } from 'vitest'
import { stripEmails, tableAllowed, authorLabel, FORBIDDEN_COLUMNS } from '../src/sanitize'

describe('stripEmails (ADR-028 §10)', () => {
  it('turns mailto links into contact-form links and reports masked removals', () => {
    const r = stripEmails(
      '<p>Write to <a href="mailto:sales@old.example.test?subject=hi">sales@old.example.test</a> today.</p>',
    )
    expect(r.html).toBe('<p>Write to <a href="/#contact">Contact us</a> today.</p>')
    expect(r.removed).toEqual([
      { kind: 'mailto', original: 's***@old.example.test', replacement: '/#contact' },
    ])
    expect(r.html).not.toMatch(/@/)
  })
  it('replaces bare addresses and keeps link text that is not an address', () => {
    const r = stripEmails(
      'Reach the team at ops@old.example.test or <a href="mailto:x@y.test">the sales desk</a>.',
    )
    expect(r.html).toBe(
      'Reach the team at <a href="/#contact">contact form</a> or <a href="/#contact">the sales desk</a>.',
    )
    expect(r.removed.map((x) => x.kind)).toEqual(['mailto', 'text'])
  })
})

describe('table and column guards', () => {
  it('allows content tables and refuses users, comments and WooCommerce customers', () => {
    expect(tableAllowed('wp_posts')).toBe(true)
    expect(tableAllowed('wp_users')).toBe(false)
    expect(tableAllowed('wp_comments')).toBe(false)
    expect(tableAllowed('wp_wc_customer_lookup')).toBe(false)
    expect(FORBIDDEN_COLUMNS.has('user_email')).toBe(true)
  })
  it('author attribution never uses login or email', () => {
    expect(authorLabel({ display_name: 'Editorial', user_nicename: 'ed' })).toBe('Editorial')
    expect(authorLabel({})).toBe('Editorial team')
  })
})
