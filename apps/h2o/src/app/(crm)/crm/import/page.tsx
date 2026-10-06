import type { Metadata } from 'next'
import { recentBatches } from '../../../../crm/import/engine'
import { compactTime } from '../../../../crm/workspace/time'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { ImportWizard } from '../_components/ImportWizard'
import { UndoBatchDialog, UndoRunDialog } from '../_components/ImportUndo'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Import contacts' }

/**
 * Wave 1 W1-3: admin-only contact import (dry run → apply → undo). Sales see an explanation, not the tool; the import
 * endpoint and every engine function refuse non-admins on their own as well.
 */
export default async function ImportPage() {
  const s = await requireCrmSession('/crm/import/')
  if (!s.isAdmin)
    return (
      <Shell active="contacts" title="Import contacts" crumb={<a href="/crm/contacts/">Contacts</a>} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Importing contacts is an admin task. <a href="/crm/contacts/">Back to contacts</a>
        </p>
      </Shell>
    )
  const now = new Date()
  const batches = await recentBatches(s)
  const runs = [...new Set(batches.filter((b) => b.status === 'APPLIED').map((b) => b.sha))]
  return (
    <Shell active="contacts" title="Import contacts" crumb={<a href="/crm/contacts/">Contacts</a>} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <div className="c-stack">
        <ImportWizard />
        <section className="c-panel" aria-labelledby="imp-batches">
          <div className="c-panel-head">
            <h2 id="imp-batches">Recent import batches</h2>
            <span className="c-count">{batches.length}</span>
          </div>
          {batches.length === 0 ? (
            <p className="c-empty">No imports yet.</p>
          ) : (
            <div className="c-table-wrap">
              <table className="c-table">
                <caption className="c-visually-hidden">Recent import batches</caption>
                <thead>
                  <tr>
                    <th scope="col">Applied</th>
                    <th scope="col">File</th>
                    <th scope="col" className="num">
                      Rows
                    </th>
                    <th scope="col" className="hide-sm">
                      Source
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="c-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td>{b.appliedAt ? compactTime(new Date(b.appliedAt), now, s.timeZone) : '—'}</td>
                      <td>
                        <span className="c-mono">{b.sha.slice(0, 12)}</span> · part {b.part} of {b.parts}
                      </td>
                      <td className="num">{b.rows.toLocaleString()}</td>
                      <td className="hide-sm">{b.source ?? <span className="c-muted">Not recorded</span>}</td>
                      <td>
                        {b.status === 'UNDONE' ? (
                          <span className="c-status t-terminal">Undone</span>
                        ) : (
                          <span className="c-status t-success">Applied</span>
                        )}
                        {b.undoCounts ? <span className="c-hint"> · {b.undoCounts.contactsArchived ?? 0} archived</span> : null}
                      </td>
                      <td>{b.status === 'APPLIED' ? <UndoBatchDialog batchId={b.id} label={`part ${b.part} of ${b.parts}`} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {runs.length ? (
            <div className="c-block c-actions">
              {runs.map((sha) => (
                <UndoRunDialog key={sha} sha={sha} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </Shell>
  )
}
