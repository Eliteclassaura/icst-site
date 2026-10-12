import type { Metadata } from 'next'
import { replyReadiness } from '../../../../../crm/reply'
import { resolveSignature } from '../../../../../crm/settings/signatures'
import { composerTemplates } from '../../../../../crm/settings/templates'
import { uuidv7 } from '../../../../../crm/ids'
import { MANUAL_NOTICE_TEXT } from '../../../../../crm/workspace/manualInquiry'
import { loadRfq } from '../../../../../crm/workspace/queries'
import { SequencePanel } from '../../email-revenue/_components/SequencePanel'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { Shortcuts } from '../../../../../crm/workspace/ui/Shortcuts'
import { RFQ_TABS, RfqDetailView, type RfqTab } from '../../_components/RfqDetail'
import { BackToList } from '../../_components/ListContext'
import { requireCrmSession } from '../../session'
import { AttachmentsPanel } from '../../_components/AttachmentsPanel'

export const metadata: Metadata = { title: 'Inquiry' }

export default async function RfqPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const s = await requireCrmSession(`/crm/rfqs/${encodeURIComponent(id)}/`)
  const sp = await searchParams
  const now = new Date()
  const tab = (RFQ_TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as RfqTab) : 'summary'
  const d = await loadRfq(s, id, now)
  // CRM email M2: the compose panel (Email tab) — readiness is decided on the server; a fresh compose token per
  // render makes a double submit of the same form one message.
  // Patch C: "Start from a template" (?tpl=T2&c0=…): approved templates only, merged for this inquiry and sender.
  const one = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : Array.isArray(v) && typeof v[0] === 'string' ? v[0].slice(0, 80) : undefined)
  const reply =
    d && tab === 'email'
      ? {
          readiness: await replyReadiness(s, d.rfq),
          token: uuidv7(),
          signature: (await resolveSignature(s.payload, s.userId)).text,
          templates: await composerTemplates(s, d.rfq, { code: one(sp.tpl), choices: [one(sp.c0) ?? '', one(sp.c1) ?? '', one(sp.c2) ?? ''] }),
        }
      : undefined
  const created = sp.created === '1'
  const notices =
    created && typeof sp.notice === 'string'
      ? [
          'Inquiry created.',
          ...sp.notice
            .split(',')
            .filter((c): c is keyof typeof MANUAL_NOTICE_TEXT => Object.hasOwn(MANUAL_NOTICE_TEXT, c))
            .map((c) => MANUAL_NOTICE_TEXT[c]),
        ]
      : []
  return (
    <Shell
      active="inbox"
      title={d ? String(d.rfq.rfq_number) : 'Inquiry'}
      crumb={<BackToList kind="rfqs" label="RFQ Inbox" />}
      userName={s.displayName} session={s}
      isAdmin={s.isAdmin}
    >
      <div id="crm-rfq" role="region" aria-label="Inquiry record" tabIndex={0} className="c-narrow">
        <Shortcuts scopeId="crm-rfq" />
        {d ? (
          <RfqDetailView d={d} s={s} tab={tab} now={now} mode="page" notices={notices} reply={reply} tabHref={(t) => `/crm/rfqs/${d.row.id}/${t === 'summary' ? '' : `?tab=${t}`}`} />
        ) : (
          <p className="c-alert" role="alert">
            This inquiry doesn’t exist or you don’t have access. <a href="/crm/rfqs/">Back to the inbox</a>
          </p>
        )}
        {d ? <SequencePanel s={s} rfqId={id} /> : null}
        <AttachmentsPanel s={s} kind="RFQ" recordId={id} />
      </div>
    </Shell>
  )
}
