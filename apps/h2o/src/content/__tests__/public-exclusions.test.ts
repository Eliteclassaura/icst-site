import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { composePublicDocument } from '../compose'
import { applyPublicExclusions, PUBLIC_EXCLUSIONS, RETAINED_ELEMENTS, withheldNodesIn } from '../public-exclusions'
import { publicBodyText } from '../projection-text'
import { extractSlots } from '../content-slots'

type Node = string | { tag: string; attrs?: Record<string, string>; children?: Node[] }
type Doc = Record<string, unknown> & { children: Node[]; text: string }
const APP = path.resolve(__dirname, '../../..')
const PACKET = '/home/claude/ct-r1a/H2O_PAYLOAD_RUNTIME_R1A_CONTROL_TOWER_REVIEW_2026-09-30/authority-inputs/SEVEN_EXCLUSIONS.json'
const source = (id: string) => JSON.parse(readFileSync(path.join(APP, 'content/salmon/documents', `${id}.json`), 'utf8')) as Doc
const keys = (nodes: Node[], p = 'body'): Map<string, string> => {
  const m = new Map<string, string>()
  nodes.forEach((n, i) => {
    const k = `${p}.${i}`
    if (typeof n === 'string') return
    const id = n.attrs?.['data-id'] ?? n.attrs?.['data-public-exclusion']
    if (id) m.set(id, k)
    for (const [a, b] of keys(n.children ?? [], k)) m.set(a, b)
  })
  return m
}
const textOf = (n: Node): string => (typeof n === 'string' ? n : (n.children ?? []).map(textOf).join(' '))
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const cardText = (doc: Doc, id: string): string => {
  let card: Node | null = null
  const walk = (n: Node) => {
    if (typeof n === 'string') return
    if (n.attrs?.['data-id'] === id) card = n
    ;(n.children ?? []).forEach(walk)
  }
  doc.children.forEach(walk)
  return norm(textOf(card!))
}

describe('seven accepted public exclusions (identity, not text)', () => {
  it('registry equals the seven-row authority exactly; 64afe52 is retained', () => {
    const rows = [
      ['SALMON-pages-8', '11cbd29'], ['SALMON-pages-8', 'cacba3b'], ['SALMON-pages-8', 'f5dbc72'], ['SALMON-pages-8', 'f3b2417'],
      ['SALMON-pages-7', '90732f5'], ['SALMON-pages-7', '9c34e97'], ['SALMON-pages-7', '4492d17'],
    ]
    expect(PUBLIC_EXCLUSIONS.map((e) => [e.routeId, e.dataId]).sort()).toEqual(rows.sort())
    expect(PUBLIC_EXCLUSIONS.some((e) => e.dataId === '64afe52')).toBe(false)
    expect(RETAINED_ELEMENTS).toEqual([{ routeId: 'SALMON-pages-8', dataId: '64afe52' }])
  })

  it.runIf(existsPacket())('matches the Control Tower SEVEN_EXCLUSIONS.json rows (route, data-id, source key)', () => {
    const j = JSON.parse(readFileSync(PACKET, 'utf8')) as { exclusions?: Array<Record<string, string>> } | Array<Record<string, string>>
    const list = (Array.isArray(j) ? j : (j.exclusions ?? [])) as Array<Record<string, string>>
    const rows = list.map((r) => `${r.routeId}|${r.elementId}|${r.sourceKey}`).sort()
    expect(rows).toEqual(PUBLIC_EXCLUSIONS.map((e) => `${e.routeId}|${e.dataId}|${e.sourceKey}`).sort())
  })

  for (const routeId of ['SALMON-pages-8', 'SALMON-pages-7']) {
    it(`${routeId}: withheld elements become stubs at their own keys; siblings keep keys; nothing is added`, () => {
      const doc = source(routeId)
      const rules = PUBLIC_EXCLUSIONS.filter((e) => e.routeId === routeId)
      expect(withheldNodesIn(routeId, doc).sort()).toEqual(rules.map((r) => r.dataId).sort())
      const before = keys(doc.children)
      for (const r of rules) expect(before.get(r.dataId)).toBe(r.sourceKey)
      const { doc: out, removed, collapsed } = applyPublicExclusions(routeId, doc)
      expect(removed.sort()).toEqual(rules.map((r) => r.dataId).sort())
      expect(withheldNodesIn(routeId, out)).toEqual([])
      const after = keys(out.children as Node[])
      // Each withheld element is a stub at its own key, or inside a container that became a stub because all
      // of its element children were withheld (contract: no empty container).
      const collapsedKeys = collapsed.map((id) => after.get(id)).filter(Boolean) as string[]
      for (const r of rules) expect(after.get(r.dataId) === r.sourceKey || collapsedKeys.some((k) => r.sourceKey.startsWith(k + '.'))).toBe(true)
      for (const [id, k] of after) if (before.has(id)) expect(before.get(id)).toBe(k)
      expect(applyPublicExclusions(routeId, out as Doc).removed).toEqual([])
    })

    it(`${routeId}: withheld words leave rendered text, search text and editor slots (probe F3)`, () => {
      const doc = source(routeId)
      const composed = composePublicDocument({ routeId, path: routeId === 'SALMON-pages-8' ? '/industries/' : '/solutions/', family: 'salmon', title: String(doc.title), document: { ...doc, text: 'STALE SUMMARY ' + doc.text } })
      const search = publicBodyText('salmon', composed)
      expect(String(composed.text)).toBe(search)
      expect(search).not.toContain('STALE SUMMARY')
      const slots = extractSlots(applyPublicExclusions(routeId, doc).doc)
      for (const r of PUBLIC_EXCLUSIONS.filter((e) => e.routeId === routeId)) {
        const t = cardText(doc, r.dataId)
        expect(t.length).toBeGreaterThan(0)
        expect(search).not.toContain(t)
        expect(slots.some((s) => s.elementId === r.dataId)).toBe(false)
      }
    })
  }

  it('/industries/ keeps 64afe52 and every non-withheld card', () => {
    const { doc } = applyPublicExclusions('SALMON-pages-8', source('SALMON-pages-8'))
    const k = keys(doc.children as Node[])
    expect(k.has('64afe52')).toBe(true)
    expect(withheldNodesIn('SALMON-pages-8', doc)).toEqual([])
  })

  it('a stale stored document (import fixture from before the ruling) is excluded at composition', () => {
    const stale = source('SALMON-pages-8')
    const composed = composePublicDocument({ routeId: 'SALMON-pages-8', path: '/industries/', family: 'salmon', title: String(stale.title), document: stale })
    expect(withheldNodesIn('SALMON-pages-8', composed)).toEqual([])
  })

  it('an alias record is excluded by its source identity', () => {
    const stale = source('SALMON-pages-7')
    const composed = composePublicDocument({ routeId: 'ALIAS-x', path: '/x/', family: 'salmon', title: 't', document: stale, source: { aliasOf: 'SALMON-pages-7' } })
    expect(withheldNodesIn('SALMON-pages-7', composed)).toEqual([])
  })

  it('routes without rules pass through unchanged', () => {
    const d = source('SALMON-pages-48')
    expect(applyPublicExclusions('SALMON-pages-48', d).doc).toBe(d)
  })
})

function existsPacket(): boolean {
  try {
    readFileSync(PACKET)
    return true
  } catch {
    return false
  }
}
