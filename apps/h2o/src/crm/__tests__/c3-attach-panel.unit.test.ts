/**
 * 1.3a-C3: the Files panel (with "Up to 25 MB each, 50 per record") is shown only when an attach store is configured.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { attachStoreConfigured } from '../attachments/store'

describe('attachStoreConfigured', () => {
  it('is false when no store is selected (storage OFF), however the variable is empty or blank', () => {
    expect(attachStoreConfigured({})).toBe(false)
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: '' })).toBe(false)
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: '   ' })).toBe(false)
  })
  it('is false for a store that is selected but cannot work: missing directory, missing R2 settings, an unknown kind, a relative directory', () => {
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: 'volume' })).toBe(false)
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: 'volume', H2O_ATTACH_DIR: 'relative/dir' })).toBe(false)
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: 'r2' })).toBe(false)
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: 'r2', H2O_ATTACH_R2_ENDPOINT: 'https://x.example' })).toBe(false)
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: 'ftp' })).toBe(false)
  })
  it('is true for a configured volume or R2 store, and sends nothing to build the check', () => {
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: 'volume', H2O_ATTACH_DIR: '/var/lib/h2o-attach' })).toBe(true)
    expect(attachStoreConfigured({ H2O_ATTACH_STORE: 'r2', H2O_ATTACH_R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com', H2O_ATTACH_R2_BUCKET: 'synthetic-bucket', H2O_ATTACH_R2_ACCESS_KEY_ID: 'synthetic-id', H2O_ATTACH_R2_SECRET_ACCESS_KEY: 'synthetic-secret' })).toBe(true)
  })
})

describe('the panel', () => {
  const src = readFileSync(path.join(process.cwd(), 'src/app/(crm)/crm/_components/AttachmentsPanel.tsx'), 'utf8')
  it('returns nothing, before reading any record or file, when the store is not configured', () => {
    const at = (needle: string) => src.indexOf(needle)
    expect(at('if (!attachStoreConfigured(process.env)) return null')).toBeGreaterThan(0)
    expect(at('if (!attachStoreConfigured(process.env)) return null')).toBeLessThan(at('canSeeRecord(s, kind, recordId)'))
    expect(at('if (!attachStoreConfigured(process.env)) return null')).toBeLessThan(at('listAttachments(s, kind, recordId)'))
  })
  it('keeps the panel itself unchanged when a store is configured (heading, uploader, limit line, list)', () => {
    expect(src).toContain('<h2 id="files-h">Files</h2>')
    expect(src).toContain('<AttachmentUploader kind={kind} recordId={recordId} accept={ACCEPT_ATTRIBUTE} limitLabel={limitLabel(process.env)} />')
    expect(src).toContain('No files attached yet.')
  })
})
