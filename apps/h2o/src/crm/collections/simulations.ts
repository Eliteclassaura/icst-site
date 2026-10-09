import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmUser, noOne } from '../access'
import { crmCollection } from '../collection'
import { userRelation } from '../fields'
import { CrmInvariantError } from '../guards'

/**
 * SEQ-BUILD-1 — a simulation review: the record that an admin looked at a simulation of one sequence version and
 * approved it. A simulation itself writes nothing; only this approval is stored (a hash of what was simulated, the
 * counts, who and when). It is immutable once written, and an approval stops counting the moment the sequence, its
 * templates or its approval mode change (the hash no longer matches). It authorises nothing on its own: it is one of
 * the activation gates. Written only by trusted server code; the API is read-only. Audited.
 */
const immutable: CollectionBeforeChangeHook = ({ operation }) => {
  if (operation === 'update')
    throw new CrmInvariantError('SIMULATION_IMMUTABLE', 'A simulation review cannot change. Run and approve a new one.')
}

export const CrmSimulations: CollectionConfig = crmCollection(
  {
    slug: 'crm-ers-simulations',
    labels: { singular: 'Simulation review', plural: 'Simulation reviews' },
    access: { read: crmUser, create: noOne, update: noOne, delete: noOne },
    admin: {
      useAsTitle: 'snapshot_hash',
      description: 'An admin’s review of one simulation. Run simulations in the CRM: Email Revenue → Advanced → Simulation.',
      defaultColumns: ['sequence', 'snapshot_hash', 'approved_at'],
    },
    hooks: { beforeChange: [immutable] },
    fields: [
      { name: 'sequence', type: 'relationship', relationTo: 'crm-sequences', required: true, index: true },
      { name: 'version_hash', type: 'text', required: true, maxLength: 64 },
      { name: 'snapshot_hash', type: 'text', required: true, index: true, maxLength: 64 },
      { name: 'counts', type: 'json' },
      { name: 'approved_at', type: 'date', required: true },
      userRelation('approved_by', 'The admin who reviewed this simulation.', true),
    ],
  },
  { deleteAlternative: 'Reviews are kept.' },
)
