import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { searchIndexRoot } from './config'
import { fault, currentRelease, retainedSearchDir, searchDirOf } from './release'
import { publicBodyText } from './projection-text'

/**
 * Publishing-driven public search (Pagefind Node API, custom records) — R1B candidate builder.
 *
 * The index is built from an unpromoted content candidate and written to its own unreferenced generation.
 * Promotion is not done here: ./release promotes the content+search pair together once both validate.
 * Only published PUBLIC `searchable` routes are indexed. Their content is the **derived public text** of the
 * composed document (./projection-text): the same projection the templates render, after exclusions.
 * An independently stored `text` summary is never indexed (Control Tower F2/F3).
 *
 * Each generation also records `fragments.json` (fragment file → URL), so the serving route can revoke a
 * withdrawn page's fragment before the next release lands (see ./revocation).
 */
type LedgerRow = { path: string; routeId: string; recordRouteId?: string; family: string; state: string; searchable: boolean; aliasOf?: string | null }
type Doc = Record<string, unknown>

/** The search generation of the promoted release (null when there is no valid release). */
export const currentSearchDir = (root = searchIndexRoot()): string | null => {
  const m = currentRelease()
  return m ? searchDirOf(m, root) : null
}

export type SearchBuild = { id: string; records: number; snapshot: string; builtAt: string; dir: string }

export async function buildSearchCandidate(snapshotDir: string, root = searchIndexRoot()): Promise<SearchBuild> {
  fault('search-build')
  const ledger = JSON.parse(readFileSync(path.join(snapshotDir, 'ledger.json'), 'utf8')) as { routes: LedgerRow[] }
  const manifest = JSON.parse(readFileSync(path.join(snapshotDir, 'manifest.json'), 'utf8')) as { id: string }
  const pagefind = await import('pagefind')
  const { index, errors } = await pagefind.createIndex({ forceLanguage: 'en' })
  if (!index || errors?.length) throw new Error(`pagefind createIndex: ${JSON.stringify(errors)}`)
  let records = 0
  try {
    for (const row of ledger.routes) {
      if (row.state !== 'PUBLIC' || !row.searchable) continue
      const source = row.aliasOf ?? row.recordRouteId ?? row.routeId
      const file = path.join(snapshotDir, 'documents', `${source}.json`)
      if (!existsSync(file)) continue
      const doc = JSON.parse(readFileSync(file, 'utf8')) as Doc
      const seoTitle = String((doc.seo as Doc | undefined)?.title ?? '')
      const title = String(doc.title || seoTitle || '')
      const content = publicBodyText(row.family === 'alias' ? 'salmon' : row.family, doc)
      if (!content.trim()) continue
      const r = await index.addCustomRecord({ url: row.path, content: `${title}\n${seoTitle}\n${content}`, language: 'en', meta: { title } })
      if (r.errors?.length) throw new Error(`pagefind addCustomRecord ${row.path}: ${JSON.stringify(r.errors)}`)
      records++
    }
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
    const dir = path.join(root, 'generations', id)
    mkdirSync(dir, { recursive: true })
    const w = await index.writeFiles({ outputPath: path.join(dir, 'pagefind') })
    if (w.errors?.length) throw new Error(`pagefind writeFiles: ${JSON.stringify(w.errors)}`)
    writeFileSync(path.join(dir, 'fragments.json'), JSON.stringify(fragmentMap(path.join(dir, 'pagefind', 'fragment'))))
    const build: SearchBuild = { id, records, snapshot: manifest.id, builtAt: new Date().toISOString(), dir }
    writeFileSync(path.join(dir, 'search-manifest.json'), JSON.stringify({ id, records, snapshot: manifest.id, builtAt: build.builtAt }))
    fault('after-search-candidate')
    return build
  } finally {
    await pagefind.close()
  }
}

/** fragment file name → public URL, decoded from the fragment bodies Pagefind wrote. */
function fragmentMap(dir: string): Record<string, string> {
  const map: Record<string, string> = {}
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return map
  }
  for (const n of names) {
    const raw = gunzipSync(readFileSync(path.join(dir, n))).toString('utf8')
    const json = raw.startsWith('pagefind_dcd') ? raw.slice('pagefind_dcd'.length) : raw
    try {
      map[n] = String((JSON.parse(json) as { url?: string }).url ?? '')
    } catch {
      map[n] = ''
    }
  }
  return map
}

const fragmentMaps = new Map<string, Record<string, string>>()
/** URL a fragment file of a generation belongs to ('' if unknown). */
export function fragmentUrl(genDir: string, file: string): string {
  let m = fragmentMaps.get(genDir)
  if (!m) {
    try {
      m = JSON.parse(readFileSync(path.join(genDir, 'fragments.json'), 'utf8')) as Record<string, string>
    } catch {
      m = {}
    }
    if (fragmentMaps.size > 8) fragmentMaps.clear()
    fragmentMaps.set(genDir, m)
  }
  return m[file] ?? ''
}

/**
 * Serve one file from a search generation: the pinned generation `generation` when given and still
 * retained, otherwise the promoted release's. Null for anything outside it.
 */
export function readSearchAsset(parts: string[], generation?: string | null, root = searchIndexRoot()): { bytes: Buffer; type: string; dir: string } | null {
  const dir = generation ? retainedSearchDir(generation, root) : currentSearchDir(root)
  if (!dir) return null
  const base = path.join(dir, 'pagefind')
  const file = path.resolve(base, ...parts)
  if (!file.startsWith(base + path.sep)) return null
  try {
    if (!statSync(file).isFile()) return null
    const ext = path.extname(file)
    const type =
      ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.json' ? 'application/json' : ext === '.wasm' ? 'application/wasm' : 'application/octet-stream'
    return { bytes: readFileSync(file), type, dir }
  } catch {
    return null
  }
}
