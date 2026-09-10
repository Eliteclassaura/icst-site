/**
 * `pnpm design:bundle` — the deterministic design-system bundle (C5.5 workstream A, ADR-026).
 *
 * Pure-ish by design: this module reads the repository through the injected `io` and returns the
 * complete file set plus a manifest and a findings list. The CLI writes it. Nothing here consults
 * a clock, a hostname or an environment variable, so two runs on the same commit produce
 * byte-identical bytes — which is the property the handshake, the ledger and the reviewer handoff
 * all lean on.
 */
import { registry } from '@factory/agency-core/blocks'
import { blockManifest } from '@factory/agency-core/blocks/manifest'
import { contrastRatio, REQUIRED } from '@factory/design-contract'
import { applyBrand, hasBrandPlaceholder, NEUTRAL_BRAND, resolveBrand } from './brand.ts'
import type { BrandOverrides, FixtureBrand } from './brand.ts'
import { evaluateFont, rewriteFontCss } from './fonts.ts'
import type { ContractFont, FontVerdict } from './fonts.ts'
import { canonicalJson, MANIFEST_PATH, MANIFEST_VERSION, manifestHash, sha256 } from './manifest.ts'
import type { BundleManifest, FontRights } from './manifest.ts'
import {
  boardDocument,
  cardDocument,
  chromeBoard,
  colorBoard,
  kebab,
  radiiMotionBoard,
  renderCardBody,
  spacingBoard,
  typeBoard,
} from './render.tsx'
import { computeSignature } from './signature.ts'
import { checkCss, checkMarkup, checkSvg, decodeSvgDataUrl } from './safety/markup.ts'
import { inspectAsset, IMAGE_POLICY } from './safety/assets.ts'

/** The bundle's card viewports. The render check exercises all five QA widths against the site. */
export const CARD_VIEWPORTS = [1440, 390] as const

/** ADR-026: a card must stay under this so a design pane never refuses one. */
export const MAX_CARD_BYTES = 256 * 1024

export type BundleIo = {
  /** UTF-8 read relative to the repository root; throws when missing. */
  readText: (rel: string) => string
  /** Binary read relative to the repository root; null when missing. */
  readBinary: (rel: string) => Buffer | null
  /** Every `.css` under a directory, sorted, relative to the repository root. */
  listCss: (rel: string) => string[]
  /** `git describe`-style pin for the manifest; injected so the build stays pure. */
  revision: string
}

export type BundleOptions = {
  site: string
  fontsMode: 'inline' | 'shared'
  /** Render with the neutral preset identity instead of the client's. */
  neutral?: boolean
  io: BundleIo
}

export type BundleFinding = { rule: string; detail: string; blocking: boolean }

export type BundleResult = {
  files: Map<string, string | Buffer>
  manifest: BundleManifest
  manifestHash: string
  findings: BundleFinding[]
  brand: FixtureBrand
  fonts: FontVerdict[]
}

type Contract = {
  meta?: { client?: string }
  colors?: Record<string, { value?: string }>
  typography?: {
    display?: ContractFont
    text?: ContractFont
    scale?: Record<string, { value?: string }>
  }
  layout?: {
    spacing?: Record<string, { value?: string }>
    radius?: Record<string, { value?: string }>
    container?: Record<string, { value?: string }>
  }
  motion?: { durations?: Record<string, { value?: string }>; easings?: Record<string, { value?: string }> }
  accessibility?: { contrastPairs?: Array<{ foreground: string; background: string; use: string }> }
}

function pairs(map: Record<string, { value?: string }> | undefined): Array<[string, string]> {
  return Object.entries(map ?? {})
    .map(([k, v]) => [k, v.value ?? ''] as [string, string])
    .filter(([, v]) => v !== '')
}

/** Deterministic id for the registry: which blocks, with which fixtures, in manifest order. */
export function registryVersion(): string {
  return sha256(canonicalJson(blockManifest.map((b) => ({ slug: b.slug, fixtures: b.fixtures })))).slice(
    0,
    16,
  )
}

/**
 * Walk fixture props for anything that is an image and check it: a fixture image is a generated
 * data-URL SVG today, but a fixture is data and data drifts, so the bundle verifies rather than
 * assumes (R34, workstream H).
 */
const ASSET_KEYS = new Set(['url', 'src', 'poster', 'image', 'srcset', 'monogramPath'])

function isAssetKey(where: string): boolean {
  const key =
    where
      .split('.')
      .pop()
      ?.replace(/\[\d+\]$/, '') ?? ''
  return ASSET_KEYS.has(key)
}

function checkFixtureAssets(value: unknown, where: string, findings: BundleFinding[]): void {
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) {
      const svg = decodeSvgDataUrl(value)
      if (svg)
        for (const f of checkSvg(svg, `${where} (data-url svg)`)) findings.push({ ...f, blocking: true })
      else {
        const m = /^data:([^;,]+)[^,]*,(.*)$/is.exec(value)
        if (m) {
          const buf = Buffer.from(
            m[2] as string,
            /;base64/i.test(value.slice(0, m[0].length - (m[2] as string).length)) ? 'base64' : 'utf8',
          )
          const verdict = inspectAsset(
            `${where}.${(m[1] as string).split('/')[1] ?? 'bin'}`,
            buf,
            IMAGE_POLICY,
          )
          for (const f of verdict.findings)
            findings.push({ rule: f.rule, detail: `${where}: ${f.detail}`, blocking: true })
        }
      }
    } else if (/^(https?:)?\/\//i.test(value) && isAssetKey(where)) {
      // An outbound *link* is content (a cited source, a profile); an outbound *asset* would make
      // the card fetch at render time, which a self-contained artefact must never do.
      findings.push({
        rule: 'fixture-external-asset',
        detail: `${where} loads an asset off-document: ${value.slice(0, 80)}`,
        blocking: true,
      })
    }
    if (hasBrandPlaceholder(value))
      findings.push({
        rule: 'brand-placeholder-unresolved',
        detail: `${where} still contains a {{brand.*}} placeholder`,
        blocking: true,
      })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkFixtureAssets(v, `${where}[${i}]`, findings))
    return
  }
  if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      checkFixtureAssets(v, `${where}.${k}`, findings)
}

export function buildBundle(opts: BundleOptions): BundleResult {
  const { io, site } = opts
  const app = `apps/${site}`
  const findings: BundleFinding[] = []
  const files = new Map<string, string | Buffer>()

  const contractText = io.readText(`${app}/design/design-contract.json`)
  const contract = JSON.parse(contractText) as Contract
  const contractHash = sha256(canonicalJson(contract))

  // ── identity ────────────────────────────────────────────────────────────────────────────────
  let brand: FixtureBrand = NEUTRAL_BRAND
  if (!opts.neutral) {
    const blueprint = JSON.parse(io.readText(`${app}/content/${site}.blueprint.json`)) as Parameters<
      typeof resolveBrand
    >[1]
    const overridesText = io.readBinary(`${app}/design/fixture-brand.json`)
    const overrides = overridesText ? (JSON.parse(overridesText.toString('utf8')) as BrandOverrides) : {}
    brand = resolveBrand(site, blueprint, overrides)
  }

  // ── fonts and rights ────────────────────────────────────────────────────────────────────────
  const readFont = (p: string) => io.readBinary(`${app}/public${p}`)
  const fontVerdicts: FontVerdict[] = []
  for (const role of ['display', 'text'] as const) {
    const font = contract.typography?.[role]
    if (!font) continue
    const verdict = evaluateFont(role, font, readFont)
    fontVerdicts.push(verdict)
    for (const f of verdict.findings)
      findings.push({ rule: f.rule, detail: f.detail, blocking: f.rule.startsWith('executable') })
  }
  const admitted = new Map<string, Buffer>()
  for (const v of fontVerdicts) {
    if (!v.embeddable) continue
    for (const p of v.files) {
      const bytes = readFont(p)
      if (bytes) admitted.set(p, bytes)
    }
  }

  // ── CSS ─────────────────────────────────────────────────────────────────────────────────────
  const gen = `${app}/src/design/generated`
  const { css: fontsCss, dropped } = rewriteFontCss(io.readText(`${gen}/fonts.css`), opts.fontsMode, admitted)
  for (const family of dropped)
    findings.push({
      rule: 'font-not-embedded',
      detail: `${family}: @font-face dropped; cards render the fallback stack`,
      blocking: false,
    })

  const blockCss = io.listCss('packages/agency-core/src/blocks')
  const css = [
    io.readText(`${gen}/tokens.css`),
    fontsCss,
    io.readText('packages/agency-core/src/design-system/global.css'),
    io.readText('packages/agency-core/src/design-system/primitives.css'),
    ...blockCss.map((p) => io.readText(p)),
    // Every card paints its own ground so a dark contract never lands dark text on a light pane (ADR-026 §9).
    'html{color-scheme:only light}body{background:var(--color-canvas);color:var(--color-text-body);margin:0}',
  ].join('\n')
  for (const f of checkCss(css, 'bundle stylesheet')) findings.push({ ...f, blocking: true })

  if (opts.fontsMode === 'shared')
    for (const [p, bytes] of [...admitted].sort(([a], [b]) => (a < b ? -1 : 1)))
      files.set(`assets/fonts/${p.split('/').pop()}`, bytes)
  for (const v of fontVerdicts) {
    if (!v.embeddable) continue
    const licFile = contract.typography?.[v.role as 'display' | 'text']?.license?.file
    if (!licFile) continue
    const lic = io.readBinary(`${app}/public${licFile}`)
    // The licence text travels with the font it licenses; an embedded face without it is a rights gap.
    if (lic) files.set(`assets/fonts/${licFile.split('/').pop()}`, lic)
    else
      findings.push({
        rule: 'font-licence-file',
        detail: `${v.family}: licence file ${licFile} is not on disk`,
        blocking: false,
      })
  }

  // ── component cards ─────────────────────────────────────────────────────────────────────────
  for (const entry of blockManifest) {
    const def = registry.find((b) => b.slug === entry.slug)
    if (!def) {
      findings.push({
        rule: 'registry-drift',
        detail: `manifest lists ${entry.slug} but the registry has no such block`,
        blocking: true,
      })
      continue
    }
    for (const fixture of entry.fixtures) {
      const raw = (def.fixtures as Record<string, unknown>)[fixture]
      const props = applyBrand(raw, brand)
      checkFixtureAssets(props, `${entry.slug}/${fixture}`, findings)
      const body = renderCardBody(
        def.Component as unknown as Parameters<typeof renderCardBody>[0],
        props,
        def.slug,
        def.kind,
      )
      for (const w of CARD_VIEWPORTS) {
        const html = cardDocument(
          {
            group: def.kind === 'chrome' ? 'Chrome' : 'Components',
            name: `${def.label} · ${fixture}`,
            viewport: w,
            block: def.slug,
            fixture,
          },
          css,
          body,
        )
        for (const f of checkMarkup(html, `${entry.slug}/${fixture}-${w}`))
          findings.push({ ...f, blocking: true })
        const bytes = Buffer.byteLength(html)
        if (bytes > MAX_CARD_BYTES)
          findings.push({
            rule: 'card-too-large',
            detail: `${entry.slug}/${fixture}-${w}.html is ${(bytes / 1024).toFixed(0)} KiB (cap ${MAX_CARD_BYTES / 1024} KiB)`,
            blocking: true,
          })
        files.set(`components/${def.slug}/${fixture}-${w}.html`, html)
      }
    }
  }

  // ── foundation boards ───────────────────────────────────────────────────────────────────────
  const scale = pairs(contract.typography?.scale).map(([token, value]) => ({ token, value }))
  const fontBoardRows = fontVerdicts.map((v) => ({
    role: v.role,
    family: v.family,
    license: v.licenseName,
    embedded: v.embeddable,
    reason: v.reason,
    fallbacks: v.fallbacks,
  }))
  const swatches = pairs(contract.colors).map(([token, value]) => ({ token, value }))
  const contrastRows = (contract.accessibility?.contrastPairs ?? []).map((p) => {
    const fg = contract.colors?.[p.foreground]?.value ?? '#000000'
    const bg = contract.colors?.[p.background]?.value ?? '#ffffff'
    const ratio = contrastRatio(fg, bg)
    const passes = ratio >= (REQUIRED[p.use] ?? 4.5)
    if (!passes)
      findings.push({
        rule: 'contrast-fail',
        detail: `${p.foreground} on ${p.background} (${p.use}) is ${ratio.toFixed(2)}:1`,
        blocking: true,
      })
    return { ...p, ratio, passes }
  })

  const boards: Array<[string, string, string]> = [
    ['type', 'Type', typeBoard({ scale, fonts: fontBoardRows, brand })],
    ['colors', 'Colours', colorBoard(swatches, contrastRows)],
    ['spacing', 'Spacing', spacingBoard(pairs(contract.layout?.spacing), pairs(contract.layout?.container))],
    [
      'radii-motion',
      'Radii & motion',
      radiiMotionBoard(pairs(contract.layout?.radius), [
        ...pairs(contract.motion?.durations),
        ...pairs(contract.motion?.easings),
      ]),
    ],
    [
      'chrome',
      'Chrome',
      chromeBoard(
        brand,
        blockManifest.filter((b) => b.kind === 'chrome').map((b) => b.slug),
      ),
    ],
  ]
  for (const [slug, name, body] of boards) {
    const html = boardDocument(name, 'Foundations', 1440, css, body)
    for (const f of checkMarkup(html, `foundations/${slug}`)) findings.push({ ...f, blocking: true })
    files.set(`foundations/${slug}.html`, html)
  }

  // ── the return path's own file (ADR-026 §7) ─────────────────────────────────────────────────
  files.set('tokens/design-contract.json', canonicalJson(contract))

  // ── manifest ────────────────────────────────────────────────────────────────────────────────
  const signature = computeSignature(contract, site)
  const fontRights: FontRights[] = fontVerdicts.map((v) => ({
    family: v.family,
    role: v.role,
    license: v.licenseName,
    embedded: v.embeddable,
    reason: v.reason,
    files: v.files,
  }))
  const fileHashes: Record<string, string> = {}
  for (const key of [...files.keys()].sort()) fileHashes[key] = sha256(files.get(key) as string | Buffer)

  const manifest: BundleManifest = {
    manifestVersion: MANIFEST_VERSION,
    site,
    brand: brand.id,
    contractHash,
    registryVersion: registryVersion(),
    fontsMode: opts.fontsMode,
    viewports: [...CARD_VIEWPORTS],
    signature: { summary: signature.summary, axes: signature.axes as unknown as Record<string, number> },
    fonts: fontRights,
    files: fileHashes,
  }
  files.set(MANIFEST_PATH, canonicalJson(manifest))

  findings.sort((a, b) => (a.rule + a.detail < b.rule + b.detail ? -1 : 1))
  return { files, manifest, manifestHash: manifestHash(manifest), findings, brand, fonts: fontVerdicts }
}

export { kebab }
