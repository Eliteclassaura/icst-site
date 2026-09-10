/**
 * Design-system sync status — truthful by construction (C5.5 workstream F, ADR-026 spike result 4).
 *
 * Publishing a design system into a Claude Design project needs an interactive `/design-login` on
 * the owner's machine. A Cowork cloud session cannot do it, and the failure mode that matters is
 * not the missing capability — it is a session *saying* it synced. So the status is computed from
 * evidence, never asserted: the capability is derived from the environment, and `ok` requires a
 * remote manifest hash that came back from an actual push.
 *
 * Every state below is reachable, every state is printed verbatim by the `design-sync` skill, and
 * nothing here can produce `ok` without `recordSync` having been handed a remote hash.
 */

export type SyncStatus =
  | 'ok'
  | 'stale'
  | 'never-synced'
  | 'login-required'
  | 'unavailable-in-this-session'
  | 'blocked-residue'
  | 'blocked-render-check'
  | 'blocked-handshake'
  | 'blocked-no-bundle'

export type SyncCapability = {
  /** Whether a sync could even be attempted from here. */
  canSync: boolean
  /** One sentence a person reads; it must be true in every branch. */
  explanation: string
  environment: 'owner-workstation' | 'cloud-session' | 'ci' | 'unknown'
}

export type SyncRecord = {
  /** Only ever written by `recordSync` after a push returned a remote hash. */
  syncedManifestHash: string
  remoteManifestHash: string
  projectId: string
  /** ISO-8601. Recorded for the ledger; never used to decide freshness of content (the hash does). */
  at: string
  by: 'owner-workstation'
}

export type SyncStateFile = { version: 1; last: SyncRecord | null }

export const EMPTY_SYNC_STATE: SyncStateFile = { version: 1, last: null }

export type EnvLike = Record<string, string | undefined>

/**
 * Where are we, and may we claim a sync from here?
 *
 * `FACTORY_DESIGN_LOGIN=1` is set by the interactive Claude Code session on the owner's machine
 * after `/design-login`. It is deliberately not something a cloud session can set for itself and
 * mean: CI and the cloud sandbox are detected first and win, so exporting the variable in a cloud
 * session still reports `cloud-session`.
 */
export function syncCapability(env: EnvLike = process.env): SyncCapability {
  if (env.CI === 'true' || env.CI === '1' || env.GITHUB_ACTIONS === 'true')
    return {
      canSync: false,
      environment: 'ci',
      explanation: 'CI never holds a publishing credential; design-system sync is a human step (ADR-026 §1).',
    }
  if (env.FACTORY_CLOUD_SESSION === '1' || env.CLAUDE_CLOUD_SESSION === '1' || env.COWORK_SESSION === '1')
    return {
      canSync: false,
      environment: 'cloud-session',
      explanation:
        'This is a cloud session. Design-system sync needs an interactive /design-login on the owner’s machine, so it cannot run here; build the bundle here and sync it from Claude Code on the Mac.',
    }
  if (env.FACTORY_DESIGN_LOGIN === '1')
    return {
      canSync: true,
      environment: 'owner-workstation',
      explanation: 'Interactive session with /design-login completed; a sync may be attempted.',
    }
  return {
    canSync: false,
    environment: 'unknown',
    explanation:
      'No /design-login in this session. Run /design-login in Claude Code on the owner’s machine, then retry; nothing has been pushed.',
  }
}

export type StatusInput = {
  capability: SyncCapability
  state: SyncStateFile
  /** Current bundle's manifest hash, or null when no bundle has been built. */
  bundleHash: string | null
  gates: { residue: boolean; renderCheck: boolean }
  handshake?: { ok: boolean; reason?: string } | null
}

export type StatusReport = {
  status: SyncStatus
  /** Never a guess: the sentence explains exactly which evidence produced the status. */
  message: string
  /** True only when a hash-verified sync of *this* bundle exists. */
  synced: boolean
  lastSyncedHash: string | null
}

export function syncStatus(input: StatusInput): StatusReport {
  const last = input.state.last
  const lastSyncedHash = last?.syncedManifestHash ?? null
  const base = { synced: false, lastSyncedHash }

  if (input.bundleHash === null)
    return {
      ...base,
      status: 'blocked-no-bundle',
      message: 'No bundle has been built for this client; run pnpm design:bundle first.',
    }
  if (!input.gates.residue)
    return {
      ...base,
      status: 'blocked-residue',
      message: 'The residue scan failed for this bundle; nothing may be published until it is clean.',
    }
  if (!input.gates.renderCheck)
    return {
      ...base,
      status: 'blocked-render-check',
      message: 'The render check failed for this bundle; nothing may be published until it passes.',
    }
  if (input.handshake && !input.handshake.ok)
    return {
      ...base,
      status: 'blocked-handshake',
      message: `The project handshake refused the push: ${input.handshake.reason ?? 'unknown reason'}.`,
    }

  if (lastSyncedHash === input.bundleHash)
    return {
      status: 'ok',
      synced: true,
      lastSyncedHash,
      message: `This exact bundle (${input.bundleHash.slice(0, 12)}) was pushed to ${last?.projectId ?? 'the project'} at ${last?.at ?? 'an unrecorded time'}.`,
    }

  if (!input.capability.canSync)
    return {
      ...base,
      status: last ? 'unavailable-in-this-session' : 'unavailable-in-this-session',
      message:
        `${input.capability.explanation}` +
        (last
          ? ` The project still holds bundle ${lastSyncedHash?.slice(0, 12)}; this one (${input.bundleHash.slice(0, 12)}) has not been pushed.`
          : ' This client’s design system has never been pushed.'),
    }

  if (!last)
    return {
      ...base,
      status: 'never-synced',
      message: 'Ready to push: this client’s design system has never been synced.',
    }

  return {
    ...base,
    status: 'stale',
    message: `Ready to push: the project holds ${lastSyncedHash?.slice(0, 12)}, the bundle is ${input.bundleHash.slice(0, 12)}.`,
  }
}

/**
 * The only way to write a "synced" record. It refuses unless the caller can show a remote hash
 * that came back from the push — an intention to sync is not a sync.
 */
export function recordSync(args: {
  capability: SyncCapability
  bundleHash: string
  remoteManifestHash: string | null
  projectId: string
  now: Date
}): SyncRecord {
  if (!args.capability.canSync)
    throw new Error(
      `refusing to record a sync from ${args.capability.environment}: ${args.capability.explanation}`,
    )
  if (!args.remoteManifestHash)
    throw new Error('refusing to record a sync without a remote manifest hash returned by the push')
  return {
    syncedManifestHash: args.bundleHash,
    remoteManifestHash: args.remoteManifestHash,
    projectId: args.projectId,
    at: args.now.toISOString(),
    by: 'owner-workstation',
  }
}
