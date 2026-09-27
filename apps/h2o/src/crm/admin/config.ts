/**
 * CRM-1 admin extensions — Payload's own admin is the private application; no new frontend framework.
 *
 * Component paths are resolved against the importMap `baseDir` (`apps/h2o/src`), and `importMap.js` is
 * regenerated with `payload generate:importmap`, never edited by hand.
 */
export const CRM_OVERVIEW_PATH = '/crm-overview' as const

export const crmAdminComponents = {
  afterNavLinks: ['/crm/admin/CrmNavLink#CrmNavLink'],
  views: {
    crmOverview: {
      Component: '/crm/admin/CrmOverview#CrmOverview',
      path: CRM_OVERVIEW_PATH,
      exact: true,
      meta: { title: 'CRM Overview' },
    },
  },
}
