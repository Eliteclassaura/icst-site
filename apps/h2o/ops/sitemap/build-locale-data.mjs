/**
 * Locale sitemap data from OGCS Locale Preservation Part A (accepted by Control Tower 2026-10-05). Offline.
 *
 *   node ops/sitemap/build-locale-data.mjs <PART_A.tsv> <HREFLANG_CLUSTERS.tsv>
 *
 * Writes content/locale/sitemap-locale.json:
 *   - languages: decoded path → language for every Part A URL decided 200 PRESERVE (its sitemap child);
 *   - clusters: the hreflang clusters (ja, th, id, vi, en, x-default), as decided. OMIT and NONE pages are not
 *     in the cluster file. The publish-at-cutover condition needs no flag: the sitemap only emits alternates
 *     between members that are themselves listed, so a member that is not served drops out of every page.
 * The source files' SHA-256 are recorded so a later Part A revision is visible in review.
 * contentLanguages: a page whose content is in another language than its URL slot (Part A OMIT, e.g. the swapped /th/ ↔ /ja/
 * pair): its <html lang> follows the content; it carries no hreflang until the language is fixed (CT ruling 2026-10-05).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const [partA, clustersFile] = process.argv.slice(2)
if (!partA || !clustersFile) throw new Error('usage: build-locale-data.mjs <PART_A.tsv> <HREFLANG_CLUSTERS.tsv>')
const tsv = (f) => {
  const [head, ...lines] = readFileSync(f, 'utf8').replace(/\r/g, '').trim().split('\n')
  const cols = head.split('\t')
  return lines.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])))
}
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
const decodedPath = (u) => decodeURIComponent(new URL(u).pathname)
const ORIGIN = 'https://h2ocooling.com'

const languages = {}
const contentLanguages = {}
for (const r of tsv(partA)) {
  if (r.final_state !== '200') continue
  if (!r.url.startsWith(ORIGIN + '/')) throw new Error(`not an h2ocooling.com URL: ${r.url}`)
  languages[decodedPath(r.url)] = r.language
  const omit = /^OMIT \(content language ([a-z]{2}) does not match/.exec(r.hreflang)
  if (omit) contentLanguages[decodedPath(r.url)] = omit[1]
}
const groups = new Map()
for (const r of tsv(clustersFile)) {
  if (!['ja', 'th', 'id', 'vi', 'en', 'x-default'].includes(r.hreflang)) throw new Error(`unexpected hreflang ${r.hreflang}`)
  groups.set(r.polylang_group, [...(groups.get(r.polylang_group) ?? []), { hreflang: r.hreflang, url: ORIGIN + decodedPath(r.url) }])
}
const seen = new Map()
for (const [g, members] of groups) {
  for (const m of members) {
    if (m.hreflang === 'x-default') continue
    if (seen.has(m.url) && seen.get(m.url) !== g) throw new Error(`${m.url} is in two clusters (${seen.get(m.url)}, ${g})`)
    seen.set(m.url, g)
  }
  if (new Set(members.map((m) => m.hreflang)).size !== members.length) throw new Error(`cluster ${g} repeats an hreflang`)
}
const out = {
  source: { partA: { file: path.basename(partA), sha256: sha(partA) }, clusters: { file: path.basename(clustersFile), sha256: sha(clustersFile) } },
  languages: Object.fromEntries(Object.entries(languages).sort(([a], [b]) => a.localeCompare(b))),
  contentLanguages,
  clusters: [...groups.values()],
}
writeFileSync(path.join(APP, 'content/locale/sitemap-locale.json'), JSON.stringify(out, null, 1) + '\n')
process.stdout.write(JSON.stringify({ languages: Object.keys(languages).length, contentLanguages, clusters: groups.size, members: [...groups.values()].flat().length }) + '\n')
