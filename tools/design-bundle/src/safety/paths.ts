/**
 * Path safety for every file a design tool reads or writes (C5.5 workstream H).
 *
 * Threats covered: path traversal (`../`, absolute paths, Windows drive letters, UNC), NUL
 * injection, symlinks that escape the root (including a symlinked *directory* half way along the
 * path), and names the host filesystem treats specially. Nothing here trusts a name that came
 * from an archive, an export or a remote manifest.
 */
import { lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export class UnsafePathError extends Error {
  readonly reason: string
  constructor(reason: string, path: string) {
    super(`unsafe path (${reason}): ${path}`)
    this.name = 'UnsafePathError'
    this.reason = reason
  }
}

/** Reserved on Windows; refused everywhere so an export cannot be un-checkoutable on another machine. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/**
 * Validate an archive- or export-supplied relative path. Returns the normalised POSIX-style
 * relative path; throws `UnsafePathError` for anything that could leave the root.
 */
export function safeRelativePath(name: string): string {
  if (name === '') throw new UnsafePathError('empty', name)
  if (name.includes('\0')) throw new UnsafePathError('nul-byte', name)
  const posix = name.replace(/\\/g, '/')
  if (posix.startsWith('/')) throw new UnsafePathError('absolute', name)
  if (/^[a-zA-Z]:/.test(posix)) throw new UnsafePathError('drive-letter', name)
  if (posix.startsWith('//')) throw new UnsafePathError('unc', name)
  const parts = posix.split('/')
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') throw new UnsafePathError('traversal', name)
    if (RESERVED.test(p)) throw new UnsafePathError('reserved-name', name)
    if (p.length > 255) throw new UnsafePathError('segment-too-long', name)
  }
  const cleaned = parts.filter((p) => p !== '' && p !== '.').join('/')
  if (cleaned === '') throw new UnsafePathError('empty', name)
  return cleaned
}

/** Join `rel` under `root`, refusing anything that would resolve outside it. */
export function safeJoin(root: string, rel: string): string {
  const cleaned = safeRelativePath(rel)
  const rootAbs = resolve(root)
  const full = resolve(rootAbs, cleaned)
  const back = relative(rootAbs, full)
  if (back.startsWith('..') || isAbsolute(back)) throw new UnsafePathError('escapes-root', rel)
  return full
}

/**
 * Refuse a path where any existing segment under `root` is a symlink, and refuse a target whose
 * realpath leaves the root. Checked segment by segment: a symlinked directory is the usual way a
 * hostile archive escapes after extraction.
 */
export function assertNoSymlink(root: string, rel: string): void {
  const cleaned = safeRelativePath(rel)
  const rootAbs = realpathSync(resolve(root))
  let current = rootAbs
  for (const seg of cleaned.split('/')) {
    current = join(current, seg)
    let st
    try {
      st = lstatSync(current)
    } catch {
      return // does not exist yet — nothing to follow
    }
    if (st.isSymbolicLink()) throw new UnsafePathError('symlink', rel)
  }
  const real = realpathSync(current)
  const back = relative(rootAbs, real)
  if (back.startsWith('..' + sep) || back === '..' || isAbsolute(back))
    throw new UnsafePathError('escapes-root', rel)
}
