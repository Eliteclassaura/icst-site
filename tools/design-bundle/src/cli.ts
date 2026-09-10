/**
 * Design tooling CLI (C5.5). Subcommands:
 *
 *   bundle       --site <client> [--fonts inline|shared] [--neutral] [--check] [--out <dir>]
 *   signature    [--new <client>]                    distinctiveness across every client
 *   sync-status  --site <client>                     truthful status, never an assertion
 *   pull         --site <client> --export <zip|dir>  three-way change report
 *   handoff      --site <client>                     rebuild the handoff from the last bundle
 *
 * Run through `tools/design-bundle/run.mjs`, which pre-bundles the registry (its blocks import
 * CSS, which Node cannot load) — see that file for why.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { buildBundle, CARD_VIEWPORTS } from './bundle.ts'
import type { BundleIo } from './bundle.ts'
import { canonicalJson, MANIFEST_PATH, manifestHash, sha256 } from './manifest.ts'
import type { BundleManifest } from './manifest.ts'
import { computeSignature, compareSignatures, SAMENESS_THRESHOLD } from './signature.ts'
import type { DesignSignature } from './signature.ts'
import { EMPTY_SYNC_STATE, syncCapability, syncStatus } from './sync.ts'
import type { SyncStateFile } from './sync.ts'
import { buildHandoff, handoffJson, handoffMarkdown } from './handoff.ts'
import type { HandoffArtboard } from './handoff.ts'
import { pullMarkdown, pullReport } from './pull.ts'
import { scan } from '@factory/quality-gates'
import { safeJoin } from './safety/paths.ts'

const ROOT = resolve(process.env.FACTORY_ROOT ?? process.cwd())

const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (name: string, fallback?: string): string | undefined => {
  const i = argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : fallback
}
const has = (name: string) => argv.includes(`--${name}`)

function die(message: string): never {
  console.error(`✖ ${message}`)
  process.exit(1)
}

function revision(): string {
  if (process.env.FACTORY_REVISION) return process.env.FACTORY_REVISION
  try {
    return execFileSync('git', ['describe', '--tags', '--always'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

const io: BundleIo = {
  readText: (rel) => readFileSync(join(ROOT, rel), 'utf8'),
  readBinary: (rel) => {
    const p = join(ROOT, rel)
    return existsSync(p) ? readFileSync(p) : null
  },
  listCss: (rel) => {
    const base = join(ROOT, rel)
    const out: string[] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d).sort()) {
        const p = join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (p.endsWith('.css')) out.push(relative(ROOT, p).split('\\').join('/'))
      }
    }
    walk(base)
    return out.sort()
  },
  revision: revision(),
}

function clients(): string[] {
  const apps = join(ROOT, 'apps')
  if (!existsSync(apps)) return []
  return readdirSync(apps)
    .filter((c) => existsSync(join(apps, c, 'design/design-contract.json')))
    .sort()
}

function signatures(): DesignSignature[] {
  return clients().map((c) =>
    computeSignature(
      JSON.parse(readFileSync(join(ROOT, 'apps', c, 'design/design-contract.json'), 'utf8')),
      c,
    ),
  )
}

function bundleDir(site: string): string {
  return flag('out') ? resolve(flag('out') as string) : join(ROOT, 'apps', site, 'design/ds-bundle')
}

function readSyncState(site: string): SyncStateFile {
  const p = join(ROOT, 'apps', site, 'design/sync-state.json')
  if (!existsSync(p)) return EMPTY_SYNC_STATE
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as SyncStateFile
  } catch {
    return EMPTY_SYNC_STATE
  }
}

function gateResults(site: string): { residue: boolean; renderCheck: boolean } {
  const p = join(ROOT, 'apps', site, 'design/ds-bundle/_factory/gates.json')
  if (!existsSync(p)) return { residue: false, renderCheck: false }
  try {
    const g = JSON.parse(readFileSync(p, 'utf8')) as { residue?: boolean; renderCheck?: boolean }
    return { residue: Boolean(g.residue), renderCheck: Boolean(g.renderCheck) }
  } catch {
    return { residue: false, renderCheck: false }
  }
}

function artboardsOf(files: Map<string, string | Buffer>): HandoffArtboard[] {
  const out: HandoffArtboard[] = []
  for (const path of [...files.keys()].sort()) {
    if (!path.endsWith('.html')) continue
    const content = files.get(path) as string
    const viewport = Number(/viewport="(\d+)"/.exec(content)?.[1] ?? 0)
    out.push({
      path,
      kind: path.startsWith('foundations/') ? 'foundation-board' : 'component-card',
      viewport,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
    })
  }
  return out
}

function writeBundle(dir: string, files: Map<string, string | Buffer>): void {
  rmSync(dir, { recursive: true, force: true })
  for (const rel of [...files.keys()].sort()) {
    const target = safeJoin(dir, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, files.get(rel) as string | Buffer)
  }
}

function writeHandoff(dir: string, handoff: ReturnType<typeof buildHandoff>): void {
  mkdirSync(join(dir, '_factory'), { recursive: true })
  writeFileSync(join(dir, '_factory/handoff.json'), handoffJson(handoff))
  writeFileSync(join(dir, 'HANDOFF.md'), handoffMarkdown(handoff))
}

// ── subcommands ───────────────────────────────────────────────────────────────────────────────

function cmdBundle(): void {
  const site = flag('site') ?? die('bundle needs --site <client>')
  const fontsModeRaw = flag('fonts', 'inline') as string
  if (fontsModeRaw !== 'inline' && fontsModeRaw !== 'shared')
    die(`--fonts must be inline or shared, got ${fontsModeRaw}`)
  const result = buildBundle({ site, fontsMode: fontsModeRaw, neutral: has('neutral'), io })
  const dir = bundleDir(site)

  if (has('check')) {
    // Determinism proof: build twice and compare every byte, not just the manifest.
    const again = buildBundle({ site, fontsMode: fontsModeRaw, neutral: has('neutral'), io })
    const a = [...result.files.keys()].sort()
    const b = [...again.files.keys()].sort()
    if (a.join('\n') !== b.join('\n')) die('non-deterministic: the two runs produced different file lists')
    for (const k of a) {
      const x = result.files.get(k) as string | Buffer
      const y = again.files.get(k) as string | Buffer
      if (sha256(x) !== sha256(y)) die(`non-deterministic: ${k} differs between two runs`)
    }
    console.error(
      `✔ deterministic: ${a.length} files identical across two runs (manifest ${result.manifestHash.slice(0, 12)})`,
    )
  }

  writeBundle(dir, result.files)

  // The manifest is the only committed part of a bundle (ADR-026 §8).
  const committed = join(ROOT, 'apps', site, 'design/ds-bundle.manifest.json')
  writeFileSync(committed, canonicalJson(result.manifest))

  const sameness = compareSignatures(signatures(), site)
  const handoff = buildHandoff({
    manifest: result.manifest,
    manifestHash: result.manifestHash,
    artboards: artboardsOf(result.files),
    findings: result.findings,
    sameness,
    sync: syncStatus({
      capability: syncCapability(),
      state: readSyncState(site),
      bundleHash: result.manifestHash,
      gates: gateResults(site),
    }),
    gates: {
      'bundle-safety': result.findings.some((f) => f.blocking) ? 'fail' : 'pass',
      determinism: has('check') ? 'pass' : 'not-run',
      residue: 'not-run',
      'render-check': 'not-run',
      distinctiveness: sameness.some((s) => s.blocking) ? 'fail' : 'pass',
    },
    qaViewports: [360, 390, 768, 1024, 1440],
    toolVersions: {
      registry: result.manifest.registryVersion,
      contract: result.manifest.contractHash.slice(0, 16),
      revision: io.revision,
      'design-bundle': '0.1.0',
    },
  })
  writeHandoff(dir, handoff)

  for (const f of result.findings) console.error(`${f.blocking ? '✖' : '•'} [${f.rule}] ${f.detail}`)
  for (const s of sameness) console.error(`${s.blocking ? '✖' : '•'} [design-sameness] ${s.detail}`)

  const blocking =
    result.findings.filter((f) => f.blocking).length + sameness.filter((s) => s.blocking).length
  const cards = [...result.files.keys()].filter((k) => k.endsWith('.html')).length
  console.error(
    `${blocking ? '✖' : '✔'} bundle ${site}: ${cards} artboards, ${result.files.size} files, manifest ${result.manifestHash.slice(0, 12)} → ${relative(ROOT, dir)}`,
  )
  if (blocking) process.exit(1)
}

function cmdSignature(): void {
  const sigs = signatures()
  for (const s of sigs) console.error(`• ${s.client}: ${s.summary}`)
  const findings = compareSignatures(sigs, flag('new'))
  for (const f of findings) console.error(`${f.blocking ? '✖' : '•'} [design-sameness] ${f.detail}`)
  const blocking = findings.filter((f) => f.blocking).length
  console.error(
    blocking
      ? `✖ ${blocking} pair(s) below the ${SAMENESS_THRESHOLD} distinctiveness threshold`
      : `✔ ${sigs.length} client design system(s), all distinct (threshold ${SAMENESS_THRESHOLD})`,
  )
  if (blocking) process.exit(1)
}

function cmdSyncStatus(): void {
  const site = flag('site') ?? die('sync-status needs --site <client>')
  const manifestPath = join(bundleDir(site), MANIFEST_PATH)
  let hash: string | null = null
  if (existsSync(manifestPath))
    hash = manifestHash(JSON.parse(readFileSync(manifestPath, 'utf8')) as BundleManifest)
  const capability = syncCapability()
  const report = syncStatus({
    capability,
    state: readSyncState(site),
    bundleHash: hash,
    gates: gateResults(site),
  })
  console.error(canonicalJson({ site, capability, ...report }).trimEnd())
  // A status is information, not a failure: exit 0 in every state so a caller reads the status.
}

function cmdPull(): void {
  const site = flag('site') ?? die('pull needs --site <client>')
  const exportPath = flag('export') ?? die('pull needs --export <zip|dir>')
  const contract = JSON.parse(readFileSync(join(ROOT, 'apps', site, 'design/design-contract.json'), 'utf8'))
  const manifestFile = join(ROOT, 'apps', site, 'design/ds-bundle.manifest.json')
  const localHashes = existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as BundleManifest).files
    : {}
  const abs = resolve(exportPath)
  const report = statSync(abs).isDirectory()
    ? pullReport({ site, entries: readDirEntries(abs), contract, localHashes })
    : pullReport({ site, archive: readFileSync(abs), contract, localHashes })
  const outDir = join(ROOT, 'apps', site, 'design/claude-design-export')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'CHANGE-REPORT.md'), pullMarkdown(report))
  writeFileSync(join(outDir, 'change-report.json'), canonicalJson(report))
  console.error(pullMarkdown(report))
  if (report.rejected.length || report.refusals.length) process.exit(1)
}

/**
 * Cross-client deny-list: every *other* client's identity, so client A's bundle can be proven not
 * to name client B (R50, workstream H). Built from what each app actually asserts about itself —
 * its blueprint site name and its committed brand overrides — rather than a hand-kept word list.
 */
function otherClientLiterals(site: string): string[] {
  const out = new Set<string>()
  for (const c of clients()) {
    if (c === site) continue
    const brandFile = join(ROOT, 'apps', c, 'design/fixture-brand.json')
    if (existsSync(brandFile)) {
      const b = JSON.parse(readFileSync(brandFile, 'utf8')) as Record<string, unknown>
      for (const key of ['siteName', 'personName', 'copyrightHolder', 'wordmark']) {
        const v = b[key]
        if (typeof v === 'string' && v.length > 3) out.add(v)
      }
      for (const o of (b.offices as Array<{ city?: string }> | undefined) ?? [])
        if (o.city && o.city.length > 3) out.add(o.city)
    }
    const bp = join(ROOT, 'apps', c, `content/${c}.blueprint.json`)
    if (existsSync(bp)) {
      const j = JSON.parse(readFileSync(bp, 'utf8')) as { site?: { name?: string } }
      if (j.site?.name && j.site.name.length > 3) out.add(j.site.name)
    }
  }
  return [...out].sort()
}

async function cmdGates(): Promise<void> {
  const site = flag('site') ?? die('gates needs --site <client>')
  const dir = bundleDir(site)
  if (!existsSync(join(dir, MANIFEST_PATH)))
    die(`no bundle at ${relative(ROOT, dir)}; run pnpm design:bundle first`)
  const forbidden = otherClientLiterals(site)
  const findings = await scan({ root: dir, referencePaths: [], forbiddenLiterals: forbidden })
  for (const f of findings) console.error(`✖ ${f.file}:${f.line}  [${f.rule}]  ${f.detail}`)
  const residue = findings.length === 0
  console.error(
    residue
      ? `✔ residue scan clean over ${relative(ROOT, dir)} (${forbidden.length} cross-client literal(s) checked)`
      : `✖ ${findings.length} residue finding(s) in the bundle`,
  )

  // The render check is Playwright's to decide; this reads its verdict rather than guessing one.
  const rcFile = join(dir, '_factory/render-check.json')
  let renderCheck = false
  if (existsSync(rcFile)) {
    const rc = JSON.parse(readFileSync(rcFile, 'utf8')) as { ok?: boolean; manifestHash?: string }
    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8')) as BundleManifest
    renderCheck = Boolean(rc.ok) && rc.manifestHash === manifestHash(manifest)
    if (rc.ok && !renderCheck)
      console.error('• render-check.json belongs to a different bundle; treating the render check as not run')
  }
  mkdirSync(join(dir, '_factory'), { recursive: true })
  writeFileSync(join(dir, '_factory/gates.json'), canonicalJson({ residue, renderCheck, forbidden }))
  console.error(
    `${renderCheck ? '✔' : '•'} render check: ${renderCheck ? 'pass' : 'not run for this bundle'}`,
  )

  // The handoff was written by `design:bundle`, before these gates had run, so its gate table said
  // "not run". Rewrite it now that there is an answer — a handoff that understates what was checked
  // is as misleading as one that overstates it.
  const handoffFile = join(dir, '_factory/handoff.json')
  if (existsSync(handoffFile)) {
    const prev = JSON.parse(readFileSync(handoffFile, 'utf8')) as ReturnType<typeof buildHandoff>
    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8')) as BundleManifest
    writeHandoff(
      dir,
      buildHandoff({
        ...prev,
        gates: {
          ...prev.gates,
          residue: residue ? 'pass' : 'fail',
          'render-check': renderCheck ? 'pass' : 'not-run',
        },
        sync: syncStatus({
          capability: syncCapability(),
          state: readSyncState(site),
          bundleHash: manifestHash(manifest),
          gates: { residue, renderCheck },
        }),
      }),
    )
  }
  if (!residue) process.exit(1)
}

function readDirEntries(dir: string): Array<{ name: string; bytes: Buffer; mode?: number }> {
  const out: Array<{ name: string; bytes: Buffer; mode?: number }> = []
  const walk = (d: string, prefix: string) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f)
      const st = statSync(p)
      if (st.isDirectory()) walk(p, `${prefix}${f}/`)
      else out.push({ name: `${prefix}${f}`, bytes: readFileSync(p), mode: st.mode & 0o7777 })
    }
  }
  walk(dir, '')
  return out
}

switch (cmd) {
  case 'bundle':
    cmdBundle()
    break
  case 'signature':
    cmdSignature()
    break
  case 'sync-status':
    cmdSyncStatus()
    break
  case 'pull':
    cmdPull()
    break
  case 'gates':
    await cmdGates()
    break
  default:
    console.error('usage: design bundle|gates|signature|sync-status|pull [options] — see src/cli.ts')
    process.exit(2)
}

export { CARD_VIEWPORTS }
