import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { safeUploadUrl, TYPEFORM_UPLOAD_HOSTS, UPLOAD_LINK_HINT, uploadLinkView } from '../upload-link'

/** IMPORT-TYPEFORM-1.1 (Security Auditor notes on IMPORT-TYPEFORM-1). Synthetic links only. */
const host = TYPEFORM_UPLOAD_HOSTS[0]
const GOOD = `https://${host}/responses/files/synthetic-file/drawing.pdf`

describe('the uploaded-file link at render time (defence in depth)', () => {
  it('a stored link that passes the rule is a link; one that fails is plain text; none is nothing', () => {
    expect(uploadLinkView(GOOD)).toEqual({ kind: 'link', href: GOOD })
    for (const bad of [`http://${host}/x`, 'https://evil.example/x', `https://user:pw@${host}/x`, 'javascript:alert(1)', `https://${host}.evil.example/x`, `https://${host}:8443/x`])
      expect(uploadLinkView(bad), bad).toEqual({ kind: 'text', text: bad })
    expect(uploadLinkView('  ')).toBeNull()
    expect(uploadLinkView(null)).toBeNull()
    expect(safeUploadUrl(GOOD)).toBe(GOOD)
  })
  it('the hint says the file is the sender\'s, not scanned, and to open it in a safe viewer', () => {
    expect(UPLOAD_LINK_HINT).toContain('Uploaded by the sender; not scanned. Open it in a safe viewer.')
  })
  it('the contact page builds the link only through uploadLinkView (never from the stored value directly)', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/(crm)/crm/contacts/[id]/page.tsx'), 'utf8')
    expect(page).toMatch(/uploadLinkView\(q\.uploadUrl\)/)
    expect(page).toMatch(/href=\{up\.href\}/)
    expect(page).not.toMatch(/href=\{q\.uploadUrl\}/)
    expect(page).toMatch(/rel="noopener noreferrer"/)
  })
  it('N-2: no export or sheet path includes past requests (a future one must neutralise formula characters first)', () => {
    for (const f of ['src/crm/export/csv-export.ts', 'src/sheets/row.ts', 'src/sheets/sync.ts'])
      expect(readFileSync(path.join(process.cwd(), f), 'utf8'), f).not.toMatch(/crm-historical-inquiries|historical_inquir|pastRequests/)
  })
})
