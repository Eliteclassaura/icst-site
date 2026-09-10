import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkFallbackStack, evaluateFont, isRedistributable, rewriteFontCss } from '../src/fonts.ts'
import { canonicalJson, checkHandshake, manifestHash } from '../src/manifest.ts'
import type { BundleManifest } from '../src/manifest.ts'
import {
  compareSignatures,
  computeSignature,
  signatureDistance,
  SAMENESS_THRESHOLD,
} from '../src/signature.ts'
import { EMPTY_SYNC_STATE, recordSync, syncCapability, syncStatus } from '../src/sync.ts'
import type { SyncStateFile } from '../src/sync.ts'
import { diffTokens, normaliseHtml, pullReport } from '../src/pull.ts'
import { buildHandoff, handoffMarkdown } from '../src/handoff.ts'

const root = resolve(import.meta.dirname, '../../..')
const contract = JSON.parse(readFileSync(resolve(root, 'apps/syed-ai/design/design-contract.json'), 'utf8'))

// ── typography rights (workstream E, R49) ────────────────────────────────────────────────────

describe('font rights and fallback', () => {
  const woff2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(64)])

  it('recognises redistributable licences and nothing else', () => {
    for (const ok of ['OFL-1.1', 'SIL Open Font License 1.1', 'Apache-2.0', 'owned-redistributable', 'MIT'])
      expect(isRedistributable(ok), ok).toBe(true)
    for (const no of ['proprietary', 'Monotype EULA', 'all-rights-reserved', undefined, ''])
      expect(isRedistributable(no), String(no)).toBe(false)
  })

  it('requires a fallback stack that ends in a generic family', () => {
    expect(checkFallbackStack(['Georgia', 'serif'])).toEqual([])
    expect(checkFallbackStack([])).toHaveLength(1)
    expect(checkFallbackStack(['Georgia'])[0]).toMatch(/generic family/)
  })

  it('embeds an OFL family and refuses a proprietary one, with the reason a reviewer reads', () => {
    const ofl = evaluateFont(
      'display',
      {
        family: 'Bodoni Moda',
        fallbacks: ['Didot', 'serif'],
        license: { name: 'OFL-1.1', file: '/fonts/LICENSE.txt' },
        files: [{ path: '/fonts/a.woff2' }],
        display: 'swap',
      },
      () => woff2,
    )
    expect(ofl.embeddable).toBe(true)
    expect(ofl.findings).toEqual([])

    const proprietary = evaluateFont(
      'text',
      {
        family: 'Foundry Sans',
        fallbacks: ['system-ui'],
        license: { name: 'proprietary' },
        files: [{ path: '/fonts/b.woff2' }],
        display: 'swap',
      },
      () => woff2,
    )
    expect(proprietary.embeddable).toBe(false)
    expect(proprietary.reason).toMatch(/does not permit redistribution/)
  })

  it('refuses a "font" whose bytes are not a font', () => {
    const v = evaluateFont(
      'text',
      {
        family: 'Trojan',
        fallbacks: ['sans-serif'],
        license: { name: 'OFL-1.1', file: '/fonts/L.txt' },
        files: [{ path: '/fonts/x.woff2' }],
      },
      () => Buffer.from('<!doctype html><script>x()</script>'),
    )
    expect(v.embeddable).toBe(false)
    expect(v.findings.map((f) => f.rule)).toContain('asset-kind-refused')
  })

  it('inlines admitted faces, repoints shared ones and drops the rest so the fallback shows', () => {
    const css = `@font-face{font-family:'A';src:url(/fonts/a.woff2) format('woff2')}\n@font-face{font-family:'B';src:url(/fonts/b.woff2) format('woff2')}`
    const admitted = new Map([['/fonts/a.woff2', Buffer.from('wOF2xx')]])
    const inline = rewriteFontCss(css, 'inline', admitted)
    expect(inline.css).toContain('data:font/woff2;base64,')
    expect(inline.css).not.toContain('/fonts/b.woff2')
    expect(inline.dropped).toEqual(['B'])
    const shared = rewriteFontCss(css, 'shared', admitted)
    expect(shared.css).toContain('url(../assets/fonts/a.woff2)')
  })

  it('the pilot contract declares redistributable type with a real fallback stack', () => {
    for (const role of ['display', 'text'] as const) {
      const f = contract.typography[role]
      expect(isRedistributable(f.license?.name), `${role} licence ${f.license?.name}`).toBe(true)
      expect(checkFallbackStack(f.fallbacks), role).toEqual([])
    }
  })
})

// ── manifest and handshake (workstreams A, B; R50, R54) ──────────────────────────────────────

describe('manifest and push handshake', () => {
  const base: BundleManifest = {
    manifestVersion: 1,
    site: 'syed-ai',
    brand: 'syed-ai',
    contractHash: 'a'.repeat(64),
    registryVersion: 'r1',
    fontsMode: 'inline',
    viewports: [1440, 390],
    signature: { summary: 's', axes: {} },
    fonts: [],
    files: { 'a.html': 'h' },
  }

  it('canonical JSON is stable under key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }))
    expect(manifestHash(base)).toBe(manifestHash({ ...base }))
  })

  it('claims an empty design-system project', () => {
    expect(checkHandshake({ local: base, remote: null, remoteProjectType: 'design-system' })).toEqual({
      ok: true,
      action: 'claim',
    })
  })

  it('refuses a project belonging to another client (R50)', () => {
    const v = checkHandshake({
      local: base,
      remote: { site: 'other-client' },
      remoteProjectType: 'design-system',
    })
    expect(v).toMatchObject({ ok: false, reason: 'site-mismatch' })
  })

  it('refuses a project that is not a design system, and one whose type it cannot read', () => {
    expect(checkHandshake({ local: base, remote: null, remoteProjectType: 'plain' })).toMatchObject({
      ok: false,
      reason: 'wrong-project-type',
    })
    expect(checkHandshake({ local: base, remote: null, remoteProjectType: null })).toMatchObject({
      ok: false,
      reason: 'unknown-project-type',
    })
  })

  it('refuses to overwrite a project edited since the last pull (R54)', () => {
    const v = checkHandshake({
      local: base,
      remote: { site: 'syed-ai' },
      remoteProjectType: 'design-system',
      lastPulledHash: 'x',
      remoteHash: 'y',
    })
    expect(v).toMatchObject({ ok: false, reason: 'remote-changed' })
  })
})

// ── distinctiveness (workstream B) ───────────────────────────────────────────────────────────

describe('design signature — template sameness', () => {
  const a = computeSignature(contract, 'syed-ai')

  it('summarises the decisions a viewer perceives', () => {
    expect(a.summary).toMatch(/ground/)
    expect(a.axes.canvasLightness).toBeLessThan(0.2) // the pilot is a dark contract
  })

  it('a copied contract is indistinguishable, and that is blocking for a new client', () => {
    const clone = computeSignature({ ...contract, meta: { client: 'copycat' } }, 'copycat')
    expect(signatureDistance(a, clone)).toBe(0)
    const findings = compareSignatures([a, clone], 'copycat')
    expect(findings).toHaveLength(1)
    expect(findings[0]!.blocking).toBe(true)
  })

  it('two existing clients that have converged are advisory, not blocking', () => {
    const clone = computeSignature({ ...contract, meta: { client: 'sibling' } }, 'sibling')
    expect(compareSignatures([a, clone])[0]!.blocking).toBe(false)
  })

  it('a genuinely different design system clears the threshold', () => {
    const other = computeSignature(
      {
        meta: { client: 'landscape' },
        colors: {
          accent: { value: '#2E7D32' },
          canvas: { value: '#FBFAF6' },
          textPrimary: { value: '#14251A' },
        },
        typography: {
          display: { family: 'Sora' },
          text: { family: 'Source Serif 4' },
          scale: { d1: { value: '2.5rem' }, body: { value: '1rem' } },
        },
        layout: { radius: { md: { value: '18px' } }, spacing: { 1: { value: '6px' }, 2: { value: '12px' } } },
      },
      'landscape',
    )
    expect(signatureDistance(a, other)).toBeGreaterThan(SAMENESS_THRESHOLD)
    expect(compareSignatures([a, other], 'landscape')).toEqual([])
  })
})

// ── truthful sync status (workstream F) ──────────────────────────────────────────────────────

describe('design-sync status is evidence, not assertion', () => {
  const gates = { residue: true, renderCheck: true }
  const owner = { FACTORY_DESIGN_LOGIN: '1' }

  it('knows where it is running, and CI and cloud win over a claimed login', () => {
    expect(syncCapability({ CI: 'true', FACTORY_DESIGN_LOGIN: '1' }).environment).toBe('ci')
    expect(syncCapability({ FACTORY_CLOUD_SESSION: '1', FACTORY_DESIGN_LOGIN: '1' }).canSync).toBe(false)
    expect(syncCapability({}).canSync).toBe(false)
    expect(syncCapability(owner).canSync).toBe(true)
  })

  it('a cloud session reports that nothing was pushed, in words a person can read', () => {
    const r = syncStatus({
      capability: syncCapability({ FACTORY_CLOUD_SESSION: '1' }),
      state: EMPTY_SYNC_STATE,
      bundleHash: 'abc123',
      gates,
    })
    expect(r.status).toBe('unavailable-in-this-session')
    expect(r.synced).toBe(false)
    expect(r.message).toMatch(/cannot run here/)
    expect(r.message).toMatch(/never been pushed/)
  })

  it('reports ok only for the exact bundle a push recorded', () => {
    const state: SyncStateFile = {
      version: 1,
      last: {
        syncedManifestHash: 'abc123',
        remoteManifestHash: 'r1',
        projectId: 'p',
        at: '2026-09-10T00:00:00.000Z',
        by: 'owner-workstation',
      },
    }
    expect(syncStatus({ capability: syncCapability(owner), state, bundleHash: 'abc123', gates }).status).toBe(
      'ok',
    )
    const stale = syncStatus({ capability: syncCapability(owner), state, bundleHash: 'def456', gates })
    expect(stale.status).toBe('stale')
    expect(stale.synced).toBe(false)
  })

  it('a red gate blocks before anything else is considered', () => {
    expect(
      syncStatus({
        capability: syncCapability(owner),
        state: EMPTY_SYNC_STATE,
        bundleHash: 'x',
        gates: { residue: false, renderCheck: true },
      }).status,
    ).toBe('blocked-residue')
    expect(
      syncStatus({
        capability: syncCapability(owner),
        state: EMPTY_SYNC_STATE,
        bundleHash: 'x',
        gates: { residue: true, renderCheck: false },
      }).status,
    ).toBe('blocked-render-check')
    expect(
      syncStatus({ capability: syncCapability(owner), state: EMPTY_SYNC_STATE, bundleHash: null, gates })
        .status,
    ).toBe('blocked-no-bundle')
    expect(
      syncStatus({
        capability: syncCapability(owner),
        state: EMPTY_SYNC_STATE,
        bundleHash: 'x',
        gates,
        handshake: { ok: false, reason: 'site-mismatch' },
      }).status,
    ).toBe('blocked-handshake')
  })

  it('a sync cannot be recorded from a session that cannot sync, or without a remote hash', () => {
    const now = new Date('2026-09-10T00:00:00.000Z')
    expect(() =>
      recordSync({
        capability: syncCapability({ FACTORY_CLOUD_SESSION: '1' }),
        bundleHash: 'a',
        remoteManifestHash: 'r',
        projectId: 'p',
        now,
      }),
    ).toThrow(/refusing to record a sync from cloud-session/)
    expect(() =>
      recordSync({
        capability: syncCapability(owner),
        bundleHash: 'a',
        remoteManifestHash: null,
        projectId: 'p',
        now,
      }),
    ).toThrow(/without a remote manifest hash/)
    expect(
      recordSync({
        capability: syncCapability(owner),
        bundleHash: 'a',
        remoteManifestHash: 'r',
        projectId: 'p',
        now,
      }).syncedManifestHash,
    ).toBe('a')
  })
})

// ── design-pull three-way report (workstreams B, C, H) ───────────────────────────────────────

describe('design-pull lanes and refusals', () => {
  const local = {
    colors: { accent: { value: '#CFAF67' }, canvas: { value: '#060504' }, textPrimary: { value: '#F7F5F0' } },
    accessibility: { contrastPairs: [{ foreground: 'accent', background: 'canvas', use: 'body-text' }] },
  }

  it('accepts a token the contrast gate allows and refuses one it does not', () => {
    const ok = diffTokens(local, { colors: { accent: { value: '#E3C888' } } }, 'tokens/design-contract.json')
    expect(ok[0]).toMatchObject({ token: 'accent', accepted: true })
    const bad = diffTokens(local, { colors: { accent: { value: '#1A1A1A' } } }, 'tokens/design-contract.json')
    expect(bad[0]!.accepted).toBe(false)
    expect(bad[0]!.reason).toMatch(/contrast gate/)
  })

  it('normalises HTML so re-serialisation is not mistaken for an edit (ADR-027 §9)', () => {
    expect(normaliseHtml('<p>a</p>\n  <p>b</p>')).toBe(normaliseHtml('<p>a</p><p>b</p>'))
    expect(normaliseHtml('<!-- x --><p>a</p>')).toBe(normaliseHtml('<p>a</p>'))
  })

  it('routes each change to exactly one lane and refuses anything else', () => {
    const entries = [
      {
        name: 'tokens/design-contract.json',
        bytes: Buffer.from(JSON.stringify({ colors: { accent: { value: '#E3C888' } } })),
      },
      { name: 'components/hero/default-1440.html', bytes: Buffer.from('<main><h1>edited</h1></main>') },
      { name: 'copy/home.md', bytes: Buffer.from('New headline the client wrote') },
      { name: '_ds_manifest.json', bytes: Buffer.from('{}') },
      { name: 'scripts/postinstall.js', bytes: Buffer.from('require("child_process")') },
      { name: 'random/thing.bin', bytes: Buffer.from('x') },
    ]
    const r = pullReport({ site: 'syed-ai', entries, contract: local, localHashes: {} })
    expect(r.tokens).toHaveLength(1)
    expect(r.tokens[0]!.accepted).toBe(true)
    expect(r.components.map((c) => c.path)).toEqual(['components/hero/default-1440.html'])
    expect(r.copy.map((c) => c.path)).toEqual(['copy/home.md'])
    expect(r.paneOwned).toEqual(['_ds_manifest.json'])
    expect(r.rejected.map((x) => x.rule).sort()).toEqual(['executable-asset', 'unclassified'])
  })

  it('refuses a component card that came back carrying script', () => {
    const r = pullReport({
      site: 'syed-ai',
      entries: [
        {
          name: 'components/hero/default-1440.html',
          bytes: Buffer.from('<main><script>x()</script></main>'),
        },
      ],
      contract: local,
      localHashes: {},
    })
    expect(r.components).toEqual([])
    expect(r.rejected[0]!.rule).toBe('script-element')
  })
})

// ── reviewer handoff (workstream I) ──────────────────────────────────────────────────────────

describe('reviewer handoff', () => {
  it('states versions, artboards with viewports and hashes, rights, warnings and the sync truth', () => {
    const manifest: BundleManifest = {
      manifestVersion: 1,
      site: 'syed-ai',
      brand: 'syed-ai',
      contractHash: 'c'.repeat(64),
      registryVersion: 'r1',
      fontsMode: 'inline',
      viewports: [1440, 390],
      signature: { summary: 'dark ground', axes: {} },
      fonts: [
        {
          family: 'Bodoni Moda',
          role: 'display',
          license: 'OFL-1.1',
          embedded: true,
          files: ['/fonts/a.woff2'],
        },
        {
          family: 'Foundry Sans',
          role: 'text',
          license: 'proprietary',
          embedded: false,
          reason: 'licence does not permit redistribution',
          files: [],
        },
      ],
      files: {},
    }
    const md = handoffMarkdown(
      buildHandoff({
        manifest,
        manifestHash: 'm'.repeat(64),
        artboards: [
          {
            path: 'components/hero/default-390.html',
            kind: 'component-card',
            viewport: 390,
            bytes: 1024,
            sha256: 'a'.repeat(64),
          },
        ],
        findings: [{ rule: 'font-not-embedded', detail: 'Foundry Sans dropped', blocking: false }],
        sameness: [],
        sync: {
          status: 'unavailable-in-this-session',
          message: 'cloud session',
          synced: false,
          lastSyncedHash: null,
        },
        gates: { residue: 'pass', 'render-check': 'pass', determinism: 'pass' },
        qaViewports: [360, 390, 768, 1024, 1440],
        toolVersions: { registry: 'r1' },
      }),
    )
    expect(md).toContain('Design handoff — syed-ai')
    expect(md).toContain('components/hero/default-390.html')
    expect(md).toContain('390')
    expect(md).toContain('**not embedded**')
    expect(md).toContain('360, 390, 768, 1024, 1440')
    expect(md).toContain('unavailable-in-this-session')
    expect(md).toContain('Nothing in this handoff asserts')
  })
})
