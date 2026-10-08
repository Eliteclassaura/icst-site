import type { Metadata } from 'next'
import { readSheetsConfig } from '../../../../../sheets/config'
import { listSheetRows, sheetStats } from '../../../../../sheets/sync'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { ToneChip } from '../../../../../crm/workspace/ui/Status'
import { SheetRetryForm } from '../../_components/SheetRetry'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'Website quote requests in Google Sheets' }

const STATE = { FAILED: ['Not in the sheet', 'warning'], PENDING: ['On its way', 'neutral'], SENDING: ['Sending', 'neutral'], SKIPPED: ['Skipped', 'terminal'] } as const

/** SHEET-SYNC-1: website quote requests that are not in the Google Sheet yet (admins). The request itself is safe in the CRM. */
export default async function WebsiteSheetPage() {
  const s = await requireCrmSession('/crm/settings/website-sheet/')
  const shell = (children: React.ReactNode) => (
    <Shell active="settings" title="Quote requests in Google Sheets" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      {children}
    </Shell>
  )
  if (!s.isAdmin)
    return shell(
      <p className="c-alert" role="alert">
        Settings are for admins. <a href="/crm/">Back to My Work</a>
      </p>,
    )
  const cfg = readSheetsConfig()
  if (!cfg.enabled)
    return shell(
      <section className="c-panel is-settings">
        <div className="c-panel-body is-padded">
          <p>Sending new quote requests to a Google Sheet is switched off on this server.{cfg.errors.length ? ` The settings are not usable (${cfg.errors.join(', ')}).` : ''}</p>
        </div>
      </section>,
    )
  const [stats, rows] = await Promise.all([sheetStats(s.payload), listSheetRows(s.payload)])
  return shell(
    <>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / Quote requests in Google Sheets
      </p>
      <section className="c-panel is-settings" aria-labelledby="sheet-h">
        <div className="c-panel-head">
          <h2 id="sheet-h">Not in the sheet yet</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p className="c-hint">
            Every new website quote request is added to the sheet a minute or so after it arrives. {stats.failed} could not be added after several tries; {stats.pending} are still on their way. The request is safe in the CRM either way.
          </p>
          {stats.failed > 0 ? <SheetRetryForm /> : null}
          {rows.length ? (
            <div className="c-table-wrap">
              <table className="c-table" aria-label="Quote requests not in the Google Sheet">
                <thead>
                  <tr>
                    <th scope="col">Quote request</th>
                    <th scope="col">Status</th>
                    <th scope="col">Tries</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.inquiryId}>
                      <th scope="row">
                        <a href={`/crm/rfqs/${encodeURIComponent(r.inquiryId)}/`}>Open request</a>
                      </th>
                      <td>
                        <ToneChip tone={(STATE[r.state as keyof typeof STATE] ?? STATE.PENDING)[1]}>{(STATE[r.state as keyof typeof STATE] ?? STATE.PENDING)[0]}</ToneChip>
                      </td>
                      <td>{r.attempts}</td>
                      <td>{r.code ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Everything has reached the sheet.</p>
          )}
        </div>
      </section>
    </>,
  )
}
