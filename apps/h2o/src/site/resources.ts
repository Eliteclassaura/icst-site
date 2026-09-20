/**
 * H2O Phase 2D — the recovered resource documents, loaded from the accepted authority file.
 *
 * Twelve PDFs are associated with `/resources/` by WordPress `post_parent`. Eleven are distinct
 * documents: two of the twelve paths carry byte-identical content, because the same file was
 * uploaded twice. Both paths are served, because either may already be indexed or linked from
 * outside, and the document is listed once, because it is one document.
 *
 * Three properties are enforced here rather than described:
 *
 *   1. **Each file is hashed on load** against the authority's digest, so a listed document is
 *      provably the recovered original.
 *   2. **A path must sit under the preserved upload prefix** and be a plain `.pdf` basename, so the
 *      authority cannot point the listing at anything else in the tree.
 *   3. **Only primary paths are listed.** A duplicate path stays served and stays out of the list.
 *
 * The public path is the one the estate already has — `/wp-content/uploads/2021/11/<Name>.pdf`.
 * Preserving it is the same principle PV-05 applies to pages: an existing URL keeps working.
 *
 * Nothing here describes a document. Descriptions, dates, revisions and product applicability are
 * recorded in the authority as `NOT_EVIDENCED_NOT_INVENTED` and are not rendered. The label is the
 * document's own filename with separators as spaces, and the page count is read from the binary.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const AUTHORITY = 'RESOURCE_DOCUMENT_AUTHORITY.tsv'

/** The one prefix a resource document may be served from. */
const DOC_PREFIX = '/wp-content/uploads/2021/11/'

export type ResourceDocument = {
  attachmentId: string
  bytes: number
  href: string
  label: string
  logicalDocumentId: string
  pageCount: number | null
  sha256: string
}

let documents: ResourceDocument[] | null = null

/** The file a public path names, or `null` if it is not a plain PDF basename under the prefix. */
export const fileForDocPath = (href: string): string | null => {
  if (!href.startsWith(DOC_PREFIX)) return null
  const name = href.slice(DOC_PREFIX.length)
  if (name === '' || name !== path.basename(name) || !name.toLowerCase().endsWith('.pdf')) return null
  return path.join(process.cwd(), 'public', 'wp-content', 'uploads', '2021', '11', name)
}

const load = (): ResourceDocument[] => {
  const file = path.join(process.cwd(), 'content', '2d-launch-cohort', AUTHORITY)
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
  const header = (lines[0] ?? '').split('\t')
  const out: ResourceDocument[] = []

  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const row: Record<string, string> = {}
    header.forEach((name, i) => {
      row[name] = cells[i] ?? ''
    })

    const target = fileForDocPath(row.preserved_public_path)
    if (target === null)
      throw new Error(
        `${AUTHORITY}: ${row.preserved_public_path} is not a PDF under ${DOC_PREFIX}; refusing to serve it`,
      )

    const actual = createHash('sha256').update(readFileSync(target)).digest('hex')
    if (actual !== row.sha256)
      throw new Error(
        `${AUTHORITY}: ${row.preserved_public_path} is ${actual}, the authority records ${row.sha256}. The served document is not the recovered original.`,
      )

    if (row.listed_on_resources_page !== 'YES') continue

    const pages = Number(row.page_count)
    out.push({
      attachmentId: row.attachment_id,
      bytes: Number(row.bytes),
      href: row.preserved_public_path,
      label: row.display_label,
      logicalDocumentId: row.logical_document_id,
      pageCount: Number.isFinite(pages) && pages > 0 ? pages : null,
      sha256: row.sha256,
    })
  }
  return out
}

/** The documents listed on a route, in authority order. Empty for every route but `/resources/`. */
export const documentsFor = (routeId: string): ResourceDocument[] => {
  if (routeId !== 'RT-1208') return []
  documents = documents ?? load()
  return documents
}

export const resetResourceCache = (): void => {
  documents = null
}
