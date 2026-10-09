import type { Gate, GateReport } from '../../../../../crm/seq/gates'

const MARK = { MET: '✓ Met', NOT_MET: '✗ Not met', AT_CONFIRM: '— At confirm', INFO: '' } as const
/** A met gate repeats nothing, except where its detail is the point (what was reviewed, how many flags). */
const KEEP_DETAIL = new Set(['simulation', 'copy_check'])

function Row({ g, lead }: { g: Gate; lead: boolean }) {
  if (g.status === 'INFO') return <li>{g.label}</li>
  // Each reason is stated once: the lead blocker's reason is the sentence at the top, not repeated in its row.
  const detail = g.status === 'NOT_MET' ? (lead ? '' : g.reason) : g.status === 'AT_CONFIRM' || KEEP_DETAIL.has(g.key) ? g.reason : ''
  return (
    <li>
      <span className="er-gate-status">{MARK[g.status]}</span> {g.label}
      {detail ? <span className="c-hint"> · {detail}</span> : null}
    </li>
  )
}

/** The activation gates as text, never colour alone. The first blocker leads, once; there is no bypass. */
export function GateList({ report }: { report: GateReport }) {
  const more = report.unmet.length - 1
  return (
    <div className="er-gates">
      {report.allMet ? (
        <p>Every safety check is met. Activating lets the engine send to enrolled contacts.</p>
      ) : (
        <div role="note">
          <p>
            <strong>Can’t start yet: {report.blocker!.reason}</strong>
          </p>
          {more > 0 ? <p className="c-hint">{more} more safety check{more === 1 ? ' is' : 's are'} not met, listed below.</p> : null}
        </div>
      )}
      {report.blocks.map((b) => (
        <section key={b.key} aria-label={b.label}>
          <h3>{b.label}</h3>
          {b.summary ? <p className="c-hint">{b.summary}</p> : null}
          <ul className="er-gate-rows">
            {b.gates.map((g) => (
              <Row key={g.key} g={g} lead={report.blocker?.key === g.key} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
