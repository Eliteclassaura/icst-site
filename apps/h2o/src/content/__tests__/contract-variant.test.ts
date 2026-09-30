import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { composePublicDocument } from '../compose'
import { migrateQuoteIntent } from '../rfq-intent'
import { applyPublicExclusions } from '../public-exclusions'
import { contractExclusions, contractIndex, SALMON_FAMILY_CONTRACT, SALMON_FAMILY_CONTRACT_VERSION } from '../salmon-family-contract'
import type { Block, SalmonFamilyPageModel } from './fixtures/salmon-family-v1.1.0/salmon-family-model.contract'

/**
 * CONTRACT_VARIANT_VALIDATION: Main's SALMON_FAMILY_PAGE_V1 1.1.0 model references (supplied, hash-pinned)
 * against the runtime's Payload projection of the same routes. The contract file is a fixture used for types
 * only; Main's presentation package is not installed.
 */
const FIX = path.join(__dirname, 'fixtures/salmon-family-v1.1.0')
const APP = path.resolve(__dirname, '../../..')
const PINNED: Record<string, string> = {
  'salmon-family-model.contract.ts': 'e0b4d07a1cdacb2f376ee457ccc4cd76b0124802633a2cd1b5e3639f37766302',
  'model-reference-Industries.json': '2a9ed65c909530add379d77da40c3591c232d4ab30d741ab15ff5cce0bd654aa',
  'model-reference-Solutions.json': '9b41c54c7a988926aa5cd92d8935db0a58756a213ae76a504a8114f6331ab2b7',
  'SEVEN_EXCLUSIONS.json': 'b849af26aef0771b69453003f819a8d7f9375174676344caa76c17f86fbf9da8',
}
const richText = (r: Array<{ text: string }> | undefined) => (r ?? []).map((x) => x.text).join(' ')
const blockText = (b: Block): string => {
  if (b.type === 'heading') return richText(b.text)
  if (b.type === 'text') return b.blocks.map((t) => ('content' in t ? richText(t.content) : 'items' in t ? t.items.map(richText).join(' ') : t.rows.map((r) => r.map(richText).join(' ')).join(' '))).join(' ')
  if (b.type === 'button' || b.type === 'label') return b.type === 'button' ? b.label : b.text
  return ''
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('SALMON_FAMILY_PAGE_V1 1.1.0 contract variant validation', () => {
  it('uses the exact supplied contract inputs (hash-pinned)', () => {
    for (const [f, h] of Object.entries(PINNED)) expect(createHash('sha256').update(readFileSync(path.join(FIX, f))).digest('hex'), f).toBe(h)
    expect(readFileSync(path.join(FIX, 'salmon-family-model.contract.ts'), 'utf8')).toContain(`SALMON_FAMILY_CONTRACT_VERSION='${SALMON_FAMILY_CONTRACT_VERSION}'`)
  })

  for (const name of ['Industries', 'Solutions']) {
    const model = JSON.parse(readFileSync(path.join(FIX, `model-reference-${name}.json`), 'utf8')) as SalmonFamilyPageModel
    it(`${name}: exclusions field is produced identically from the runtime registry`, () => {
      expect(model.contract).toBe(SALMON_FAMILY_CONTRACT)
      expect(model.contractVersion).toBe(SALMON_FAMILY_CONTRACT_VERSION)
      const sort = (a: Array<{ elementId: string }>) => [...a].sort((x, y) => x.elementId.localeCompare(y.elementId))
      expect(sort(contractExclusions(model.routeId))).toEqual(sort(model.exclusions))
    })
    it(`${name}: every model content block matches the Payload projection at its source key; withheld keys are absent`, () => {
      const raw = JSON.parse(readFileSync(path.join(APP, 'content/salmon/documents', `${model.routeId}.json`), 'utf8'))
      const stored = applyPublicExclusions(model.routeId, raw).doc
      migrateQuoteIntent(stored, { routeId: model.routeId, publicProducts: new Map(), matchedArticle: false })
      const composed = composePublicDocument({ routeId: model.routeId, path: model.path, family: 'salmon', title: String(raw.title), document: stored })
      const index = contractIndex(composed)
      let checked = 0
      const visit = (b: Block) => {
        const e = index.get(b.key)
        expect(e, b.key).toBeTruthy()
        expect(e!.excluded ?? false, b.key).toBe(false)
        if ('elementId' in b && b.elementId) expect(e!.elementId, b.key).toBe(b.elementId)
        const t = norm(blockText(b))
        if (t) {
          expect(e!.text, b.key).toContain(t)
          checked++
        }
        if (b.type === 'button') {
          expect(e!.intent ?? null, b.key).toBe(b.intent ?? null)
        }
        if (b.type === 'image') expect(JSON.stringify(stored).length).toBeGreaterThan(0)
        if (b.type === 'container') b.children.forEach(visit)
      }
      for (const s of model.sections) visit(s.root)
      expect(checked).toBeGreaterThan(5)
      for (const x of model.exclusions) {
        const own = index.get(x.sourceKey)
        const covered = own?.excluded || [...index.values()].some((e) => e.excluded && x.sourceKey.startsWith(e.key + '.'))
        expect(covered, x.sourceKey).toBe(true)
        const inModel = (function has(bs: Block[]): boolean {
          return bs.some((b) => b.key === x.sourceKey || b.key.startsWith(x.sourceKey + '.') || (b.type === 'container' && has(b.children)))
        })(model.sections.map((s) => s.root))
        expect(inModel, x.sourceKey).toBe(false)
      }
    })
  }
})
