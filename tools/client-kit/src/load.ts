import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ManifestError, validateManifest, type Manifest } from './manifest.ts'

/** Read and validate `<clientDir>/manifest.json`. Throws `ManifestError`; never returns a partial manifest. */
export function loadManifest(clientDir: string): Manifest {
  const file = path.join(clientDir, 'manifest.json')
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new ManifestError(file, [{ path: '$', message: `cannot read as JSON (${(e as Error).message})` }])
  }
  const r = validateManifest(raw)
  if (!r.ok) throw new ManifestError(file, r.issues)
  return r.manifest
}
