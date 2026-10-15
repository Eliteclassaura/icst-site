import { describe, expect, it } from 'vitest'
import { assertApprovedForProduction, PENDING_MARKER } from '../registry'

const prod = { H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv
const priv = {} as NodeJS.ProcessEnv

describe('unapproved quote-form wording', () => {
  it('may be shown on a private deploy for review', () => {
    expect(() => assertApprovedForProduction(`privacy.note\t${PENDING_MARKER}: x`, undefined, priv)).not.toThrow()
    expect(() => assertApprovedForProduction('fine', `# notice\n**${PENDING_MARKER}.**`, priv)).not.toThrow()
  })
  it('refuses to build under the production policy while the copy table or the notice carries the pending marker', () => {
    expect(() => assertApprovedForProduction(`privacy.note\t${PENDING_MARKER}: x`, undefined, prod)).toThrow(/COPY_PENDING_APPROVAL/)
    expect(() => assertApprovedForProduction('fine', `**${PENDING_MARKER}.**`, prod)).toThrow(/COPY_PENDING_APPROVAL/)
  })
  it('passes in production once nothing is pending', () => {
    expect(() => assertApprovedForProduction('approved copy', '# approved notice', prod)).not.toThrow()
  })
})
