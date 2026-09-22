import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export type SourceNode = string | {
  tag: string
  attrs: Record<string, string | number>
  children: SourceNode[]
}
export type SourceArticle = {
  routeId: string
  route: string
  sourceUrl: string
  sourceSha256: string
  title: string
  author: string
  date: string
  children: SourceNode[]
  featured: SourceNode | null
  headings: string[]
  text: string
  stats: Record<string, number>
}
const root = path.join(process.cwd(), 'content/r41-articles')

/** The current-published-source overlay does not mutate or bypass the frozen cohort hashes. */
export const sourceArticleFor = (routeId: string): SourceArticle => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')) as Array<{
    routeId: string; route: string; file: string; sha256: string
  }>
  const row = manifest.find((entry) => entry.routeId === routeId)
  if (!row || row.file !== `${routeId}.json`) throw new Error(`Missing source article ${routeId}`)
  const raw = readFileSync(path.join(root, row.file), 'utf8')
  if (createHash('sha256').update(raw).digest('hex') !== row.sha256) {
    throw new Error(`Source article integrity failure: ${routeId}`)
  }
  const doc = JSON.parse(raw) as SourceArticle
  if (doc.routeId !== routeId || doc.route !== row.route) throw new Error('Source route mismatch')
  return doc
}

export const sourceText = (node: SourceNode): string =>
  typeof node === 'string' ? node : node.children.map(sourceText).join('')

/** Every node is carried exactly once, including the introduction before the first H2. */
export const sourceSections = (nodes: SourceNode[]): SourceNode[][] => {
  const sections: SourceNode[][] = [[]]
  for (const node of nodes) {
    if (typeof node !== 'string' && node.tag === 'h2') sections.push([])
    sections[sections.length - 1]!.push(node)
  }
  return sections
}
