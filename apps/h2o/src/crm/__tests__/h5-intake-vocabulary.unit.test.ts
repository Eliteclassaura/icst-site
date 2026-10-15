import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildClient, DEFAULT_CLIENT, H2O_MANIFEST } from '../../client'
import type * as ClientNS from '../../client'
import { validateManifest } from '../../client/manifest'
import { labelDifferences, vocabularyIssues } from '../client-vocabulary'
import { RFQ_NUMBER_PATTERN, RFQ_PREFIX, RFQ_PREFIX_SHAPE, rfqNumberFor, rfqNumberPattern } from '../ids'
import { INQUIRY_TYPE } from '../inquiry-type'
import { OPPORTUNITY_STAGE } from '../vocabulary'

/**
 * KIT-0 H5 (intake, vocabulary, RFQ prefix): the RFQ number prefix comes from the client manifest; the stored pipeline stages
 * and inquiry types (database enums) stay fixed and the manifest may only choose among them. For the default client the numbers
 * and the pattern must be exactly what they were.
 */
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
function manifestOf(slug: string) {
  const v = validateManifest(JSON.parse(read(path.join('../../clients', slug, 'manifest.json'))))
  if (!v.ok) throw new Error(`manifest of ${slug} invalid: ${JSON.stringify(v.issues)}`)
  return v.manifest
}

// the generator as it stood at the base commit (copied verbatim, on purpose)
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function oldRfqNumberFor(canonicalId: string, receivedAt: Date): string {
  const random = canonicalId.replace(/-/g, '').slice(-10)
  let n = BigInt(`0x${random}`)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code = CROCKFORD[Number(n & 31n)]! + code
    n >>= 5n
  }
  const d = receivedAt.toISOString().slice(0, 10).replace(/-/g, '')
  return `RFQ-${d}-${code}`
}
const OLD_PATTERN = /^RFQ-\d{8}-[0-9A-HJKMNP-TV-Z]{8}$/
const uuid7 = (n: number) => `0195${n.toString(16).padStart(4, '0')}-0000-7000-8000-${(n * 2654435761 + 12345).toString(16).padStart(12, '0').slice(-12)}`

describe('the default client: RFQ numbers are exactly what they were', () => {
  it('the prefix is RFQ-, the pattern is the same regular expression, and 500 generated numbers are identical', () => {
    expect(RFQ_PREFIX).toBe('RFQ-')
    expect(RFQ_NUMBER_PATTERN.source).toBe(OLD_PATTERN.source)
    expect(RFQ_NUMBER_PATTERN.flags).toBe(OLD_PATTERN.flags)
    for (let i = 1; i <= 500; i++) {
      const id = uuid7(i)
      const at = new Date(Date.UTC(2026, i % 12, (i % 28) + 1, i % 24))
      expect(rfqNumberFor(id, at), id).toBe(oldRfqNumberFor(id, at))
      expect(RFQ_NUMBER_PATTERN.test(rfqNumberFor(id, at))).toBe(true)
    }
  })
  it('still refuses a non-UUIDv7 id and an invalid date', () => {
    expect(() => rfqNumberFor('not-a-uuid', new Date())).toThrow(/UUIDv7/)
    expect(() => rfqNumberFor(uuid7(1), new Date('x'))).toThrow(/invalid receipt time/)
  })
})

describe('a prefix is validated before it goes into a pattern and every customer-facing number', () => {
  it('accepts 2 to 6 capital letters or digits and a hyphen; refuses anything else', () => {
    for (const ok of ['RFQ-', 'EXI-', 'IC-', 'ABC123-', 'Q9-']) expect(RFQ_PREFIX_SHAPE.test(ok), ok).toBe(true)
    for (const bad of ['rfq-', 'RFQ', 'R-', 'TOOLONG7-', '-RFQ', 'RFQ_', 'RF Q-', 'RFQ-.*', '(RFQ)-', '']) expect(RFQ_PREFIX_SHAPE.test(bad), bad).toBe(false)
  })
  it('the pattern for a prefix matches that prefix\'s numbers and no other client\'s', () => {
    const p = rfqNumberPattern('EXI-')
    expect(p.test('EXI-20261015-ABCD1234')).toBe(true)
    expect(p.test('RFQ-20261015-ABCD1234')).toBe(false)
    expect(p.test('EXI-20261015-ABCD123I')).toBe(false) // I is not in the alphabet
  })
})

describe('another client\'s prefix (client() mocked, modules reset)', () => {
  afterEach(() => {
    vi.doUnmock('../../client')
    vi.resetModules()
  })
  const as = async (rfqPrefix: string) => {
    const m = buildClient({ ...H2O_MANIFEST, crm: { ...H2O_MANIFEST.crm, rfqPrefix } })
    vi.resetModules()
    vi.doMock('../../client', async (orig) => ({ ...(await orig<typeof ClientNS>()), client: () => m }))
    return { ids: await import('../ids'), templates: await import('../../email/templates'), library: await import('../library/service') }
  }
  it('numbers, pattern, field hint and library samples all use it', async () => {
    const x = await as('EXI-')
    const n = x.ids.rfqNumberFor(uuid7(7), new Date(Date.UTC(2026, 9, 15)))
    expect(n).toMatch(/^EXI-20261015-[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(x.ids.RFQ_NUMBER_PATTERN.test(n)).toBe(true)
    expect(x.ids.RFQ_NUMBER_PATTERN.test(oldRfqNumberFor(uuid7(7), new Date(Date.UTC(2026, 9, 15))))).toBe(false)
    expect(x.templates.MERGE_FIELDS.rfq_number!.hint).toContain('EXI-20261005-ABCD1234')
    const numbered = x.library.SAMPLE_RECIPIENTS.filter((r) => r.values.rfq_number !== undefined)
    expect(numbered.length).toBe(2) // the third sample is the deliberately incomplete one
    for (const r of numbered) expect(String(r.values.rfq_number).startsWith('EXI-SAMPLE-')).toBe(true)
  })
  it('a prefix with the wrong shape stops the module at load (fail closed)', async () => {
    await expect(as('rfq-')).rejects.toThrow(/rfqPrefix/)
    await expect(as('x')).rejects.toThrow(/rfqPrefix/)
  })
})

describe('the stored vocabulary stays fixed; a client may only choose among it', () => {
  it('the default client and the ICST manifest use only stored stages and inquiry types', () => {
    expect(vocabularyIssues(buildClient(H2O_MANIFEST))).toEqual([])
    expect(vocabularyIssues(buildClient(manifestOf('icst')))).toEqual([])
    expect(vocabularyIssues(buildClient(manifestOf(DEFAULT_CLIENT)))).toEqual([])
  })
  it('the default client\'s manifest lists exactly the stored stages and types, in the code\'s order', () => {
    expect(H2O_MANIFEST.crm.pipelineStages.map((s) => s.key)).toEqual([...OPPORTUNITY_STAGE])
    expect(H2O_MANIFEST.crm.intakePurposes.map((p) => p.key)).toEqual(INQUIRY_TYPE.filter((k) => k !== 'UNKNOWN'))
  })
  it('a stage or purpose the database cannot hold is reported with its path', () => {
    const bad = buildClient({
      ...H2O_MANIFEST,
      crm: { ...H2O_MANIFEST.crm, pipelineStages: [...H2O_MANIFEST.crm.pipelineStages, { key: 'ON_HOLD', label: 'On hold' }], intakePurposes: [{ key: 'SERVICE', label: 'Service' }] },
    })
    expect(vocabularyIssues(bad).map((i) => i.path)).toEqual(['crm.pipelineStages[9].key', 'crm.intakePurposes[0].key'])
  })
  it('labels: the manifest and the workspace agree except one known spelling (finding 1 in the note)', () => {
    expect(labelDifferences(buildClient(H2O_MANIFEST)).map((d) => d.path)).toEqual(['crm.pipelineStages[8].label'])
  })
})

describe('no client\'s prefix is spelled out in the code H5 moved', () => {
  it('ids, the inbound link check, the templates hint and the samples read the prefix from the client', () => {
    expect(read('src/crm/ids.ts')).not.toMatch(/`RFQ-\$\{/)
    expect(read('src/crm/inbound.ts')).not.toMatch(/\^RFQ-/)
    expect(read('src/crm/inbound.ts')).not.toMatch(/like RFQ-/)
    expect(read('src/crm/library/service.ts')).not.toMatch(/'RFQ-SAMPLE/)
    expect(read('src/app/(crm)/crm/settings/templates/[id]/page.tsx')).not.toMatch(/'RFQ-2026/)
    expect(read('src/email/templates.ts')).not.toMatch(/e\.g\. RFQ-/)
  })
})
