import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import { loadOverview, OPEN_RFQ_STATUSES, STALLED_AFTER_DAYS } from '../overview'
import styles from './CrmOverview.module.css'

const list = (admin: string, slug: string, where?: Record<string, string>) => {
  const q = where
    ? '?' +
      Object.entries(where)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : ''
  return `${admin}/collections/${slug}${q}`
}

/**
 * CRM Overview — a dense operational page, not a KPI wall. Every number links to the filtered list behind
 * it. Unknown values are said as unknown; pipeline is shown per currency with no conversion and a count of
 * opportunities whose value is not known (never summed as zero). The data label is always visible.
 */
export async function CrmOverview({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const admin = req.payload.config.routes.admin
  if (!req.user) redirect(`${admin}/login`)
  const data = await loadOverview(req)
  const template = (children: React.ReactNode) => (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <div className={styles.page}>{children}</div>
    </DefaultTemplate>
  )
  if (!data) return template(<p role="alert">Your role does not include CRM access.</p>)

  const openRfqWhere = Object.fromEntries(OPEN_RFQ_STATUSES.map((s, i) => [`where[status][in][${i}]`, s]))
  const currencies = Object.entries(data.pipeline.byCurrency)
  return template(
    <>
      <header className={styles.header}>
        <h1>CRM Overview</h1>
        <p className={data.dataLabel === 'PRODUCTION' ? styles.label : styles.labelWarn}>
          {data.dataLabel === 'PRODUCTION'
            ? 'Production data'
            : 'Development / synthetic data — not a production metric'}
        </p>
      </header>

      <section className={styles.grid} aria-label="Work queues">
        <a className={styles.card} href={list(admin, 'crm-rfqs', openRfqWhere)}>
          <span className={styles.n}>{data.rfqs.open}</span> open RFQs
        </a>
        <a
          className={styles.card}
          href={list(admin, 'crm-rfqs', { ...openRfqWhere, 'where[assignee][exists]': 'false' })}
        >
          <span className={styles.n}>{data.rfqs.unassigned}</span> unassigned RFQs
        </a>
        <a
          className={styles.card}
          href={list(admin, 'crm-rfqs', { 'where[status][equals]': 'NEEDS_REVIEW' })}
        >
          <span className={styles.n}>{data.rfqs.needsReview}</span> RFQs needing review
        </a>
        <a
          className={styles.card}
          href={list(admin, 'crm-tasks', {
            'where[status][in][0]': 'OPEN',
            'where[status][in][1]': 'IN_PROGRESS',
          })}
        >
          <span className={styles.n}>{data.tasks.overdue}</span> overdue ·{' '}
          <span className={styles.n}>{data.tasks.dueNext7Days}</span> due in 7 days ·{' '}
          <span className={styles.n}>{data.tasks.unassigned}</span> unassigned tasks
        </a>
        <a
          className={styles.card}
          href={list(admin, 'crm-identity-reviews', { 'where[state][equals]': 'OPEN' })}
        >
          <span className={styles.n}>{data.identityReviewsOpen}</span> open identity reviews
        </a>
        {data.intake ? (
          <a className={styles.card} href={list(admin, 'crm-intake-events', { 'where[processing_state][in][0]': 'FAILED_RETRYABLE', 'where[processing_state][in][1]': 'PROCESSING', 'where[processing_state][in][2]': 'QUARANTINED_SPAM' })}>
            <span className={styles.n}>{data.intake.stranded}</span> quote requests not finished ·{' '}
            <span className={styles.n}>{data.intake.spam24h}</span> held as spam (24 h)
          </a>
        ) : null}
        <a className={styles.card} href={list(admin, 'crm-assets')}>
          <span className={styles.n}>{data.installedBaseAccounts ?? '—'}</span> installed-base accounts
          {data.installedBaseAccounts === null ? ' (not available)' : ''}
        </a>
      </section>

      <section aria-label="Opportunities by stage">
        <h2>Opportunities by stage</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              {data.opportunitiesByStage.map((s) => (
                <th key={s.stage} scope="col">
                  {s.stage}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {data.opportunitiesByStage.map((s) => (
                <td key={s.stage}>
                  <a href={list(admin, 'crm-opportunities', { 'where[stage][equals]': s.stage })}>
                    {s.count}
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-label="Open pipeline">
        <h2>Open pipeline (native currency, not revenue)</h2>
        {currencies.length === 0 ? <p>No open opportunity has a known value.</p> : null}
        <ul className={styles.flat}>
          {currencies.map(([cur, v]) => (
            <li key={cur}>
              {cur} {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v.total)} across{' '}
              {v.count}
            </li>
          ))}
        </ul>
        <p>
          {data.pipeline.unknownValueCount} open opportunities have no known value — counted, not summed as 0.
          No currency conversion is applied.
        </p>
      </section>

      <section aria-label="Opportunities without a next task">
        <h2>Open opportunities with no open task ({data.opportunitiesWithoutNextTask.length})</h2>
        <ul className={styles.flat}>
          {data.opportunitiesWithoutNextTask.map((o) => (
            <li key={o.id}>
              <a href={`${admin}/collections/crm-opportunities/${o.id}`}>{o.name}</a> · {o.stage} · {o.amount}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Stalled opportunities">
        <h2>
          Not updated in {STALLED_AFTER_DAYS} days ({data.stalledOpportunities.length}){' '}
          <small>— a view filter, not a stage</small>
        </h2>
        <ul className={styles.flat}>
          {data.stalledOpportunities.map((o) => (
            <li key={o.id}>
              <a href={`${admin}/collections/crm-opportunities/${o.id}`}>{o.name}</a> · {o.stage} · last
              updated {o.updatedAt.slice(0, 10)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Recent activity">
        <h2>Recent activity</h2>
        <ul className={styles.flat}>
          {data.recentActivity.map((a) => (
            <li key={a.id}>
              <time dateTime={a.occurredAt}>{a.occurredAt.slice(0, 16).replace('T', ' ')}</time> · {a.type} ·{' '}
              {a.summary}
            </li>
          ))}
        </ul>
      </section>
      {data.truncated ? (
        <p>Lists show the first 100 open opportunities; use the Opportunities list for the rest.</p>
      ) : null}
    </>,
  )
}
