import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Held public files as link destinations (R1 residual, Control Tower 2026-10-05).
 *
 * A page element may link a document or image the site itself serves: a file under the held upload and media trees that is
 * VERIFIED to exist in the served public tree (the runtime image's `public/`, whose contents the image self-manifest
 * checks). Anything else stays a validation error: no other prefixes, no traversal, no directories, document and image types
 * only, and the file must be present.
 */
const ROOTS = ['/wp-content/uploads/', '/media/']
const FILE = /\.(?:pdf|jpe?g|png|webp|gif|svg|docx?|xlsx?|dwg|zip)$/i

export function publicFileExists(href: string, publicRoot: string = path.join(process.cwd(), 'public')): boolean {
  let file = href.split(/[?#]/)[0] ?? ''
  try {
    file = decodeURIComponent(file)
  } catch {
    return false
  }
  if (!ROOTS.some((root) => file.startsWith(root)) || !FILE.test(file) || file.includes('..') || file.includes('\0')) return false
  const resolved = path.join(publicRoot, file)
  return resolved.startsWith(publicRoot + path.sep) && existsSync(resolved) && statSync(resolved).isFile()
}
