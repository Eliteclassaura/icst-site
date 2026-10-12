/**
 * CRM-ATTACH-1: what may be attached, decided from the bytes as well as the name.
 *
 *   - the extension must be on the allowlist, AND the first bytes must be what that type starts with (magic bytes);
 *   - executables, shebang scripts and markup (HTML, SVG, XML with script) are refused whatever the name says;
 *   - zip-based files (ZIP, DOCX, XLSX) are refused when an entry is an executable, a script, markup or a path that
 *     climbs out of the archive. Entry NAMES are read from the central directory; entry contents are not decompressed;
 *   - empty files and files over the size limit are refused.
 *
 * The stored file is never named after the upload and is served only as an attachment (see `contentDisposition`).
 */

export type AttachmentCode =
  | 'EMPTY'
  | 'TOO_LARGE'
  | 'TYPE_NOT_ALLOWED'
  | 'CONTENT_MISMATCH'
  | 'EXECUTABLE_REFUSED'
  | 'MARKUP_REFUSED'
  | 'ARCHIVE_REFUSED'
  | 'ARCHIVE_UNREADABLE'
  | 'NAME_INVALID'

const enc = new TextEncoder()
const ascii = (s: string) => Array.from(enc.encode(s))
const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => sig.every((v, i) => b[at + i] === v)
const PDF = ascii('%PDF-')
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPG = [0xff, 0xd8, 0xff]
const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04]
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06]
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

/** Refused outright: Windows PE, ELF, Mach-O (both byte orders and the fat header), shebang scripts. */
const EXECUTABLE_SIGNATURES = [
  [0x4d, 0x5a], // MZ
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe],
  [0x23, 0x21], // #!
]

/**
 * Entry names (inside a zip) that are refused in every archive: programs, scripts, markup. A plain .zip also refuses XML and
 * binary parts; Office files (DOCX, XLSX) cannot, because their own parts are XML (ATTACH-1.1, Auditor C1).
 */
const ARCHIVE_ALWAYS = new Set([
  'exe', 'dll', 'com', 'scr', 'msi', 'msp', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta',
  'jar', 'app', 'dmg', 'pkg', 'lnk', 'cpl', 'reg', 'inf', 'sh', 'php', 'html', 'htm', 'xhtml', 'svg',
])
export const FORBIDDEN_ARCHIVE_EXTENSIONS = new Set([...ARCHIVE_ALWAYS, 'xml', 'bin'])

/** An Office macro project or an ActiveX control: both can run code when the file is opened. Refused in DOCX and XLSX. */
const OFFICE_MACRO_PART = /(^|\/)(vbaproject\.bin|activex\/)/i

type Check = 'pdf' | 'ole' | 'zip' | 'png' | 'jpg' | 'webp' | 'text' | 'dwg' | 'dxf'

const TYPES: Record<string, { mime: string; check: Check; archive?: boolean; office?: boolean }> = {
  pdf: { mime: 'application/pdf', check: 'pdf' },
  doc: { mime: 'application/msword', check: 'ole' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', check: 'zip', archive: true, office: true },
  xls: { mime: 'application/vnd.ms-excel', check: 'ole' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', check: 'zip', archive: true, office: true },
  csv: { mime: 'text/csv', check: 'text' },
  txt: { mime: 'text/plain', check: 'text' },
  png: { mime: 'image/png', check: 'png' },
  jpg: { mime: 'image/jpeg', check: 'jpg' },
  jpeg: { mime: 'image/jpeg', check: 'jpg' },
  webp: { mime: 'image/webp', check: 'webp' },
  zip: { mime: 'application/zip', check: 'zip', archive: true },
  dwg: { mime: 'application/acad', check: 'dwg' },
  dxf: { mime: 'application/dxf', check: 'dxf' },
}

export const ATTACHMENT_EXTENSIONS = Object.keys(TYPES)

/** Owner-set caps: per file, per record, per person per day (bytes), and in total for the store (bytes). */
export type Limits = { maxBytes: number; maxPerRecord: number; maxUserBytesPerDay: number; maxTotalBytes: number }

/** Owner defaults: 25 MB per file, 50 per record. Both are environment-tunable (H2O_ATTACH_MAX_MB, H2O_ATTACH_MAX_PER_RECORD). */
export function attachmentLimits(env: Record<string, string | undefined>): Limits {
  const mb = Number(env.H2O_ATTACH_MAX_MB)
  const per = Number(env.H2O_ATTACH_MAX_PER_RECORD)
  const userMb = Number(env.H2O_ATTACH_MAX_USER_MB_PER_DAY)
  const totalMb = Number(env.H2O_ATTACH_MAX_TOTAL_MB)
  const MB = 1024 * 1024
  return {
    maxBytes: Math.round((Number.isFinite(mb) && mb > 0 ? Math.min(mb, 200) : 25) * MB),
    maxPerRecord: Number.isInteger(per) && per > 0 ? Math.min(per, 500) : 50,
    // ATTACH-1.1 (Auditor C3): a person may add at most this much per day (default 500 MB), and the whole store at most
    // this much (default 2 GB: the volume fallback sits on the 14 GB system disk; R2 is the target).
    maxUserBytesPerDay: Math.round((Number.isFinite(userMb) && userMb > 0 ? Math.min(userMb, 10240) : 500) * MB),
    maxTotalBytes: Math.round((Number.isFinite(totalMb) && totalMb > 0 ? Math.min(totalMb, 102400) : 2048) * MB),
  }
}

/** The name the person sees: no folders, no control characters, bounded length; the extension is kept. */
export function displayName(raw: string): string | null {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!clean || clean === '.' || clean === '..') return null
  return clean.length > 180 ? clean.slice(0, 180) : clean
}

export const extensionOf = (name: string): string => (name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '')

/** A plain ASCII fallback plus the RFC 5987 form, so any browser gets the right name and nothing is injected. */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\;]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

const startsWithAny = (b: Uint8Array, list: number[][]) => list.some((sig) => startsWith(b, sig))

const isText = (b: Uint8Array): boolean => {
  for (let i = 0; i < b.length; i++) {
    const c = b[i]!
    if (c === 0) return false
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0c) return false
  }
  return true
}

const MARKUP = /<\s*(script|html|svg|iframe|object|embed|body|img)\b|<\?xml|<!doctype/i
const hasMarkup = (b: Uint8Array) => MARKUP.test(new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 8192)))

/**
 * The zip's entry names, from the central directory (the authoritative list). `null` when the archive is not readable.
 * Bounded: at most 5000 entries.
 */
export function zipEntryNames(b: Uint8Array): string[] | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const start = Math.max(0, b.length - 22 - 65535)
  let eocd = -1
  for (let i = b.length - 22; i >= start; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  if (count > 5000 || at >= b.length) return null
  const names: string[] = []
  const dec = new TextDecoder('utf-8', { fatal: false })
  for (let n = 0; n < count; n++) {
    if (at + 46 > b.length || view.getUint32(at, true) !== 0x02014b50) return null
    const nameLen = view.getUint16(at + 28, true)
    const extra = view.getUint16(at + 30, true)
    const comment = view.getUint16(at + 32, true)
    if (at + 46 + nameLen > b.length) return null
    names.push(dec.decode(b.subarray(at + 46, at + 46 + nameLen)))
    at += 46 + nameLen + extra + comment
  }
  return names
}

/**
 * Refused archive entries: an executable or script extension, markup, a path that is absolute or climbs out, and for Office
 * files a macro project or an ActiveX part. `office` selects the Office list (DOCX and XLSX); a plain zip uses the stricter one.
 */
export function archiveRefusal(names: string[], office = false): AttachmentCode | null {
  const forbidden = office ? ARCHIVE_ALWAYS : FORBIDDEN_ARCHIVE_EXTENSIONS
  for (const raw of names) {
    const name = raw.replace(/\\/g, '/')
    if (name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.split('/').includes('..')) return 'ARCHIVE_REFUSED'
    if (office && OFFICE_MACRO_PART.test(name)) return 'ARCHIVE_REFUSED'
    const ext = extensionOf(name.split('/').pop() ?? '')
    if (forbidden.has(ext)) return 'ARCHIVE_REFUSED'
  }
  return null
}

export type Validated = { ok: true; extension: string; mime: string } | { ok: false; code: AttachmentCode; message: string }

const MESSAGE: Record<AttachmentCode, string> = {
  EMPTY: 'That file is empty.',
  TOO_LARGE: 'That file is larger than the limit.',
  TYPE_NOT_ALLOWED: 'That file type cannot be attached. Allowed: PDF, Word, Excel, CSV, text, PNG, JPG, WEBP, ZIP, DWG and DXF.',
  CONTENT_MISMATCH: 'The file contents do not match its extension, so it was not attached.',
  EXECUTABLE_REFUSED: 'Programs and scripts cannot be attached.',
  MARKUP_REFUSED: 'Web pages and markup cannot be attached.',
  ARCHIVE_REFUSED: 'This archive contains a program, script or web page, so it was not attached.',
  ARCHIVE_UNREADABLE: 'This archive could not be read, so it was not attached.',
  NAME_INVALID: 'The file needs a name.',
}

/** Decide whether these bytes may be attached under this name. Pure: no storage, no database. */
export function validateAttachment(rawName: string, bytes: Uint8Array, limits: Limits): Validated {
  const name = displayName(rawName)
  const fail = (code: AttachmentCode): Validated => ({ ok: false, code, message: MESSAGE[code] })
  if (!name) return fail('NAME_INVALID')
  if (bytes.length === 0) return fail('EMPTY')
  if (bytes.length > limits.maxBytes) return fail('TOO_LARGE')
  if (startsWithAny(bytes, EXECUTABLE_SIGNATURES)) return fail('EXECUTABLE_REFUSED')
  const ext = extensionOf(name)
  const type = TYPES[ext]
  if (!type) return fail('TYPE_NOT_ALLOWED')
  switch (type.check) {
    case 'pdf':
      if (!startsWith(bytes, PDF)) return fail('CONTENT_MISMATCH')
      break
    case 'ole':
      if (!startsWith(bytes, OLE)) return fail('CONTENT_MISMATCH')
      break
    case 'zip':
      if (!startsWith(bytes, ZIP_LOCAL) && !startsWith(bytes, ZIP_EMPTY)) return fail('CONTENT_MISMATCH')
      break
    case 'png':
      if (!startsWith(bytes, PNG)) return fail('CONTENT_MISMATCH')
      break
    case 'jpg':
      if (!startsWith(bytes, JPG)) return fail('CONTENT_MISMATCH')
      break
    case 'webp':
      if (!(startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8))) return fail('CONTENT_MISMATCH')
      break
    case 'dwg': {
      const head = new TextDecoder('ascii').decode(bytes.subarray(0, 6))
      if (!/^AC10\d\d$/.test(head)) return fail('CONTENT_MISMATCH')
      break
    }
    case 'dxf': {
      // ASCII DXF: text, and a SECTION marker near the top. Weaker than the magic bytes above; the note says so.
      if (!isText(bytes) || !/\bSECTION\b/.test(new TextDecoder('ascii').decode(bytes.subarray(0, 4096)))) return fail('CONTENT_MISMATCH')
      break
    }
    case 'text':
      if (!isText(bytes)) return fail('CONTENT_MISMATCH')
      break
  }
  if (type.check === 'text' || type.check === 'dxf') {
    if (hasMarkup(bytes)) return fail('MARKUP_REFUSED')
  }
  if (type.archive) {
    const names = zipEntryNames(bytes)
    if (names === null) return fail('ARCHIVE_UNREADABLE')
    const refusal = archiveRefusal(names, type.office === true)
    if (refusal) return fail(refusal)
  }
  return { ok: true, extension: ext, mime: type.mime }
}

/** Human size for the list. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
