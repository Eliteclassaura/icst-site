/**
 * IMPORT-TYPEFORM-1 / 1.1: the one rule for a customer's uploaded-file link (Typeform), used at import, at
 * validation (crm-historical-inquiries beforeValidate) and again at render time (defence in depth, Auditor 1.1).
 * https on the Typeform file host only: no other host, no user info, no port, at most 500 characters. Never fetched.
 */
export const TYPEFORM_UPLOAD_HOSTS = ['api.typeform.com'] as const

export function safeUploadUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v || v.length > 500) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null
    return (TYPEFORM_UPLOAD_HOSTS as readonly string[]).includes(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}

/** How the contact page shows a stored upload link: a link only if it still passes the rule, otherwise plain text. */
export type UploadLinkView = { kind: 'link'; href: string } | { kind: 'text'; text: string } | null
export function uploadLinkView(stored: string | null | undefined): UploadLinkView {
  const v = (stored ?? '').trim()
  if (!v) return null
  const href = safeUploadUrl(v)
  return href ? { kind: 'link', href } : { kind: 'text', text: v.slice(0, 500) }
}

/** The hint shown next to the link (Auditor IMPORT-TYPEFORM-1.1). */
export const UPLOAD_LINK_HINT = 'Typeform; may need a sign-in or have expired. Uploaded by the sender; not scanned. Open it in a safe viewer.'
