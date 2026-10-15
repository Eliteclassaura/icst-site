import { Fragment } from 'react'
import { normalizeDomain } from '../../../../../crm/normalize'

type Domain = { id?: unknown; domain?: unknown; domain_status?: unknown }

const NON_PUBLIC_SUFFIXES = new Set(['alt', 'arpa', 'corp', 'example', 'home', 'internal', 'invalid', 'lan', 'local', 'localhost', 'onion', 'test'])

/** A recorded domain is display data first; only a plain public hostname may become an external link. */
export function accountDomainHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  const host = value.startsWith('https://') ? value.slice('https://'.length) : value
  if (!host || /[\s\\/?#@]/u.test(host) || [...host].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return null
  const domain = normalizeDomain(host)
  if (!domain || domain.length > 253) return null
  const labels = domain.split('.')
  const suffix = labels.at(-1)!
  if (NON_PUBLIC_SUFFIXES.has(suffix) || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(suffix)) return null
  if (labels.some((label) => label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return null
  try {
    const url = new URL(`https://${domain}/`)
    return url.protocol === 'https:' && url.hostname === domain && !url.username && !url.password && !url.port ? url.href : null
  } catch {
    return null
  }
}

export function AccountDomainLinks({ domains }: { domains: Domain[] | null | undefined }) {
  const active = (domains ?? []).filter((d) => d.domain_status !== 'RETIRED')
  if (active.length === 0) return <span className="c-unknown">None recorded</span>
  return active.map((d, index) => {
    const display = String(d.domain)
    const href = accountDomainHref(d.domain)
    const status = String(d.domain_status).startsWith('VERIFIED') ? ' (verified)' : ' (unverified)'
    return (
      <Fragment key={d.id == null ? `${display}-${index}` : String(d.id)}>
        {index > 0 ? ', ' : null}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${display} website (opens in a new tab)`}>
            {display}
          </a>
        ) : (
          display
        )}
        {status}
      </Fragment>
    )
  })
}
