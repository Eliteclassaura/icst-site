import type { Metadata } from 'next'
import { SiteFrame } from '../../lib/site'

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: true } }

/** Real 404 status (Next sets it for not-found.tsx); the legacy 404 copy, links kept. */
export default function NotFound() {
  return (
    <SiteFrame currentPath="/404/">
      <section className="ds-band">
        <div className="ds-container ds-stack" data-gap="5">
          <span className="t-label" style={{ color: 'var(--color-accent)' }}>
            404
          </span>
          <h1 className="t-d2">That page is not here.</h1>
          <p className="t-lead" style={{ maxInlineSize: '52ch' }}>
            The address may have changed when the site moved. Everything that mattered is one of the pages
            below.
          </p>
          <ul className="ds-stack" data-gap="2" style={{ listStyle: 'none', padding: 0 }}>
            <li>
              <a className="ds-link" href="/">
                Overview
              </a>
            </li>
            <li>
              <a className="ds-link" href="/geo-pricing/">
                What GEO costs
              </a>
            </li>
            <li>
              <a className="ds-link" href="/geo-vs-seo/">
                GEO vs SEO compared
              </a>
            </li>
            <li>
              <a className="ds-link" href="/glossary/">
                AI search glossary
              </a>
            </li>
            <li>
              <a className="ds-link" href="/#contact">
                Send a brief
              </a>
            </li>
          </ul>
        </div>
      </section>
    </SiteFrame>
  )
}
