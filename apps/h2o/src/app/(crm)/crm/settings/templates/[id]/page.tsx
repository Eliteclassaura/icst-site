import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { client } from '../../../../../../client'
import { Fragment } from 'react'
import { MERGE_FIELDS, choicesOf, renderTemplate, responseSentence, templateHash } from '../../../../../../email/templates'
import { readEmailConfig } from '../../../../../../email/config'
import { fieldsOf, isApproved, listTemplates, textOf } from '../../../../../../crm/settings/templates'
import { absoluteTime } from '../../../../../../crm/workspace/time'
import { Shell } from '../../../../../../crm/workspace/ui/Shell'
import { ApproveTemplateForm, TemplateForm } from '../../../_components/SettingsForms'
import { requireCrmSession } from '../../../session'
import { RFQ_PREFIX } from '../../../../../../crm/ids'

export const metadata: Metadata = { title: 'Email template' }

/** Sample values for the preview only (synthetic; never a real customer). */
const SAMPLE = {
  rfq_number: `${RFQ_PREFIX}20261005-SAMPLE01`,
  customer_first_name: 'Alex',
  greeting: 'Hi Alex,',
  company: 'Example Plant (sample)',
  sales_rep_name: 'Your name',
  sales_rep_title: 'Your job title',
  email_signature: `${client().brandName('emailFrom')}\n${client().defaultSender.address}`,
  unsubscribe_url: 'https://example.invalid/unsubscribe',
}

/** Patch C: one template — preview with sample values, edit, approve. */
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await requireCrmSession(`/crm/settings/templates/${encodeURIComponent(id)}/`)
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="Email template" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const t = (await listTemplates(s.payload)).find((x) => String(x.id) === id)
  if (!t) notFound()
  const text = textOf(t)
  const approved = isApproved(t)
  const preview = renderTemplate(text, { ...SAMPLE, response_sentence: responseSentence(readEmailConfig().responsePromise) }, choicesOf(text).map((o) => o[0]!))
  const used = fieldsOf(text)
  return (
    <Shell active="settings" title={`${String(t.code)} · ${String(t.name)}`} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / <a href="/crm/settings/templates/">Email templates</a> / {String(t.code)}
      </p>
      <section className="c-panel is-settings" aria-labelledby="ap-h">
        <div className="c-panel-head">
          <h2 id="ap-h">{approved ? 'Approved — this wording is used' : 'Not approved — not used until approved'}</h2>
        </div>
        <div className="c-panel-body is-padded">
          {approved && typeof t.approved_at === 'string' ? (
            <p className="c-hint">
              Approved {absoluteTime(new Date(t.approved_at), s.timeZone)}, version {String(t.version ?? 1)}
              {t.approved_by ? '.' : ' — set up already approved (the owner approved this wording on 5 October 2026).'}
            </p>
          ) : null}
          {t.code === 'T1' ? (
            <p className="c-hint">
              T1 is sent automatically to the customer for each website inquiry, only while it is approved and the
              customer acknowledgement is switched on in the server settings. Approving it is the owner’s approval of this wording.
            </p>
          ) : null}
          <ApproveTemplateForm id={String(t.id)} hash={templateHash(text)} approved={approved} />
        </div>
      </section>
      <section className="c-panel is-settings" aria-labelledby="pv-h">
        <div className="c-panel-head">
          <h2 id="pv-h">Preview (sample values)</h2>
        </div>
        <div className="c-panel-body is-padded">
          {preview.ok ? (
            <>
              <p>
                <strong>{preview.subject}</strong>
              </p>
              <p className="c-message">{preview.text}</p>
            </>
          ) : (
            <p className="c-alert" role="alert">
              The preview can’t be shown ({preview.code}).
            </p>
          )}
          <dl className="c-dl">
            {used.map((f) => (
              <Fragment key={f}>
                <dt className="c-mono">{`{{${f}}}`}</dt>
                <dd>
                  {MERGE_FIELDS[f]?.label ?? f} — {MERGE_FIELDS[f]?.hint ?? ''}
                  {MERGE_FIELDS[f]?.required ? ' Required: without it the email isn’t sent.' : ''}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </section>
      <section className="c-panel is-settings" aria-labelledby="ed-h">
        <div className="c-panel-head">
          <h2 id="ed-h">Edit</h2>
        </div>
        <div className="c-panel-body is-padded">
          <TemplateForm id={String(t.id)} name={String(t.name)} purpose={text.purpose} subject={text.subject} body={text.body} locked={t.code === 'T1'} />
        </div>
      </section>
    </Shell>
  )
}
