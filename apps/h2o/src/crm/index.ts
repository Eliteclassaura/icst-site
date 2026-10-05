import type { CollectionConfig, Endpoint } from 'payload'
import { CrmAccounts } from './collections/accounts'
import { CrmActivities } from './collections/activities'
import { CrmAssets } from './collections/assets'
import { CrmBuyingGroupMembers } from './collections/buying-group'
import { CrmContacts } from './collections/contacts'
import { CrmEmailEvents, CrmEmailOutbox } from './collections/email-outbox'
import { CrmIdentityReviews } from './collections/identity-reviews'
import { CrmIntakeEvents } from './collections/intake-events'
import { CrmNotes } from './collections/notes'
import { CrmOpportunities } from './collections/opportunities'
import { CrmRfqItems } from './collections/rfq-items'
import { CrmRfqs } from './collections/rfqs'
import { CrmSites } from './collections/sites'
import { CrmSuppressions } from './collections/suppressions'
import { CrmTasks } from './collections/tasks'
import { typeformIntakeEndpoint } from './intake/typeform/endpoint'

/**
 * H2O / ICS CRM-1 — the private CRM, registered by `apps/h2o/src/payload.config.ts`.
 *
 * Order follows the commercial hierarchy (Account → Contact → Plant/Site → Asset → Opportunity), then the
 * RFQ path, then the operational records. All slugs are `crm-`-prefixed so none can collide with the
 * agency-core CRM layer (which H2O does not register). Nothing here is imported by the public static site:
 * `release/prepare.mjs` copies only `src/app/(site)`, `src/site` and `src/conversion`.
 */
export const crmCollections: CollectionConfig[] = [
  CrmAccounts,
  CrmContacts,
  CrmSites,
  CrmAssets,
  CrmOpportunities,
  CrmBuyingGroupMembers,
  CrmRfqs,
  CrmRfqItems,
  CrmActivities,
  CrmNotes,
  CrmTasks,
  CrmSuppressions,
  CrmIntakeEvents,
  CrmIdentityReviews,
  // CRM email M1: the notification outbox and its audit trail (written by the system only).
  CrmEmailOutbox,
  CrmEmailEvents,
]

export const CRM_SLUGS = crmCollections.map((c) => c.slug)

/**
 * The CRM's HTTP surface: exactly one root endpoint, the Typeform webhook (`POST /api/crm/intake/typeform/`).
 * It answers 404 unless `H2O_CRM_TYPEFORM_INGEST_ENABLED=1` and verifies every delivery's signature.
 */
export const crmEndpoints: Endpoint[] = [typeformIntakeEndpoint]
