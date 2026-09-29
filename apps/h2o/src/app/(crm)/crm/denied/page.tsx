import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'No access' }

/** Shown to a signed-in user without a CRM role. Renders no CRM data at all. */
export default function DeniedPage() {
  return (
    <div className="crm-app c-denied">
      <main className="c-content" id="crm-main">
        <h1>You don’t have access to the Sales Workspace.</h1>
        <p className="c-hint">The workspace is available to Admin and Sales users. Ask an administrator if you need access.</p>
        <p>
          <a href="/admin/">Go to the admin home</a>
        </p>
      </main>
    </div>
  )
}
