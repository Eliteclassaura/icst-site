import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  archiveRefusal,
  attachmentLimits,
  contentDisposition,
  displayName,
  validateAttachment,
  zipEntryNames,
  type Limits,
} from '../attachments/validate'

/**
 * CRM-ATTACH-1: the allowlist, the magic bytes, the executable and markup refusals, the zip entry checks, and the
 * download headers. The fixtures are real signatures (plus small bodies), not files from anywhere else.
 */
const LIMITS: Limits = { maxBytes: 1024 * 1024, maxPerRecord: 50, maxUserBytesPerDay: 1024 * 1024 * 1024, maxTotalBytes: 1024 * 1024 * 1024 }
const enc = (s: string) => new TextEncoder().encode(s)
const bytes = (...n: number[]) => Uint8Array.from(n)

/** A zip with the given entry names and no compression: a local header per entry, then the central directory. */
function makeZip(names: string[]): Uint8Array {
  const parts: number[] = []
  const central: number[] = []
  const le = (arr: number[], v: number, n: number) => {
    for (let i = 0; i < n; i++) arr.push((v >>> (8 * i)) & 0xff)
  }
  for (const name of names) {
    const nb = Array.from(enc(name))
    const local = parts.length
    le(parts, 0x04034b50, 4); le(parts, 20, 2); le(parts, 0, 2); le(parts, 0, 2); le(parts, 0, 2); le(parts, 0, 2)
    le(parts, 0, 4); le(parts, 0, 4); le(parts, 0, 4); le(parts, nb.length, 2); le(parts, 0, 2)
    parts.push(...nb)
    le(central, 0x02014b50, 4); le(central, 20, 2); le(central, 20, 2); le(central, 0, 2); le(central, 0, 2)
    le(central, 0, 2); le(central, 0, 2); le(central, 0, 4); le(central, 0, 4); le(central, 0, 4)
    le(central, nb.length, 2); le(central, 0, 2); le(central, 0, 2); le(central, 0, 2); le(central, 0, 2)
    le(central, 0, 4); le(central, local, 4)
    central.push(...nb)
  }
  const cdStart = parts.length
  const eocd: number[] = []
  le(eocd, 0x06054b50, 4); le(eocd, 0, 2); le(eocd, 0, 2); le(eocd, names.length, 2); le(eocd, names.length, 2)
  le(eocd, central.length, 4); le(eocd, cdStart, 4); le(eocd, 0, 2)
  return Uint8Array.from([...parts, ...central, ...eocd])
}

const PDF = enc('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n')
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16)
const WEBP = Uint8Array.from([...enc('RIFF'), 0, 0, 0, 0, ...enc('WEBP'), 0, 0])
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0)
const DWG = enc('AC1032\0\0\0')
const DXF = enc('  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n  0\nEOF\n')

describe('what may be attached', () => {
  it('accepts each allowed type when its bytes match', () => {
    expect(validateAttachment('quote.pdf', PDF, LIMITS)).toMatchObject({ ok: true, extension: 'pdf', mime: 'application/pdf' })
    expect(validateAttachment('photo.PNG', PNG, LIMITS)).toMatchObject({ ok: true, extension: 'png' })
    expect(validateAttachment('site.jpeg', JPG, LIMITS)).toMatchObject({ ok: true, extension: 'jpeg' })
    expect(validateAttachment('pic.webp', WEBP, LIMITS)).toMatchObject({ ok: true })
    expect(validateAttachment('old.doc', OLE, LIMITS)).toMatchObject({ ok: true })
    expect(validateAttachment('spec.dwg', DWG, LIMITS)).toMatchObject({ ok: true })
    expect(validateAttachment('part.dxf', DXF, LIMITS)).toMatchObject({ ok: true })
    expect(validateAttachment('list.csv', enc('name,qty\nPump,2\n'), LIMITS)).toMatchObject({ ok: true })
    expect(validateAttachment('notes.txt', enc('Customer wants a quote by Friday.\n'), LIMITS)).toMatchObject({ ok: true })
  })

  it('refuses an extension that is not on the allowlist, whatever the bytes', () => {
    for (const name of ['run.exe', 'page.html', 'icon.svg', 'script.js', 'mac.app', 'x.php', 'noext']) {
      expect(validateAttachment(name, PDF, LIMITS), name).toMatchObject({ ok: false, code: 'TYPE_NOT_ALLOWED' })
    }
  })

  it('refuses bytes that do not match the extension (magic bytes, not the name)', () => {
    expect(validateAttachment('fake.pdf', enc('<html>not a pdf</html>'), LIMITS)).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
    expect(validateAttachment('fake.png', PDF, LIMITS)).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
    expect(validateAttachment('fake.webp', enc('RIFF0000WAVE'), LIMITS)).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
    expect(validateAttachment('fake.dwg', enc('PK\x03\x04junk'), LIMITS)).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
  })

  it('refuses executables and scripts even when they are renamed to an allowed type', () => {
    const mz = bytes(0x4d, 0x5a, 0x90, 0)
    const elf = bytes(0x7f, 0x45, 0x4c, 0x46, 2, 1)
    const macho = bytes(0xcf, 0xfa, 0xed, 0xfe, 7, 0)
    const shebang = enc('#!/bin/sh\nrm -rf x\n')
    expect(validateAttachment('invoice.pdf', mz, LIMITS)).toMatchObject({ ok: false, code: 'EXECUTABLE_REFUSED' })
    expect(validateAttachment('invoice.pdf', elf, LIMITS)).toMatchObject({ ok: false, code: 'EXECUTABLE_REFUSED' })
    expect(validateAttachment('invoice.csv', macho, LIMITS)).toMatchObject({ ok: false, code: 'EXECUTABLE_REFUSED' })
    expect(validateAttachment('notes.txt', shebang, LIMITS)).toMatchObject({ ok: false, code: 'EXECUTABLE_REFUSED' })
  })

  it('refuses markup inside text files and DXF', () => {
    expect(validateAttachment('readme.txt', enc('hello <script>alert(1)</script>'), LIMITS)).toMatchObject({ ok: false, code: 'MARKUP_REFUSED' })
    expect(validateAttachment('list.csv', enc('a,b\n<svg onload=x>'), LIMITS)).toMatchObject({ ok: false, code: 'MARKUP_REFUSED' })
  })

  it('refuses empty files and files over the limit', () => {
    expect(validateAttachment('a.pdf', new Uint8Array(0), LIMITS)).toMatchObject({ ok: false, code: 'EMPTY' })
    const big = new Uint8Array(LIMITS.maxBytes + 1)
    big.set(PDF)
    expect(validateAttachment('big.pdf', big, LIMITS)).toMatchObject({ ok: false, code: 'TOO_LARGE' })
  })

  it('refuses a zip-based file whose entries include a program, a script, markup or a path out of the archive', () => {
    expect(validateAttachment('bundle.zip', makeZip(['a.txt', 'setup.exe']), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
    expect(validateAttachment('bundle.zip', makeZip(['docs/run.ps1']), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
    expect(validateAttachment('bundle.zip', makeZip(['index.html']), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
    expect(validateAttachment('bundle.zip', makeZip(['../../evil.txt']), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
    expect(validateAttachment('bundle.zip', makeZip(['/etc/passwd']), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
    expect(validateAttachment('bundle.zip', makeZip(['drawings/site.dwg', 'quote.pdf']), LIMITS)).toMatchObject({ ok: true, mime: 'application/zip' })
  })

  it('refuses an archive it cannot read', () => {
    expect(validateAttachment('bundle.zip', enc('PK\x03\x04 no central directory'), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_UNREADABLE' })
  })

  it('reads entry names from the central directory', () => {
    expect(zipEntryNames(makeZip(['a.txt', 'b/c.pdf']))).toEqual(['a.txt', 'b/c.pdf'])
    expect(archiveRefusal(['x/y.bat'])).toBe('ARCHIVE_REFUSED')
  })
})

describe('names and headers', () => {
  it('keeps only the file name, without folders or control characters, and bounds its length', () => {
    expect(displayName('C:\\Users\\sam\\quote.pdf')).toBe('quote.pdf')
    expect(displayName('../../etc/passwd.txt')).toBe('passwd.txt')
    expect(displayName('bad\u0000name.pdf')).toBe('badname.pdf')
    expect(displayName('..')).toBeNull()
    expect(displayName('x'.repeat(300) + '.pdf')!.length).toBe(180)
  })

  it('serves a download as an attachment with a safe ASCII fallback and the RFC 5987 name', () => {
    const cd = contentDisposition('Quote “Final”; v2.pdf')
    expect(cd).toMatch(/^attachment; filename="Quote _Final__ v2\.pdf"; filename\*=UTF-8''/)
    expect(cd).not.toMatch(/[\r\n]/)
    expect(cd).toContain(encodeURIComponent('Quote “Final”; v2.pdf').slice(0, 10))
  })

  it('reads the owner defaults and the environment overrides', () => {
    expect(attachmentLimits({})).toEqual({ maxBytes: 25 * 1024 * 1024, maxPerRecord: 50, maxUserBytesPerDay: 500 * 1024 * 1024, maxTotalBytes: 2048 * 1024 * 1024 })
    expect(attachmentLimits({ H2O_ATTACH_MAX_MB: '5', H2O_ATTACH_MAX_PER_RECORD: '10' })).toMatchObject({ maxBytes: 5 * 1024 * 1024, maxPerRecord: 10 })
    expect(attachmentLimits({ H2O_ATTACH_MAX_USER_MB_PER_DAY: '50', H2O_ATTACH_MAX_TOTAL_MB: '100' })).toMatchObject({ maxUserBytesPerDay: 50 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 })
    expect(attachmentLimits({ H2O_ATTACH_MAX_MB: 'nope' }).maxBytes).toBe(25 * 1024 * 1024)
  })
})

/** ATTACH-1.1 (Auditor C1): real Office files are zip archives whose parts are XML and sometimes .bin. They must pass. */
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, 'fixtures', 'attach', name)))
describe('real Office files (ATTACH-1.1, Auditor C1)', () => {
  it('accepts a real Word document and a real Excel workbook (their parts are .xml)', () => {
    expect(validateAttachment('Quote.docx', fixture('real.docx'), LIMITS)).toMatchObject({ ok: true, extension: 'docx' })
    expect(validateAttachment('Quantities.xlsx', fixture('real.xlsx'), LIMITS)).toMatchObject({ ok: true, extension: 'xlsx' })
  })

  it('refuses an Office file that carries a macro project, whatever the extension', () => {
    expect(validateAttachment('Quote.docx', fixture('macro.docx'), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
    expect(validateAttachment('Quantities.xlsx', fixture('macro.xlsx'), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
  })

  it('a plain zip still refuses xml and binary parts (the stricter list), and an Office file still refuses an executable', () => {
    expect(validateAttachment('bundle.zip', makeZip(['data/export.xml']), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
    expect(validateAttachment('bundle.zip', makeZip(['data/blob.bin']), LIMITS)).toMatchObject({ ok: false, code: 'ARCHIVE_REFUSED' })
    expect(archiveRefusal(['word/document.xml', 'word/media/logo.png'], true)).toBeNull()
    expect(archiveRefusal(['word/tools/setup.exe'], true)).toBe('ARCHIVE_REFUSED')
  })
})
