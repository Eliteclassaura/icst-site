import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Render check for the design bundle (C5.5 workstream D, ADR-026 "Render check").
 *
 * The bundle's own build already refuses unsafe markup, oversized cards and unresolved identity.
 * This is the other half: opening every card in a real browser, at the width it declares, and
 * asserting it renders — no console error, no failed request, no accessibility violation, and the
 * fonts it claims to embed actually resolve.
 *
 * Cards are opened as `file://` URLs. That is deliberate: a card is a file that will be opened
 * from disk, from a hosted pane and from an artifact, and the strictest of those has no origin
 * and no network. If a card needs the dev server to look right, it is not self-contained.
 *
 * The verdict is written to `_factory/render-check.json`, keyed by the manifest hash, and
 * `pnpm design:gates` refuses to treat it as a pass for any other bundle.
 */

const BUNDLE = resolve(process.env.FACTORY_BUNDLE_DIR ?? join(process.cwd(), 'design/ds-bundle'))
const MANIFEST = join(BUNDLE, '_factory/manifest.json')

type Manifest = {
  site: string
  brand: string
  contractHash: string
  registryVersion: string
  fontsMode: 'inline' | 'shared'
  files: Record<string, string>
  fonts: Array<{ family: string; embedded: boolean }>
}

const present = existsSync(MANIFEST)
const manifest: Manifest | null = present ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest) : null
const cards = manifest
  ? Object.keys(manifest.files)
      .filter((f) => f.endsWith('.html'))
      .sort()
  : []

/** Same hash the CLI computes, so a verdict cannot be claimed for a different bundle. */
function manifestHash(m: Manifest): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical)
    if (v && typeof v === 'object') {
      const src = v as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(src).sort()) out[k] = canonical(src[k])
      return out
    }
    return v
  }
  const subset = {
    site: m.site,
    brand: m.brand,
    contractHash: m.contractHash,
    registryVersion: m.registryVersion,
    fontsMode: m.fontsMode,
    files: m.files,
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(subset), null, 2) + '\n')
    .digest('hex')
}

const failures: string[] = []

test.beforeEach(({}, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('-1440'), 'the render check drives its own viewports')
  test.skip(!present, `no bundle at ${BUNDLE} — run pnpm design:bundle --site syed-ai first`)
})

for (const card of cards) {
  test(`@design-card ${card}: renders clean at its declared viewport`, async ({ page }) => {
    const file = join(BUNDLE, card)
    const html = readFileSync(file, 'utf8')

    // The card names the width it is faithful at; open it there, not at the project's width.
    const viewport = Number(/viewport="(\d+)"/.exec(html)?.[1] ?? 0)
    expect(viewport, `${card} declares a viewport`).toBeGreaterThan(0)
    await page.setViewportSize({ width: viewport, height: 1200 })

    const consoleErrors: string[] = []
    const requestFailures: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('requestfailed', (r) =>
      requestFailures.push(`${r.url().slice(0, 80)}: ${r.failure()?.errorText}`),
    )
    page.on('request', (r) => {
      // A self-contained card fetches nothing over the network. Anything but file:/data: is a leak.
      if (!/^(file|data):/i.test(r.url())) requestFailures.push(`network request to ${r.url().slice(0, 80)}`)
    })

    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' })
    await expect(page.locator('main[data-block]')).toHaveCount(1)

    // The card paints its own ground (ADR-026 §9) — never the pane's.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg, `${card} paints its own background`).not.toBe('rgba(0, 0, 0, 0)')

    const results = await new AxeBuilder({ page }).analyze()
    if (results.violations.length) failures.push(`${card}: ${results.violations.map((v) => v.id).join(', ')}`)
    expect(
      results.violations,
      JSON.stringify(
        results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
        null,
        1,
      ),
    ).toEqual([])

    if (consoleErrors.length) failures.push(`${card}: console ${consoleErrors[0]}`)
    expect(consoleErrors, `${card} console`).toEqual([])
    if (requestFailures.length) failures.push(`${card}: ${requestFailures[0]}`)
    expect(requestFailures, `${card} requests`).toEqual([])
  })
}

test('@design-card fonts the manifest claims to embed actually load', async ({ page }) => {
  test.skip(!manifest, 'no bundle')
  const m = manifest as Manifest
  const card = cards.find((c) => c.startsWith('foundations/type')) ?? (cards[0] as string)
  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.goto(pathToFileURL(join(BUNDLE, card)).href, { waitUntil: 'load' })
  const loaded = await page.evaluate(async () => {
    await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready
    const set = new Set<string>()
    for (const f of (document as unknown as { fonts: Set<{ family: string; status: string }> }).fonts)
      if (f.status === 'loaded') set.add(f.family.replace(/["']/g, ''))
    return [...set]
  })
  for (const f of m.fonts.filter((x) => x.embedded))
    expect(loaded, `${f.family} is declared embedded and must resolve inside the card`).toContain(f.family)
})

test.afterAll(() => {
  if (!manifest) return
  writeFileSync(
    join(BUNDLE, '_factory/render-check.json'),
    JSON.stringify(
      { ok: failures.length === 0, manifestHash: manifestHash(manifest), cards: cards.length, failures },
      null,
      2,
    ) + '\n',
  )
})
