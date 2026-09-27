import type { ServerProps } from 'payload'
import { CRM_USERS } from '@factory/agency-core/cms/kernel'
import { CRM_OVERVIEW_PATH } from './config'
import styles from './CrmOverview.module.css'

/** Nav entry for the CRM Overview, shown only to CRM users (the view checks again server-side). */
export const CrmNavLink = ({ user, payload }: ServerProps) => {
  const roles = ((user as { roles?: string[] } | undefined)?.roles ?? []) as string[]
  if (!roles.some((r) => (CRM_USERS as string[]).includes(r))) return null
  const admin = payload?.config?.routes?.admin ?? '/admin'
  return (
    <a className={styles.navLink} href={`${admin}${CRM_OVERVIEW_PATH}`}>
      CRM Overview
    </a>
  )
}
