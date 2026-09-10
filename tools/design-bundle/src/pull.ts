/**
 * `design-pull` — read a design-system project export and produce the three-way change report
 * (ADR-027 §6, C5.5 workstreams B, C, H).
 *
 * The export is hostile input: it arrives from a hosted pane that a designer, a client or anybody
 * with the link may have edited. So it goes through the archive limits and the path policy before
 * anything is parsed, and every surviving file is classified into exactly one of three lanes:
 *
 *   tokens     → may be imported, as `declared`, and only if the contrast gate agrees
 *   components → never imported; code owns them, so a change is a request (A22, R47)
 *   copy       → never imported; the CMS owns copy, so a change is an editor task (R52)
 *
 * Anything that is none of those — a new script, an executable, a font nobody declared — is a
 * refusal, not a fourth lane.
 */
import { contrastRatio, REQUIRED } from '@factory/design-contract'
import { readZipSafely, DEFAULT_ARCHIVE_LIMITS } from './safety/archive.ts'
import type { ArchiveEntry, ArchiveLimits, ArchiveRefusal } from './safety/archive.ts'
import { checkMarkup } from './safety/markup.ts'
import { inspectAsset, isExecutableName, IMAGE_POLICY, FONT_POLICY } from './safety/assets.ts'
import { sha256 } from './manifest.ts'

/** Files the pane owns and rewrites on its own; reported as informational, never as a change. */
export const PANE_OWNED = ['_ds_manifest.json', '.design/state.json'] as const

export type TokenChange = {
  path: string
  token: string
  from: string | null
  to: string
  /** Accepted only when every declared pair it participates in still passes. */
  accepted: boolean
  reason?: string
}

export type ComponentChange = { path: string; localHash: string | null; remoteHash: string }
export type CopyChange = { path: string; excerpt: string }

export type PullReport = {
  site: string
  entries: number
  refusals: ArchiveRefusal[]
  rejected: Array<{ name: string; rule: string; detail: string }>
  paneOwned: string[]
  tokens: TokenChange[]
  components: ComponentChange[]
  copy: CopyChange[]
  /** True when nothing blocks importing the accepted token changes. */
  importable: boolean
}

type Contract = {
  colors?: Record<string, { value?: string; source?: unknown }>
  accessibility?: { contrastPairs?: Array<{ foreground: string; background: string; use: string }> }
}

/** Normalise HTML before hashing so re-serialisation is not mistaken for an edit (ADR-027 §9). */
export function normaliseHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
}

function classify(name: string): 'tokens' | 'component' | 'copy' | 'pane' | 'asset' | 'unknown' {
  if ((PANE_OWNED as readonly string[]).includes(name)) return 'pane'
  if (name === 'tokens/design-contract.json') return 'tokens'
  if (name.startsWith('components/') && name.endsWith('.html')) return 'component'
  if (name.startsWith('foundations/') && name.endsWith('.html')) return 'component'
  if (name.startsWith('copy/') && (name.endsWith('.md') || name.endsWith('.txt'))) return 'copy'
  if (name.startsWith('assets/')) return 'asset'
  if (name === '_factory/manifest.json') return 'pane'
  return 'unknown'
}

export type PullInput = {
  site: string
  /** The export: a ZIP, or an already-listed set of entries (a directory export). */
  archive?: Buffer
  entries?: ArchiveEntry[]
  limits?: ArchiveLimits
  /** Local contract, for the token diff. */
  contract: Contract
  /** Local bundle file hashes, for the component diff. */
  localHashes: Record<string, string>
}

export function pullReport(input: PullInput): PullReport {
  let entries: ArchiveEntry[]
  let refusals: ArchiveRefusal[] = []
  if (input.archive) {
    const read = readZipSafely(input.archive, input.limits ?? DEFAULT_ARCHIVE_LIMITS)
    entries = read.entries
    refusals = read.refusals
  } else entries = input.entries ?? []

  const rejected: Array<{ name: string; rule: string; detail: string }> = []
  const paneOwned: string[] = []
  const tokens: TokenChange[] = []
  const components: ComponentChange[] = []
  const copy: CopyChange[] = []

  for (const entry of entries) {
    if (isExecutableName(entry.name)) {
      rejected.push({
        name: entry.name,
        rule: 'executable-asset',
        detail: 'an export may not carry anything runnable',
      })
      continue
    }
    const kind = classify(entry.name)
    if (kind === 'unknown') {
      rejected.push({
        name: entry.name,
        rule: 'unclassified',
        detail: 'not a token file, a component card, copy or a declared asset',
      })
      continue
    }
    if (kind === 'pane') {
      paneOwned.push(entry.name)
      continue
    }
    if (kind === 'asset') {
      const policy = /\.(woff2?|ttf|otf)$/i.test(entry.name) ? FONT_POLICY : IMAGE_POLICY
      const verdict = inspectAsset(entry.name, entry.bytes, policy)
      if (!verdict.ok)
        for (const f of verdict.findings) rejected.push({ name: entry.name, rule: f.rule, detail: f.detail })
      continue
    }
    const text = entry.bytes.toString('utf8')
    if (kind === 'component') {
      const bad = checkMarkup(text, entry.name)
      if (bad.length) {
        for (const f of bad) rejected.push({ name: entry.name, rule: f.rule, detail: f.detail })
        continue
      }
      const remoteHash = sha256(normaliseHtml(text))
      const localRaw = input.localHashes[entry.name] ?? null
      if (localRaw !== remoteHash) components.push({ path: entry.name, localHash: localRaw, remoteHash })
      continue
    }
    if (kind === 'copy') {
      copy.push({ path: entry.name, excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 160) })
      continue
    }
    // tokens
    let remote: Contract
    try {
      remote = JSON.parse(text) as Contract
    } catch (e) {
      rejected.push({ name: entry.name, rule: 'invalid-json', detail: (e as Error).message.slice(0, 120) })
      continue
    }
    tokens.push(...diffTokens(input.contract, remote, entry.name))
  }

  return {
    site: input.site,
    entries: entries.length,
    refusals,
    rejected: rejected.sort((a, b) => (a.name + a.rule < b.name + b.rule ? -1 : 1)),
    paneOwned: paneOwned.sort(),
    tokens: tokens.sort((a, b) => (a.token < b.token ? -1 : 1)),
    components: components.sort((a, b) => (a.path < b.path ? -1 : 1)),
    copy: copy.sort((a, b) => (a.path < b.path ? -1 : 1)),
    importable: rejected.length === 0 && tokens.every((t) => t.accepted || t.reason !== undefined),
  }
}

const HEX = /^#[0-9a-f]{3,8}$/i

/**
 * Colour-token diff through the contrast gate: a changed colour is accepted only if every
 * declared pair it takes part in still meets its required ratio with the change applied.
 */
export function diffTokens(local: Contract, remote: Contract, path: string): TokenChange[] {
  const out: TokenChange[] = []
  const pairsOf = local.accessibility?.contrastPairs ?? []
  const localColors = local.colors ?? {}
  const remoteColors = remote.colors ?? {}
  for (const token of Object.keys(remoteColors).sort()) {
    const to = remoteColors[token]?.value
    const from = localColors[token]?.value ?? null
    if (typeof to !== 'string' || to === from) continue
    if (!HEX.test(to)) {
      out.push({ path, token, from, to, accepted: false, reason: `not a hex colour: ${to.slice(0, 32)}` })
      continue
    }
    const resolve = (name: string) => (name === token ? to : (localColors[name]?.value ?? '#000000'))
    const failures = pairsOf
      .filter((p) => p.foreground === token || p.background === token)
      .map((p) => ({ p, ratio: contrastRatio(resolve(p.foreground), resolve(p.background)) }))
      .filter(({ p, ratio }) => ratio < (REQUIRED[p.use] ?? 4.5))
    if (failures.length) {
      const f = failures[0] as { p: { foreground: string; background: string; use: string }; ratio: number }
      out.push({
        path,
        token,
        from,
        to,
        accepted: false,
        reason: `contrast gate: ${f.p.foreground} on ${f.p.background} (${f.p.use}) would be ${f.ratio.toFixed(2)}:1`,
      })
    } else out.push({ path, token, from, to, accepted: true })
  }
  return out
}

export function pullMarkdown(r: PullReport): string {
  const lines: string[] = [`# design-pull — ${r.site}`, '']
  lines.push(
    `${r.entries} admitted file(s); ${r.refusals.length} refused by the archive reader; ${r.rejected.length} rejected on inspection.`,
  )
  lines.push('')
  const section = (title: string, body: string[]) => {
    lines.push(`## ${title}`, '')
    lines.push(...(body.length ? body : ['None.']))
    lines.push('')
  }
  section(
    'Tokens — importable through the contrast gate',
    r.tokens.map(
      (t) =>
        `- \`${t.token}\`: ${t.from ?? '—'} → ${t.to} — ${t.accepted ? '**accepted** (arrives as `declared`)' : `**refused**: ${t.reason}`}`,
    ),
  )
  section(
    'Components — change requests, implemented as code',
    r.components.map(
      (c) =>
        `- \`${c.path}\` differs from the bundle (remote \`${c.remoteHash.slice(0, 12)}\`). Components are code-owned: discuss, do not import.`,
    ),
  )
  section(
    'Copy — routed to the editor',
    r.copy.map((c) => `- \`${c.path}\`: “${c.excerpt}” — copy lives in the CMS; open a Payload task.`),
  )
  section(
    'Refused by the archive reader',
    r.refusals.map((f) => `- \`${f.name}\` — ${f.rule}: ${f.detail}`),
  )
  section(
    'Rejected on inspection',
    r.rejected.map((f) => `- \`${f.name}\` — ${f.rule}: ${f.detail}`),
  )
  section(
    'Pane-owned (ignored by design)',
    r.paneOwned.map((p) => `- \`${p}\``),
  )
  return lines.join('\n')
}
