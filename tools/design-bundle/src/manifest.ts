/**
 * Bundle manifest — the handshake token and the determinism proof (ADR-026 §4, §8).
 *
 * Two runs of `design:bundle` on the same commit must produce byte-identical files, so nothing
 * here may carry a clock, a hostname, a temporary path or an unordered map. The manifest is the
 * only committed part of a bundle: it names the client, pins the contract and registry, and lists
 * every file's SHA-256, which is what the push handshake compares and what the reviewer handoff
 * quotes.
 *
 * It is never called `_ds_manifest.json` — the design pane owns that name (ADR-026 §4).
 *
 * There is deliberately no `generatedFrom`/timestamp field: a git description is a property of the
 * checkout, not of the design system, and putting one here would make the committed manifest
 * differ between a tagged working copy and CI's shallow clone. The revision lives in the handoff,
 * which is not committed.
 */
import { createHash } from 'node:crypto'

export const MANIFEST_PATH = '_factory/manifest.json'
export const MANIFEST_VERSION = 1

export type FontRights = {
  family: string
  role: string
  license: string
  embedded: boolean
  reason?: string
  files: string[]
}

export type BundleManifest = {
  manifestVersion: number
  site: string
  /** `neutral` when the bundle was rendered with the preset identity. */
  brand: string
  contractHash: string
  registryVersion: string
  fontsMode: 'inline' | 'shared'
  viewports: number[]
  signature: { summary: string; axes: Record<string, number> }
  fonts: FontRights[]
  files: Record<string, string>
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * JSON with sorted keys and a trailing newline — the same object always serialises to the same
 * bytes, whatever order the builder happened to fill it in.
 */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const src = v as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(src).sort()) out[k] = walk(src[k])
      return out
    }
    return v
  }
  return JSON.stringify(walk(value), null, 2) + '\n'
}

/** Hash of the manifest's meaning — the file list plus the pins, excluding presentation. */
export function manifestHash(m: BundleManifest): string {
  return sha256(
    canonicalJson({
      site: m.site,
      brand: m.brand,
      contractHash: m.contractHash,
      registryVersion: m.registryVersion,
      fontsMode: m.fontsMode,
      files: m.files,
    }),
  )
}

export type HandshakeInput = {
  /** Our manifest, about to be pushed. */
  local: BundleManifest
  /** What the remote project reports, or null when the project is empty. */
  remote: Pick<BundleManifest, 'site'> | null
  /** The remote project's type as the host reports it. */
  remoteProjectType: string | null
  /** Hash recorded at the last successful pull, when there was one. */
  lastPulledHash?: string | null
  /** Remote manifest hash read during this pull. */
  remoteHash?: string | null
}

export type HandshakeVerdict =
  { ok: true; action: 'claim' | 'update' } | { ok: false; reason: string; detail: string }

/**
 * The refusals that keep one client's design system out of another's project (R50) and stop a
 * concurrent edit being overwritten (R54). Pure, so every branch is a unit test.
 */
export function checkHandshake(input: HandshakeInput): HandshakeVerdict {
  if (input.remoteProjectType !== null && input.remoteProjectType !== 'design-system')
    return {
      ok: false,
      reason: 'wrong-project-type',
      detail: `target is a "${input.remoteProjectType}" project; the type is immutable and pushing never converts it`,
    }
  if (input.remote === null) {
    if (input.remoteProjectType === null)
      return {
        ok: false,
        reason: 'unknown-project-type',
        detail: 'the project type could not be read; refusing to write blind',
      }
    return { ok: true, action: 'claim' }
  }
  if (input.remote.site !== input.local.site)
    return {
      ok: false,
      reason: 'site-mismatch',
      detail: `remote project belongs to "${input.remote.site}", this bundle is "${input.local.site}"`,
    }
  if (input.lastPulledHash != null && input.remoteHash != null && input.lastPulledHash !== input.remoteHash)
    return {
      ok: false,
      reason: 'remote-changed',
      detail: 'the project changed since the last pull; pull again and review the diff before pushing',
    }
  return { ok: true, action: 'update' }
}
