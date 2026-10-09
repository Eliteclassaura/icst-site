import { dealCalendar, dealZone, DEFAULT_NEXT_STEP, ensureDealStages, startStage, zoneLabel } from '../../../../crm/workspace/deals'
import { asUser, type CrmSession } from '../../../../crm/workspace/session'
import { StageStatus } from '../../../../crm/workspace/ui/Status'
import { QualifyDialog } from './Dialogs'

type Doc = Record<string, unknown>

/** The Qualify control on an inquiry: loads the configured stages, then offers the deal fields. */
export async function QualifySlot({
  s,
  rfq,
  people,
}: {
  s: CrmSession
  rfq: Doc
  people: Array<{ id: string; name: string }>
}) {
  const stages = await ensureDealStages(s.payload)
  const cal = await dealCalendar(s, rfq.office)
  const open = stages.filter((x) => x.enabled && !x.terminal)
  const assignee = rfq.assignee ? String(typeof rfq.assignee === 'object' ? (rfq.assignee as Doc).id : rfq.assignee) : null
  return (
    <QualifyDialog
      rfqId={String(rfq.id)}
      updatedAt={String(rfq.updatedAt ?? '')}
      accountLinked={Boolean(rfq.account)}
      motion={(rfq.motion as string) ?? null}
      people={people}
      meId={s.userId}
      ownerId={assignee && people.some((p) => p.id === assignee) ? assignee : null}
      stages={open.map((x) => ({ key: x.key, label: x.label }))}
      defaultStage={startStage(stages) ?? open[0]?.key ?? 'QUALIFIED'}
      defaultNextStep={DEFAULT_NEXT_STEP}
      zoneNote={`Read as a date in ${zoneLabel(dealZone(rfq.office, s.timeZone))} (the inquiry’s office).`}
      calendar={{ zone: cal.zone, holidays: [...cal.holidays] }}
    />
  )
}

/** On a qualified inquiry: the one deal made from it. */
export async function DealLinkSlot({ s, opportunityId }: { s: CrmSession; opportunityId: string }) {
  const deal = await s.payload
    .findByID({ collection: 'crm-opportunities', id: opportunityId, depth: 0, ...asUser(s) })
    .then((x) => x as unknown as Doc)
    .catch(() => null)
  if (!deal) return <span className="c-muted">A deal exists for this inquiry, but you don’t have access to it.</span>
  const stage = String(deal.stage ?? '')
  return (
    <span className="c-actions">
      <a href={`/crm/deals/${encodeURIComponent(opportunityId)}/`}>{String(deal.name ?? 'Open the deal')}</a>
      <StageStatus value={stage} />
    </span>
  )
}
