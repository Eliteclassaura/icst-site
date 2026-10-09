import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatSteps } from '../../../../../../crm/ers/admin'
import type { Step } from '../../../../../../crm/ers/engine'
import { engineStatus } from '../../../../../../crm/ers/report'
import { loadViews } from '../../../../../../crm/workspace/savedViews'
import { absoluteTime } from '../../../../../../crm/workspace/time'
import { Shell } from '../../../../../../crm/workspace/ui/Shell'
import { ToneChip } from '../../../../../../crm/workspace/ui/Status'
import type { Tone } from '../../../../../../crm/workspace/labels'
import { DraftSteps, SequenceActions } from '../../../_components/SequenceForms'
import { requireCrmSession } from '../../../session'

export const metadata: Metadata = { title: 'Sequence' }
type Doc = Record<string, unknown>

/** Revenue Engine slice 1: one sequence — versions (published ones are frozen), steps, state, enrollment from a view. */
export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await requireCrmSession(`/crm/settings/sequences/${encodeURIComponent(id)}/`)
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="Sequence" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const seq = (await s.payload.findByID({ collection: 'crm-sequences', id, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
  if (!seq) notFound()
  const versions = (await s.payload.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: id } }, sort: '-version_number', limit: 50, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const templates = (await s.payload.find({ collection: 'crm-email-templates', where: { purpose: { equals: 'SEQUENCE' } }, limit: 100, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const codeOf = (tid: unknown) => String(templates.find((t) => String(t.id) === String(tid && typeof tid === 'object' ? (tid as Doc).id : tid))?.code ?? '?')
  const draft = versions.find((v) => v.state === 'DRAFT') ?? null
  const published = versions.find((v) => String(v.id) === String(seq.published_version)) ?? null
  const st = await engineStatus(s.payload)
  const views = (await loadViews(s)).filter((v) => v.list === 'inbox' || v.list === 'contacts')
  // Polish R1: each step is a row with its kind (Wait / Email / Task) as a tag, numbered by the list.
  const stepLines = (v: Doc) => ((v.steps ?? []) as Step[]).map((x, i) => (
    <li key={`${String(v.id)}-${i}`}>
      <span className={`c-step-kind is-${x.type.toLowerCase()}`}>{x.type === 'WAIT' ? 'Wait' : x.type === 'EMAIL' ? 'Email' : 'Task'}</span>
      <span className="c-step-text">
        {x.type === 'WAIT' ? (
          `${x.business_days} business day${Number(x.business_days) === 1 ? '' : 's'}`
        ) : x.type === 'EMAIL' ? (
          <>
            Template{' '}
            <a href={`/crm/settings/templates/${encodeURIComponent(String(x.template && typeof x.template === 'object' ? (x.template as Doc).id : x.template))}/`}>{codeOf(x.template)}</a>
          </>
        ) : (
          `For the owner, due in ${x.task_due_days ?? 0} business day${Number(x.task_due_days) === 1 ? '' : 's'}: ${x.task_title}`
        )}
      </span>
    </li>
  ))
  const RUN: Record<string, { label: string; tone: Tone }> = {
    ACTIVE: { label: 'Running', tone: 'success' },
    PAUSED: { label: 'Paused', tone: 'warning' },
    RETIRED: { label: 'Retired', tone: 'terminal' },
  }
  const run = RUN[String(seq.run_state)] ?? { label: 'Not started', tone: 'neutral' as const }
  return (
    <Shell active="settings" title={String(seq.name)} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / <a href="/crm/settings/sequences/">Sequences</a> / {String(seq.name)}
      </p>
      <section className="c-panel is-settings" aria-labelledby="st-h">
        <div className="c-panel-head">
          <h2 id="st-h">Status</h2>
          <ToneChip tone={run.tone}>{run.label}</ToneChip>
        </div>
        <div className="c-panel-body is-padded">
          <dl className="c-dl">
            <dt>Key</dt>
            <dd className="c-mono">{String(seq.key)}</dd>
            <dt>Language</dt>
            <dd>{String(seq.language)}</dd>
            <dt>Approval</dt>
            <dd>Automatic. Every email is checked by the copy-risk rules first; anything flagged is held for review.</dd>
            <dt>Published</dt>
            <dd>
              {published
                ? `Version ${String(published.version_number)}${typeof published.published_at === 'string' ? `, ${absoluteTime(new Date(published.published_at), s.timeZone)}` : ''}`
                : 'No version published yet'}
            </dd>
          </dl>
          <SequenceActions sequenceId={id} runState={String(seq.run_state)} draftVersionId={draft ? String(draft.id) : null} canActivate={Boolean(published)} />
          {!st.inboundLive && seq.run_state !== 'ACTIVE' ? <p className="c-hint">Starting needs live reply detection (inbound email on and checked in the last 15 minutes).</p> : null}
        </div>
      </section>
      {published ? (
        <section className="c-panel is-settings" aria-labelledby="pub-h">
          <div className="c-panel-head">
            <h2 id="pub-h">Version {String(published.version_number)} (published, frozen)</h2>
          </div>
          <div className="c-panel-body is-padded">
            <ol className="c-steps">{stepLines(published)}</ol>
            <p className="c-hint c-mono c-hash">Definition hash {String(published.definition_hash ?? '')}</p>
          </div>
        </section>
      ) : null}
      {draft ? (
        <section className="c-panel is-settings" aria-labelledby="dr-h">
          <div className="c-panel-head">
            <h2 id="dr-h">Version {String(draft.version_number)} (draft)</h2>
          </div>
          <div className="c-panel-body is-padded">
            <ol className="c-steps">{stepLines(draft)}</ol>
            <DraftSteps versionId={String(draft.id)} steps={formatSteps((draft.steps ?? []) as Step[], codeOf)} />
            <p className="c-hint">Sequence templates: {templates.map((t) => String(t.code)).join(', ')}.</p>
          </div>
        </section>
      ) : null}
      {seq.run_state === 'ACTIVE' && !seq.needs_missing_items ? (
        <section className="c-panel is-settings" aria-labelledby="en-h">
          <div className="c-panel-head">
            <h2 id="en-h">Enroll from a saved view</h2>
          </div>
          <div className="c-panel-body is-padded">
            {views.length === 0 ? (
              <p className="c-hint">No inquiry or contact views yet. Save a view in the RFQ Inbox or Contacts first.</p>
            ) : (
              <form method="get" action="/crm/sequences/enroll/" className="c-template-pick">
                <input type="hidden" name="seq" value={id} />
                <label className="c-field">
                  <span>Saved view</span>
                  <select className="c-select" name="view">
                    {views.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.list === 'inbox' ? 'inquiries' : 'contacts'})
                      </option>
                    ))}
                  </select>
                </label>
                <button className="c-btn" type="submit">
                  Preview enrollment
                </button>
              </form>
            )}
            <p className="c-hint">Each contact is enrolled at most once per sequence, anchored to their latest open inquiry. The preview shows who would be enrolled and why others are skipped.</p>
          </div>
        </section>
      ) : null}
    </Shell>
  )
}
