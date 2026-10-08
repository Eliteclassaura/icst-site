import type { Access, GlobalConfig } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'

/**
 * ALERTS-1: where the CRM's quote emails go (Settings → Email routing, admins). The values live here, not in the
 * environment; an empty value means "use the server's default" (H2O_SALES_ALERT_TO, H2O_RFQ_SALES_EMAIL), so a fresh
 * database behaves exactly as before.
 *
 *   alerts_us / alerts_th   who gets a new-quote alert for that office's queue (0–10 addresses each)
 *   alerts_cc               an optional extra list that gets every alert
 *   sales_address           the public sales address customers see and the T1 reply goes to
 *
 * Writes only through the settings page (trusted server code after the admin and step-up checks, then audited with
 * old → new values); the Payload admin screen is read-only. No customer data lives here.
 */
const admins: Access = ({ req }) => hasRole(req, ADMINS)
const nobody: Access = () => false

export const CrmEmailRouting: GlobalConfig = {
  slug: 'crm-email-routing',
  label: 'CRM email routing',
  admin: { group: 'CRM', description: 'Who gets new quote alerts and which sales address customers see. Change it in the CRM: Settings → Email routing.' },
  access: { read: admins, update: nobody },
  fields: [
    { name: 'alerts_us', type: 'json', label: 'New quote alerts (US)' },
    { name: 'alerts_th', type: 'json', label: 'New quote alerts (Thailand)' },
    { name: 'alerts_cc', type: 'json', label: 'Also send a copy to' },
    { name: 'sales_address', type: 'text', label: 'Sales address customers see', maxLength: 254 },
  ],
}
