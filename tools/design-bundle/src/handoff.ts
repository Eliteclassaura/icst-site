/**
 * Reviewer handoff (C5.5 workstream I).
 *
 * A reviewer — the owner, a designer, a client, or the next session — should be able to answer
 * "what am I looking at, is it sound, and has it been published?" from one file. The handoff is
 * that file: versions and pins, every artboard with its hash and the viewport it is faithful at,
 * what was validated and what was merely warned about, where each font's rights stand, and the
 * *evidence-backed* sync status (never an assertion — see `sync.ts`).
 */
import { canonicalJson } from './manifest.ts'
import type { BundleManifest } from './manifest.ts'
import type { BundleFinding } from './bundle.ts'
import type { StatusReport } from './sync.ts'
import type { SamenessFinding } from './signature.ts'

export type HandoffArtboard = {
  path: string
  kind: 'component-card' | 'foundation-board' | 'page-screenshot' | 'artboard'
  /** Width the artboard is faithful at; a card opened at another width runs the wrong media query. */
  viewport: number
  bytes: number
  sha256: string
}

export type HandoffInput = {
  manifest: BundleManifest
  manifestHash: string
  artboards: HandoffArtboard[]
  findings: BundleFinding[]
  sameness: SamenessFinding[]
  sync: StatusReport
  gates: Record<string, 'pass' | 'fail' | 'not-run'>
  /** Viewports the responsive QA covers, as opposed to the two the cards are emitted at. */
  qaViewports: number[]
  toolVersions: Record<string, string>
}

export type Handoff = HandoffInput & { handoffVersion: 1; blocking: number; advisory: number }

export function buildHandoff(input: HandoffInput): Handoff {
  const blocking = input.findings.filter((f) => f.blocking).length
  const advisory = input.findings.length - blocking
  return { handoffVersion: 1, blocking, advisory, ...input }
}

export function handoffJson(h: Handoff): string {
  return canonicalJson(h)
}

function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n')
}

export function handoffMarkdown(h: Handoff): string {
  const m = h.manifest
  const lines: string[] = []
  lines.push(`# Design handoff — ${m.site}`)
  lines.push('')
  lines.push(
    `**Manifest** \`${h.manifestHash.slice(0, 16)}\` · **contract** \`${m.contractHash.slice(0, 16)}\` · **registry** \`${m.registryVersion}\` · **revision** \`${h.toolVersions.revision ?? 'unrecorded'}\` · **identity** \`${m.brand}\` · **fonts** \`${m.fontsMode}\``,
  )
  lines.push('')
  lines.push(
    `> ${h.blocking} blocking finding(s), ${h.advisory} advisory. Design signature: ${m.signature.summary}.`,
  )
  lines.push('')

  lines.push('## Versions')
  lines.push('')
  lines.push(
    table(
      ['Component', 'Version'],
      Object.entries(h.toolVersions)
        .sort()
        .map(([k, v]) => [k, `\`${v}\``]),
    ),
  )
  lines.push('')

  lines.push('## Gates')
  lines.push('')
  lines.push(
    table(
      ['Gate', 'Result'],
      Object.entries(h.gates)
        .sort()
        .map(([k, v]) => [k, v === 'pass' ? '✅ pass' : v === 'fail' ? '❌ fail' : '— not run']),
    ),
  )
  lines.push('')
  lines.push(
    `Responsive QA viewports: ${h.qaViewports.join(', ')}. Cards are emitted at ${m.viewports.join(' and ')} and are only faithful when opened at the width they declare — a static card cannot make a viewport media query resolve against anything else.`,
  )
  lines.push('')

  lines.push('## Artboards')
  lines.push('')
  lines.push(
    table(
      ['Path', 'Kind', 'Viewport', 'KiB', 'SHA-256'],
      h.artboards.map((a) => [
        `\`${a.path}\``,
        a.kind,
        String(a.viewport),
        (a.bytes / 1024).toFixed(1),
        `\`${a.sha256.slice(0, 12)}\``,
      ]),
    ),
  )
  lines.push('')

  lines.push('## Typography rights and provenance')
  lines.push('')
  lines.push(
    table(
      ['Family', 'Role', 'Licence', 'In this bundle', 'Files'],
      m.fonts.map((f) => [
        f.family,
        f.role,
        f.license,
        f.embedded
          ? 'embedded'
          : `**not embedded** — ${f.reason ?? 'licence does not permit redistribution'}`,
        f.files.length ? `\`${f.files.map((p) => p.split('/').pop()).join('`, `')}\`` : '—',
      ]),
    ),
  )
  lines.push('')
  lines.push(
    'Fixture imagery is generated SVG, never a client photograph: image rights are a publish gate (R34), so a bundle carries nothing whose licence is unknown.',
  )
  lines.push('')

  lines.push('## Validation and warnings')
  lines.push('')
  if (h.findings.length === 0) lines.push('No findings.')
  else
    lines.push(
      table(
        ['Severity', 'Rule', 'Detail'],
        h.findings.map((f) => [
          f.blocking ? 'blocking' : 'advisory',
          `\`${f.rule}\``,
          f.detail.replace(/\|/g, '\\|'),
        ]),
      ),
    )
  lines.push('')

  lines.push('## Distinctiveness')
  lines.push('')
  if (h.sameness.length === 0)
    lines.push("No client's design system sits within the sameness threshold of another's.")
  else
    lines.push(
      table(
        ['Pair', 'Distance', 'Severity', 'Detail'],
        h.sameness.map((s) => [
          `${s.a} ↔ ${s.b}`,
          s.distance.toFixed(3),
          s.blocking ? 'blocking' : 'advisory',
          s.detail.replace(/\|/g, '\\|'),
        ]),
      ),
    )
  lines.push('')

  lines.push('## Sync status')
  lines.push('')
  lines.push(`**${h.sync.status}** — ${h.sync.message}`)
  lines.push('')
  lines.push(
    h.sync.synced
      ? 'The design-system project holds this exact bundle.'
      : 'Nothing in this handoff asserts that a design-system project holds this bundle. A sync is only recorded when a push returns a remote manifest hash from an interactive session on the owner’s machine (ADR-026 spike result 4).',
  )
  lines.push('')
  return lines.join('\n')
}
