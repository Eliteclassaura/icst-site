import type { ClientConfig } from '../client'
import { INQUIRY_TYPE_LABEL, INQUIRY_TYPE } from './inquiry-type'
import { OPPORTUNITY_STAGE } from './vocabulary'
import { STAGE_LABEL } from './workspace/labels'

/**
 * KIT-0 H5: what a client's manifest may say about the CRM vocabulary, checked against what the database can hold.
 *
 * The pipeline stages and the inquiry types are database enums (migration history), so they stay fixed for every client: a client
 * chooses WHICH of them it uses, never new values. This pure check says which manifest entries the code cannot store, and which
 * labels differ from the ones the workspace shows today (the workspace still shows its own labels; per-client display labels are
 * not applied yet). Build and seed tooling calls it on the client's manifest.
 */
export type VocabularyIssue = { path: string; message: string }

export function vocabularyIssues(c: Pick<ClientConfig, 'manifest'>): VocabularyIssue[] {
  const out: VocabularyIssue[] = []
  const stages = c.manifest.crm.pipelineStages
  const purposes = c.manifest.crm.intakePurposes
  for (const [i, s] of stages.entries())
    if (!(OPPORTUNITY_STAGE as readonly string[]).includes(s.key)) out.push({ path: `crm.pipelineStages[${i}].key`, message: `"${s.key}" is not a stored pipeline stage (${OPPORTUNITY_STAGE.join(', ')})` })
  for (const [i, p] of purposes.entries())
    if (!(INQUIRY_TYPE as readonly string[]).includes(p.key)) out.push({ path: `crm.intakePurposes[${i}].key`, message: `"${p.key}" is not a stored inquiry type (${INQUIRY_TYPE.join(', ')})` })
  return out
}

/** Labels in the manifest that differ from what the workspace shows today (informational: the workspace labels win until per-client labels are applied). */
export function labelDifferences(c: Pick<ClientConfig, 'manifest'>): VocabularyIssue[] {
  const out: VocabularyIssue[] = []
  for (const [i, s] of c.manifest.crm.pipelineStages.entries()) {
    const shown = STAGE_LABEL[s.key]?.label
    if (shown !== undefined && shown !== s.label) out.push({ path: `crm.pipelineStages[${i}].label`, message: `manifest "${s.label}" but the workspace shows "${shown}"` })
  }
  for (const [i, p] of c.manifest.crm.intakePurposes.entries()) {
    const shown = (INQUIRY_TYPE_LABEL as Record<string, string>)[p.key]
    if (shown !== undefined && shown !== p.label) out.push({ path: `crm.intakePurposes[${i}].label`, message: `manifest "${p.label}" but the workspace shows "${shown}"` })
  }
  return out
}
