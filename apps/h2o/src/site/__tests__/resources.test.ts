/**
 * H2O Phase 2D — what the resource document listing may serve, and may say.
 *
 * The documents are the only non-image binaries the site serves, and their public paths are paths
 * the estate already has. These tests are about the two things that could go wrong: serving
 * something other than the recovered file, and saying something about a document that is not
 * evidenced.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { documentsFor, fileForDocPath } from '../resources'

const REPO = process.cwd()
const AUTHORITY = path.join(REPO, 'content', '2d-launch-cohort', 'RESOURCE_DOCUMENT_AUTHORITY.tsv')

const rows = (): Array<Record<string, string>> => {
  const lines = readFileSync(AUTHORITY, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
  const header = (lines[0] ?? '').split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row: Record<string, string> = {}
    header.forEach((name, i) => {
      row[name] = cells[i] ?? ''
    })
    return row
  })
}

describe('every recorded document is the recovered original', () => {
  it('exists, hashes to the recorded digest and is a PDF', () => {
    const all = rows()
    expect(all.length).toBe(12)
    for (const row of all) {
      const file = fileForDocPath(row.preserved_public_path)
      expect(file).not.toBeNull()
      expect(existsSync(file as string)).toBe(true)
      const bytes = readFileSync(file as string)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256)
      expect(String(bytes.length)).toBe(row.bytes)
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    }
  })

  it('refuses a path outside the preserved upload prefix', () => {
    for (const href of [
      '/etc/passwd',
      '/wp-content/uploads/2021/11/../../../etc/passwd',
      '/wp-content/uploads/2021/11/sub/dir.pdf',
      '/wp-content/uploads/2021/11/',
      '/wp-content/uploads/2021/11/not-a-pdf.png',
      '/media/cohort/17436.jpeg',
    ])
      expect(fileForDocPath(href)).toBeNull()
  })
})

describe('one document, one listing', () => {
  it('lists eleven documents from twelve preserved paths', () => {
    const all = rows()
    expect(new Set(all.map((r) => r.sha256)).size).toBe(11)
    expect(all.filter((r) => r.listed_on_resources_page === 'YES').length).toBe(11)
    expect(documentsFor('RT-1208').length).toBe(11)
  })

  it('still serves the duplicate path, so an existing link keeps working', () => {
    const dup = rows().filter((r) => r.is_primary_path === 'NO')
    expect(dup.length).toBe(1)
    for (const row of dup) {
      expect(existsSync(fileForDocPath(row.preserved_public_path) as string)).toBe(true)
      expect(row.duplicate_of).toMatch(/^DOC-/)
    }
  })

  it('lists documents on no route but /resources/', () => {
    expect(documentsFor('RT-0001')).toEqual([])
    expect(documentsFor('RT-0335')).toEqual([])
  })
})

describe('nothing about a document is invented', () => {
  it('records description, date, revision and applicability as not evidenced', () => {
    for (const row of rows())
      for (const field of [
        'document_description',
        'document_date',
        'document_revision',
        'product_applicability',
      ])
        expect(row[field]).toBe('NOT_EVIDENCED_NOT_INVENTED')
  })

  it('derives every label from the document filename', () => {
    for (const row of rows()) {
      const stem = path.basename(row.preserved_public_path, '.pdf')
      expect(row.display_label).toBe(stem.replace(/[-_]+/g, ' ').trim())
      expect(row.title_basis).toMatch(/^FILENAME_DERIVED/)
    }
  })

  it('preserves the path the estate already has', () => {
    for (const row of rows())
      expect(row.preserved_public_path).toBe(`/wp-content/uploads/${row.source_uploads_rel_path}`)
  })

  it('renders no document as an image', () => {
    for (const row of rows()) expect(row.rendered_as_image).toBe('NO')
  })
})
