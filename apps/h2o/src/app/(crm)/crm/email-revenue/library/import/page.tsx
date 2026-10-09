import type { Metadata } from 'next'
import { stepUpLeft } from '../../../../../../email/settings-page'
import { importLibrary } from '../../../../../../crm/library/import'
import { importSources } from '../../../../../../crm/library/service'
import { requireCrmSession } from '../../../session'
import { EmailRevenueFrame } from '../../_components/EmailRevenueFrame'
import { ImportForm, StepUpPanel } from '../../_components/LibraryForms'

export const metadata: Metadata = { title: 'Import the Email Library' }

/** Admin: the one-off, idempotent load of the written emails. This page runs a dry run (writes nothing) and shows it. */
export default async function LibraryImportPage() {
  const s = await requireCrmSession('/crm/email-revenue/library/import/')
  if (!s.isAdmin)
    return (
      <EmailRevenueFrame s={s} tab="library" title="Import the Email Library">
        <p className="c-alert" role="alert">
          Importing is for admins. <a href="/crm/email-revenue/library/">Back to the Library</a>
        </p>
      </EmailRevenueFrame>
    )
  const [report, left] = await Promise.all([importLibrary(s.payload, { dryRun: true }), stepUpLeft(s)])
  const sources = importSources()
  const by: Record<string, number> = {}
  for (const r of report.rows)
    if (r.action !== 'skip') by[r.key.split('|')[0]!] = (by[r.key.split('|')[0]!] ?? 0) + 1
  return (
    <EmailRevenueFrame
      s={s}
      tab="library"
      title="Import the Email Library"
      crumb={
        <>
          <a href="/crm/email-revenue/">Email Revenue</a> / <a href="/crm/email-revenue/library/">Library</a>
        </>
      }
    >
      <section className="c-panel" aria-labelledby="er-src-h">
        <div className="c-panel-head">
          <h2 id="er-src-h">Source files</h2>
        </div>
        <div className="c-panel-body is-padded">
          <div className="c-table-wrap" role="region" aria-label="Source files table" tabIndex={0}>
            <table className="c-table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(sources).map(([name, sha]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="c-mono">{sha.slice(0, 16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="c-panel" aria-labelledby="er-dry-h">
        <div className="c-panel-head">
          <h2 id="er-dry-h">Dry run</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p>
            {report.create} to add · {report.newVersion} new version{report.newVersion === 1 ? '' : 's'} ·{' '}
            {report.skip} already there. Nothing has been written.
          </p>
          {Object.keys(by).length ? (
            <ul>
              {Object.entries(by).map(([k, n]) => (
                <li key={k}>
                  {k}: {n} to add
                </li>
              ))}
            </ul>
          ) : null}
          <p className="c-hint">
            Imported copy is exact: nothing is edited on import. Copy flagged by the check is stored unchanged
            with its flag. Importing again never duplicates a row; a changed source becomes a new version.
          </p>
        </div>
      </section>
      {report.create + report.newVersion === 0 ? (
        <p className="c-hint">The library is up to date. There is nothing to import.</p>
      ) : (
        <details className="er-reveal">
          <summary className="c-btn is-primary">Import…</summary>
          <StepUpPanel secondsLeft={left} />
          <ImportForm />
        </details>
      )}
    </EmailRevenueFrame>
  )
}
