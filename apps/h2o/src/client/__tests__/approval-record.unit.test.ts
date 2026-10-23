import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APPROVAL_RECORD_PATH, NOTICE_APPROVAL_DOC_SHA256, assertApprovalRecord } from '../../rfq-native/registry'

/** Production accepts the approved notice text only with the approval record (APPROVALS.md) citing the approved document's hash. */
const prod = { H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv
const root = path.resolve(__dirname, '..', '..', '..', '..', '..', 'clients', 'icst')

describe('notice approval record (production policy)', () => {
  it('accepts the committed record (positive)', () => {
    const record = readFileSync(path.join(root, APPROVAL_RECORD_PATH), 'utf8')
    expect(record).toContain(NOTICE_APPROVAL_DOC_SHA256)
    expect(() => assertApprovalRecord(record, prod)).not.toThrow()
  })

  it('refuses when the record is missing (negative)', () => {
    expect(() => assertApprovalRecord(undefined, prod)).toThrow(/APPROVAL_RECORD_MISSING/)
  })

  it('refuses when the record does not cite the approved hash (negative)', () => {
    const record = readFileSync(path.join(root, APPROVAL_RECORD_PATH), 'utf8').replace(NOTICE_APPROVAL_DOC_SHA256, '0'.repeat(64))
    expect(() => assertApprovalRecord(record, prod)).toThrow(/APPROVAL_RECORD_MISMATCH/)
  })

  it('does not apply outside production', () => {
    expect(() => assertApprovalRecord(undefined, {} as NodeJS.ProcessEnv)).not.toThrow()
  })
})
