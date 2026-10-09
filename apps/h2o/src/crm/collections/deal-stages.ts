import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmAdmin, crmUser } from '../access'
import { crmCollection } from '../collection'
import { CrmInvariantError, merged, writeOnce } from '../guards'
import { OPPORTUNITY_STAGE, TERMINAL_STAGES, options } from '../vocabulary'

/** OPP-1.1: WON, LOST and CANCELLED must stay enabled; a deal can always be closed, and the closing rules depend on them. */
const terminalStaysEnabled: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const d = merged(data, originalDoc) as Record<string, unknown>
  if ((TERMINAL_STAGES as readonly string[]).includes(String(d.key)) && d.enabled === false)
    throw new CrmInvariantError('TERMINAL_STAGE_MUST_STAY_ENABLED', 'Won, Lost and Canceled cannot be switched off. A deal must always be able to close.')
  return data
}

/**
 * OPP-1 deal stage configuration: how the fixed, evidence-driven stage keys are shown. A stage key is a
 * vocabulary value (the economics and revenue rules depend on WON / LOST / CANCELLED), so the config chooses the
 * label, the order and whether a stage can be picked for new moves. It never invents a key. Seeded defaults come
 * from `workspace/deals.ts` (`ensureDealStages`); admins adjust them, everyone in the CRM reads them.
 */
export const CrmDealStages: CollectionConfig = crmCollection(
  {
    slug: 'crm-deal-stages',
    labels: { singular: 'Deal stage', plural: 'Deal stages' },
    admin: { useAsTitle: 'label', defaultColumns: ['sort_order', 'key', 'label', 'enabled'], description: 'Order and wording of the deal stages. Keys are fixed.' },
    access: { read: crmUser, create: crmAdmin, update: crmAdmin },
    hooks: { beforeChange: [writeOnce('crm-deal-stages', ['key']), terminalStaysEnabled] },
    fields: [
      { name: 'key', type: 'select', required: true, unique: true, index: true, options: options(OPPORTUNITY_STAGE) },
      { name: 'label', type: 'text', required: true, maxLength: 40 },
      { name: 'sort_order', type: 'number', required: true, min: 0, index: true },
      { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { description: 'A disabled stage is hidden from new moves; deals already in it stay visible.' } },
    ],
  },
  { deleteAlternative: 'Disable the stage instead.' },
)
