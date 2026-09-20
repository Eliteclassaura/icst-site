import type { CollectionConfig } from 'payload'
import { Users, Media, Pages, Locations, People, Citations, AuditLog } from './foundation'
import {
  Posts,
  Categories,
  Tags,
  Topics,
  Industries,
  Services,
  Offices,
  CaseStudies,
  Ventures,
  Testimonials,
  FAQs,
  GlossaryTerms,
  EvidenceStats,
  CTAs,
  SimulatorPrompts,
  ScorecardQuestions,
  ScorecardBands,
  RevenueModelPrograms,
  Notices,
  SchemaEntities,
  SEOTemplates,
} from './editorial'
import {
  PrivateFiles,
  Redirects,
  Forms,
  Submissions,
  Subscribers,
  Companies,
  Contacts,
  Leads,
  Activities,
  Tasks,
  LeadScoreRules,
  Outbox,
  RateEvents,
} from './crm'

/**
 * The full registration used by `apps/syed-ai`.
 *
 * This array is written out member by member, in the order it has always had, rather than composed from
 * `foundationCollections`/`editorialCollections`/`crmCollections`. The layers are a dependency statement;
 * this order is a schema fact. Composing from the layers would reorder the array and change what
 * `payload migrate:create` emits, so the literal stays literal.
 */
export const allCollections: CollectionConfig[] = [
  Users,
  Media,
  PrivateFiles,
  Pages,
  Posts,
  Categories,
  Tags,
  Topics,
  Industries,
  Locations,
  People,
  Services,
  Offices,
  CaseStudies,
  Ventures,
  Testimonials,
  FAQs,
  GlossaryTerms,
  Citations,
  EvidenceStats,
  CTAs,
  SimulatorPrompts,
  ScorecardQuestions,
  ScorecardBands,
  RevenueModelPrograms,
  Notices,
  SchemaEntities,
  SEOTemplates,
  Redirects,
  Forms,
  Submissions,
  Subscribers,
  Companies,
  Contacts,
  Leads,
  Activities,
  Tasks,
  LeadScoreRules,
  Outbox,
  RateEvents,
  AuditLog,
]

/** Collections whose records are personal data or security-relevant; used by threat-model tests. */
export const SENSITIVE_COLLECTIONS = [
  'submissions',
  'subscribers',
  'contacts',
  'companies',
  'leads',
  'activities',
  'tasks',
  'lead-score-rules',
  'outbox',
  'rate-events',
  'private-files',
  'audit-log',
  'users',
] as const

export * from './foundation'
export * from './editorial'
export * from './crm'
