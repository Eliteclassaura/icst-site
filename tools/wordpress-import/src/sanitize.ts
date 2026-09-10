/**
 * Boundary-safe primitives the importer relies on (ADR-028 §8, §10). These land before the SQL pipeline
 * because they encode binding rules: no email address reaches a page, and no PII table is ever read.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** Tables the importer may read. Anything else — users' emails, comments, WooCommerce customers/orders — is refused. */
export const ALLOWED_TABLES = new Set([
  'posts',
  'postmeta',
  'terms',
  'term_taxonomy',
  'term_relationships',
  'options',
  'redirection_items',
  'redirection_groups',
  'yoast_indexable',
])
/** Columns never read even from allowed tables. */
export const FORBIDDEN_COLUMNS = new Set([
  'user_pass',
  'user_email',
  'user_activation_key',
  'comment_author_email',
  'comment_author_IP',
])
/** `wp_options.option_name` patterns listed by name only, never by value. */
export const SECRET_OPTION_PATTERNS = [
  /smtp/i,
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /licen[cs]e/i,
  /recaptcha/i,
  /stripe|paypal|woocommerce_.*_settings/i,
]

export function tableAllowed(name: string, prefix = 'wp_'): boolean {
  const bare = name.startsWith(prefix) ? name.slice(prefix.length) : name
  return ALLOWED_TABLES.has(bare)
}

export type EmailStrip = {
  html: string
  removed: Array<{ kind: 'mailto' | 'text'; original: string; replacement: string }>
}

/**
 * Removes every email address from imported content: `mailto:` links become links to the contact form,
 * bare addresses become the form link text. Each removal is returned for the review queue.
 * The original address is kept only in the in-memory report (masked), never written to the blueprint.
 */
export function stripEmails(html: string, contactPath = '/#contact'): EmailStrip {
  const removed: EmailStrip['removed'] = []
  const mask = (e: string) => e.replace(/^(.)[^@]*/, '$1***')
  let out = html.replace(
    /<a\b([^>]*?)href=(["'])mailto:([^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi,
    (_m, pre, _q, addr, post, inner) => {
      const address = String(addr).split('?')[0] ?? ''
      removed.push({ kind: 'mailto', original: mask(address), replacement: contactPath })
      const text = EMAIL.test(inner) ? 'Contact us' : inner
      EMAIL.lastIndex = 0
      return `<a${pre}href="${contactPath}"${post}>${text}</a>`
    },
  )
  out = out.replace(EMAIL, (e) => {
    removed.push({
      kind: 'text',
      original: mask(e),
      replacement: `<a href="${contactPath}">contact form</a>`,
    })
    return `<a href="${contactPath}">contact form</a>`
  })
  return { html: out, removed }
}

/** Author attribution uses display name only (never login or email). */
export function authorLabel(row: { display_name?: string | null; user_nicename?: string | null }): string {
  return (row.display_name || row.user_nicename || 'Editorial team').trim()
}
