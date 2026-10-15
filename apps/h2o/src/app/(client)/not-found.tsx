import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: false } }

/** The client site's 404: plain, noindex, one way back. The status code is set by Next when a page calls notFound(). */
export default function NotFound() {
  return (
    <main id="main" className="ds-container" style={{ paddingBlock: 'var(--s-8)' }}>
      <h1>Page not found</h1>
      <p>The page you asked for does not exist or has moved.</p>
      <p>
        <a href="/">Go to the home page</a>
      </p>
    </main>
  )
}
