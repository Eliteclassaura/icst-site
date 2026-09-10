/**
 * Dependency-free, limit-first ZIP reader for design-pull exports (C5.5 workstream H).
 *
 * A design export arrives from outside the repository, so the archive itself is hostile input. A
 * general-purpose unzip library would happily hand us a 40 GB expansion or a member called
 * `../../.ssh/authorized_keys`; this reader refuses both before allocating anything, because every
 * limit is checked against the *declared* sizes in the central directory first and against the
 * *actual* output second (a lying header is itself a finding).
 *
 * Deliberately implemented here rather than added as a dependency: the checks are the point, they
 * are 150 lines, and a new third-party parser in the supply chain would be a worse trade.
 */
import { inflateRawSync } from 'node:zlib'
import { safeRelativePath, UnsafePathError } from './paths.ts'

export type ArchiveLimits = {
  maxEntries: number
  maxEntryBytes: number
  maxTotalBytes: number
  /** Refuse when uncompressed/compressed exceeds this for any entry (zip bomb). */
  maxRatio: number
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 2_000,
  maxEntryBytes: 8_000_000,
  maxTotalBytes: 80_000_000,
  maxRatio: 120,
}

export type ArchiveEntry = {
  name: string
  bytes: Buffer
  /** Unix mode from the external attributes, when the archive carries one. */
  mode?: number
}

export type ArchiveRefusal = { name: string; rule: string; detail: string }

export type ArchiveResult = { entries: ArchiveEntry[]; refusals: ArchiveRefusal[] }

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

/** Unix file-type bits in the high half of a ZIP external-attributes field. */
const S_IFMT = 0o170000
const S_IFLNK = 0o120000
const S_IFDIR = 0o040000

function findEocd(buf: Buffer): number {
  const min = 22
  const start = Math.max(0, buf.length - 65_557) // max comment length + EOCD
  for (let i = buf.length - min; i >= start; i--) if (buf.readUInt32LE(i) === EOCD_SIG) return i
  return -1
}

/**
 * Read a ZIP, refusing anything outside the limits or the path policy. Never writes to disk; the
 * caller decides what to do with what survives.
 */
export function readZipSafely(buf: Buffer, limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS): ArchiveResult {
  const entries: ArchiveEntry[] = []
  const refusals: ArchiveRefusal[] = []
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('not a ZIP archive (no end-of-central-directory record)')

  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  if (count > limits.maxEntries)
    throw new Error(`archive declares ${count} entries (limit ${limits.maxEntries})`)
  if (offset >= buf.length) throw new Error('central directory offset outside the archive')

  let totalDeclared = 0
  let totalActual = 0

  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CEN_SIG)
      throw new Error(`central directory entry ${i} is malformed`)
    const method = buf.readUInt16LE(offset + 10)
    const compSize = buf.readUInt32LE(offset + 20)
    const uncompSize = buf.readUInt32LE(offset + 24)
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    const external = buf.readUInt32LE(offset + 38)
    const localOffset = buf.readUInt32LE(offset + 42)
    const rawName = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8')
    offset += 46 + nameLen + extraLen + commentLen

    const unixMode = (external >>> 16) & 0xffff
    const isDir = rawName.endsWith('/') || (unixMode & S_IFMT) === S_IFDIR
    if (isDir) continue

    if (compSize === 0xffffffff || uncompSize === 0xffffffff) {
      refusals.push({ name: rawName, rule: 'zip64-unsupported', detail: 'ZIP64 sizes are not accepted' })
      continue
    }
    if ((unixMode & S_IFMT) === S_IFLNK) {
      refusals.push({ name: rawName, rule: 'archive-symlink', detail: 'archive member is a symbolic link' })
      continue
    }
    if (unixMode !== 0 && (unixMode & 0o111) !== 0) {
      refusals.push({
        name: rawName,
        rule: 'executable-asset',
        detail: `member mode ${(unixMode & 0o7777).toString(8)} sets an execute bit`,
      })
      continue
    }
    let name: string
    try {
      name = safeRelativePath(rawName)
    } catch (e) {
      refusals.push({
        name: rawName,
        rule: e instanceof UnsafePathError ? `path-${e.reason}` : 'path-unsafe',
        detail: (e as Error).message,
      })
      continue
    }
    if (uncompSize > limits.maxEntryBytes) {
      refusals.push({ name, rule: 'entry-too-large', detail: `declares ${uncompSize} bytes` })
      continue
    }
    if (compSize > 0 && uncompSize / compSize > limits.maxRatio) {
      refusals.push({
        name,
        rule: 'decompression-ratio',
        detail: `declared ratio ${(uncompSize / compSize).toFixed(0)}:1 exceeds ${limits.maxRatio}:1`,
      })
      continue
    }
    totalDeclared += uncompSize
    if (totalDeclared > limits.maxTotalBytes)
      throw new Error(`archive declares more than ${limits.maxTotalBytes} bytes uncompressed`)

    // Local header: the data offset needs its own name/extra lengths, which may differ from the CD.
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOC_SIG) {
      refusals.push({ name, rule: 'local-header-malformed', detail: 'local header missing or wrong' })
      continue
    }
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const data = buf.subarray(dataStart, dataStart + compSize)
    if (data.length !== compSize) {
      refusals.push({ name, rule: 'truncated-entry', detail: 'compressed data runs past the archive' })
      continue
    }

    let out: Buffer
    try {
      out = method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: limits.maxEntryBytes })
    } catch (e) {
      refusals.push({ name, rule: 'inflate-failed', detail: (e as Error).message.slice(0, 120) })
      continue
    }
    // The header may have lied; the produced bytes are what matters.
    if (out.length > limits.maxEntryBytes) {
      refusals.push({ name, rule: 'entry-too-large', detail: `produced ${out.length} bytes` })
      continue
    }
    if (compSize > 0 && out.length / compSize > limits.maxRatio) {
      refusals.push({
        name,
        rule: 'decompression-ratio',
        detail: `actual ratio ${(out.length / compSize).toFixed(0)}:1 exceeds ${limits.maxRatio}:1`,
      })
      continue
    }
    totalActual += out.length
    if (totalActual > limits.maxTotalBytes)
      throw new Error(`archive expanded past ${limits.maxTotalBytes} bytes`)
    if (out.length !== uncompSize)
      refusals.push({
        name,
        rule: 'size-mismatch',
        detail: `header says ${uncompSize}, produced ${out.length}`,
      })
    else entries.push({ name, bytes: out, mode: unixMode || undefined })
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  refusals.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { entries, refusals }
}
