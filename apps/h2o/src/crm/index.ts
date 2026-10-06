import type { CollectionConfig, Endpoint } from 'payload'
import { CrmAccounts } from './collections/accounts'
import { CrmActivities } from './collections/activities'
import { CrmAssets } from './collections/assets'
import { CrmBuyingGroupMembers } from './collections/buying-group'
import { CrmContacts } from './collections/contacts'
import { CrmEmailMessages, CrmReplyTokens } from './collections/email-messages'
import { CrmEmailEvents, CrmEmailOutbox } from './collections/email-outbox'
import { CrmEmailReview } from './collections/email-review'
import { CrmIdentityReviews } from './collections/identity-reviews'
import { CrmImportBatches } from './collections/import-batches'
import { CrmIntakeEvents } from './collections/intake-events'
import { CrmNotes } from './collections/notes'
import { CrmOpportunities } from './collections/opportunities'
import { CrmRfqItems } from './collections/rfq-items'
import { CrmRfqs } from './collections/rfqs'
import { CrmSavedViews } from './collections/saved-views'
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
  // CRM email M2: the RFQ conversation and its reply tokens.
  CrmEmailMessages,
  CrmReplyTokens,
  // CRM email M3: inbound mail that was not linked automatically.
  CrmEmailReview,
  // Wave 1 W1-3: applied CSV import batches (counts and ids only).
  CrmImportBatches,
  // Wave 1 W1-6: saved list views (validated filter keys only).
  CrmSavedViews,
]

export const CRM_SLUGS = crmCollections.map((c) => c.slug)

/**
 * The CRM's HTTP surface: exactly one root endpoint, the Typeform webhook (`POST /api/crm/intake/typeform/`).
 * It answers 404 unless `H2O_CRM_TYPEFORM_INGEST_ENABLED=1` and verifies every delivery's signature.
 */
export const crmEndpoints: Endpoint[] = [typeformIntakeEndpoint]
