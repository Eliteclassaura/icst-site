// packages/agency-core/src/cms/fields/index.ts — addition (sketch — P3, ADR-026)
import type { GroupField } from 'payload'
import { adminFieldOnly } from '../access'

const ACTIONS = ['PROTECT','IMPROVE','REWRITE','REPOSITION','CONSOLIDATE','REDIRECT','NOINDEX','PRUNE','REVIEW'] as const

/** Migration provenance — where this document came from and which decision created it. Admin-only, seed-populated. */
export const migrationFields = (): GroupField => ({
  name: 'migration',
  type: 'group',
  admin: { position: 'sidebar', description: 'Provenance from the source site and the page-decisions run. Written by the importer/seed.' },
  access: { read: adminFieldOnly, create: adminFieldOnly, update: adminFieldOnly },
  fields: [
    { name: 'sourceUrl', type: 'text', index: true },
    { name: 'sourceId', type: 'text' },                 // e.g. wp_posts.ID
    { name: 'sourceSystem', type: 'select', options: ['wordpress', 'static-html', 'copy-deck', 'manual'].map((v) => ({ label: v, value: v })) },
    { name: 'originalTitle', type: 'text' },
    { name: 'originalMetaDescription', type: 'text' },
    { name: 'originalH1', type: 'text' },
    { name: 'originalWordCount', type: 'number' },
    { name: 'originalHtmlHash', type: 'text' },         // sha256 of frozen source HTML
    { name: 'importedAt', type: 'date' },
    { name: 'seoLocked', type: 'checkbox' },
    { name: 'finalMigrationAction', type: 'select', options: ACTIONS.map((v) => ({ label: v, value: v })) },
    { name: 'decisionsVersion', type: 'text' },         // page-decisions run_id (ULID) — idempotency anchor
    { name: 'sourceArchivePath', type: 'text' },        // path inside the frozen archive, never a live URL
  ],
})

// Add `migrationFields()` to `pages` and `posts` in collections/core.ts. Generate a migration. Seed maps blueprint.pages[].migration → here.
