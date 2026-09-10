import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { maskEmail } from '@factory/agency-core/intake'
import { SiteFrame } from '../../../lib/site'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: { absolute: 'Thanks — your brief is in' },
  robots: { index: false, follow: false },
}

const ERRORS: Record<string, string> = {
  'too-fast': 'That was quick — please go back and take a moment before sending.',
  'email-disposable': 'Please use a work or personal address we can reply to.',
  'email-typo': 'Please check the spelling of your email address and send again.',
  'ip-requests': 'Too many attempts from your connection. Please try again in an hour.',
  'ip-sends': 'Too many briefs from your connection. Please try again in an hour.',
  'global-sends': 'The form is busy right now. Please try again later.',
}

/**
 * No-JS confirmation (C6, ADR-028 §10): never indexed, never cached, and the visitor's own address is
 * shown masked so a shared screenshot or a proxy cache cannot expose it. Looks up the submission by its
 * id only to greet the sender; the id is a UUID that was just issued to this browser.
 */
export default async function Thanks({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; e?: string }>
}) {
  const { s, e } = await searchParams
  ;(await headers()).get('x-nonce') // touch headers so the route stays dynamic under the CSP
  let masked: string | null = null
  let first = ''
  if (s && /^[0-9a-f-]{36}$/i.test(s)) {
    const payload = await getPayload({ config })
    const sub = await payload
      .findByID({ collection: 'submissions', id: s, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (sub) {
      masked = maskEmail(sub.email)
      first = (sub.name ?? '').split(/\s+/)[0] ?? ''
    }
  }
  const error = e ? (ERRORS[e] ?? 'Something went wrong. Please go back and try again.') : null
  return (
    <SiteFrame currentPath="/thanks/">
      <div className="ds-container" style={{ paddingBlock: 'var(--s-8)' }}>
        <div className="ds-stack" data-gap="4" style={{ maxInlineSize: 'var(--measure)' }}>
          {error ? (
            <>
              <p className="t-cap">Not sent</p>
              <h1 className="t-d2">Your brief did not go through.</h1>
              <p className="t-lead">{error}</p>
              <p>
                <a className="ds-link" href="/#contact">
                  Back to the form
                </a>
              </p>
            </>
          ) : (
            <>
              <p className="t-cap">Received</p>
              <h1 className="t-d2">Thanks{first ? `, ${first}` : ''} — your brief is in.</h1>
              <p className="t-lead">
                A reply comes from a real person within two working days
                {masked ? (
                  <>
                    {' '}
                    to <span style={{ fontVariantNumeric: 'tabular-nums' }}>{masked}</span>
                  </>
                ) : null}
                .
              </p>
              <p>
                <a className="ds-link" href="/">
                  Back to the site
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </SiteFrame>
  )
}
