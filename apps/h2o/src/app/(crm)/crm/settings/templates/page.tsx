import type { Metadata } from 'next'
import { isApproved, listTemplates } from '../../../../../crm/settings/templates'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'Email templates' }

/** Patch C: email templates (admins edit and approve; Sales use approved ones from an inquiry's Email tab). */
export default async function TemplatesPage() {
  const s = await requireCrmSession('/crm/settings/templates/')
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="Email templates" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const all = await listTemplates(s.payload)
  return (
    <Shell active="settings" title="Email templates" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / Email templates
      </p>
      <p className="c-hint">
        A template is used only while its wording is approved; any edit needs approval again. T1 is sent automatically to
        the customer when a website inquiry arrives (when the acknowledgement is switched on). T2–T6 start replies from an
        inquiry’s Email tab.
      </p>
      <div className="c-table-wrap">
        <table className="c-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Kind</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Version
              </th>
            </tr>
          </thead>
          <tbody>
            {all.map((t) => (
              <tr key={String(t.id)}>
                <td className="c-mono">{String(t.code)}</td>
                <td>
                  <a href={`/crm/settings/templates/${encodeURIComponent(String(t.id))}/`}>{String(t.name)}</a>
                </td>
                <td>{t.purpose === 'MARKETING' ? 'Marketing' : t.purpose === 'SEQUENCE' ? 'Sequence' : 'Transactional'}</td>
                <td>{isApproved(t) ? <span className="c-badge">Approved</span> : <span className="c-badge is-error">Needs approval</span>}</td>
                <td className="num">{String(t.version ?? 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}
