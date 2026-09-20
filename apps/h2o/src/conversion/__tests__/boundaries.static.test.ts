/**
 * Static and adversarial checks on the adapter's own source.
 *
 * Some of 2C-min's obligations are about what the code must *not* contain — no purchase controls,
 * no Revenue Engine, no CRM, no third-party script, no secret. Those cannot be proved by calling a
 * function, so they are asserted against the source text. A future edit that reintroduces one of
 * them fails here rather than at review.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ADAPTER_DIR = path.resolve(DIR, '..')
const APP_SRC = path.resolve(ADAPTER_DIR, '..')

const adapterFiles = readdirSync(ADAPTER_DIR)
  .filter((name) => /\.(css|ts|tsx)$/.test(name))
  .map((name) => ({ name, text: readFileSync(path.join(ADAPTER_DIR, name), 'utf8') }))

/**
 * Strip comments before scanning.
 *
 * These checks are about what the adapter *does*, and a doc comment saying "there is no checkout
 * here" is not a checkout. Scanning raw text made the suite fail on its own explanatory prose,
 * which would have pushed the next author to delete the explanation rather than the behaviour —
 * exactly backwards. The stripper is string-aware so that `'https://form.typeform.com'` survives.
 */
const stripComments = (source: string): string => {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < source.length) {
    const ch = source[i] as string
    const next = source[i + 1]
    if (quote !== null) {
      out += ch
      if (ch === '\\') {
        out += source[i + 1] ?? ''
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/** Code only: comments removed, so an assertion below is about behaviour, never about prose. */
const allAdapterText = adapterFiles.map((f) => stripComments(f.text)).join('\n')
/** Everything, comments included. Used only where the prose itself is the thing being checked. */
const allAdapterSource = adapterFiles.map((f) => f.text).join('\n')

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })

describe('commerce boundary — quote/contact only', () => {
  it.each([
    ['cart', /\bcart\b/i],
    ['checkout', /\bcheckout\b/i],
    ['add to bag', /add[\s_-]?to[\s_-]?(cart|bag|basket)/i],
    ['buy now', /\bbuy[\s_-]?now\b/i],
    ['purchase control', /\bpurchase\b/i],
    ['Offer schema', /schema\.org\/Offer|"@type"\s*:\s*"Offer"/],
    ['price property', /\bpriceCurrency\b|\bpriceValidUntil\b/],
  ])('contains no %s', (_label, pattern) => {
    expect(allAdapterText).not.toMatch(pattern)
  })

  it('never reads or writes a catalog commerce field', () => {
    for (const field of ['commerce_mode', 'public_price', 'fixed_price_research_candidate']) {
      expect(allAdapterText).not.toContain(field)
    }
  })

  it('never imports Payload, a collection, or the generated types', () => {
    expect(allAdapterText).not.toMatch(/from\s+'payload'/)
    expect(allAdapterText).not.toMatch(/from\s+'@payloadcms\//)
    expect(allAdapterText).not.toMatch(/payload-types/)
    expect(allAdapterText).not.toMatch(/\.\.\/collections/)
  })

  it('leaves every accepted collection and hook untouched by this increment', () => {
    // The adapter is additive: nothing outside src/conversion imports it yet, so no existing
    // module's behaviour can have changed because of it.
    const importers = walk(APP_SRC)
      .filter((file) => !file.startsWith(ADAPTER_DIR))
      .filter((file) => /from\s+'[^']*conversion/.test(readFileSync(file, 'utf8')))
    expect(importers).toEqual([])
  })
})

describe('Revenue Engine and CRM boundary', () => {
  it.each([
    ['Revenue Engine', /revenue[\s_-]?engine/i],
    ['CRM', /\bcrm\b/i],
    ['lead scoring', /lead[\s_-]?(score|scoring|qualif)/i],
    ['opportunity', /\bopportunity\b/i],
    ['pipeline value', /pipeline[\s_-]?value/i],
    ['reviewer workflow', /reviewer[\s_-]?(workflow|queue|assignment)/i],
    ['RFQ workflow expansion', /rfq[\s_-]?(workflow|queue|pipeline)/i],
  ])('does not activate %s', (_label, pattern) => {
    expect(allAdapterText).not.toMatch(pattern)
  })

  it('sends nothing anywhere — no network call leaves the adapter', () => {
    expect(allAdapterText).not.toMatch(/\bfetch\s*\(/)
    expect(allAdapterText).not.toMatch(/XMLHttpRequest|navigator\.sendBeacon/)
  })

  it('emits no event that claims a lead or revenue', () => {
    expect(allAdapterText).not.toMatch(/'lead'|"lead"|'revenue'|"revenue"/)
  })
})

describe('third-party surface', () => {
  it('loads no Typeform SDK or any other remote script', () => {
    expect(allAdapterSource).not.toMatch(/embed\.typeform\.com/)
    expect(allAdapterSource).not.toMatch(/createElement\(\s*'script'\s*\)/)
    expect(allAdapterSource).not.toMatch(/<script/i)
    expect(allAdapterSource).not.toMatch(/@typeform\//)
  })

  it('names exactly one remote host, and it is the approved one', () => {
    const hosts = [...allAdapterSource.matchAll(/https:\/\/([A-Za-z0-9.-]+)/g)]
      .map((m) => m[1])
      .filter((host) => host !== undefined && !host.endsWith('.example') && host !== 'evil.example')
    expect([...new Set(hosts)]).toEqual(['form.typeform.com'])
  })

  it('creates the iframe only when the dialog is open, so nothing loads before then', () => {
    const cta = adapterFiles.find((f) => f.name === 'QuoteCta.tsx')?.text ?? ''
    const openGuard = cta.indexOf('{state.open ? (')
    const iframe = cta.indexOf('<iframe')
    expect(openGuard).toBeGreaterThan(-1)
    expect(iframe).toBeGreaterThan(openGuard)
  })

  it('renders a real link so the CTA works without JavaScript', () => {
    const cta = adapterFiles.find((f) => f.name === 'QuoteCta.tsx')?.text ?? ''
    expect(cta).toMatch(/<a\b[\s\S]*?href=\{formUrl\}/)
    expect(cta).toContain('rel="noopener noreferrer"')
  })

  it('honours a modified click so the link still opens in a new tab', () => {
    const cta = adapterFiles.find((f) => f.name === 'QuoteCta.tsx')?.text ?? ''
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) expect(cta).toContain(key)
  })
})

describe('secrets and logging', () => {
  it('contains no credential, token or private key', () => {
    expect(allAdapterSource).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/)
    expect(allAdapterSource).not.toMatch(/\b(?:sk|pk|ghp|xox[baprs])[_-][A-Za-z0-9]{16,}/)
    expect(allAdapterSource).not.toMatch(/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]/i)
  })

  it('contains no real or invented form id', () => {
    // The sample id used in tests is fictional and lives only in the test files, never in source.
    for (const file of adapterFiles) {
      expect(file.text).not.toMatch(/\/to\/[A-Za-z0-9]{6,}/)
    }
  })

  it('logs nothing at all from the adapter', () => {
    expect(allAdapterText).not.toMatch(/console\.(log|info|debug|warn|error)/)
  })

  it('reads only the two documented environment variables', () => {
    const envReads = [...allAdapterText.matchAll(/env\.([A-Z0-9_]+)/g)].map((m) => m[1])
    expect([...new Set(envReads)].sort()).toEqual(['H2O_TYPEFORM_FORM_ID', 'H2O_TYPEFORM_ORIGIN'])
  })
})

describe('accessibility and responsiveness, as far as source can attest', () => {
  it('marks the dialog up as a modal dialog with an accessible name', () => {
    const cta = adapterFiles.find((f) => f.name === 'QuoteCta.tsx')?.text ?? ''
    expect(cta).toContain('role="dialog"')
    expect(cta).toContain('aria-modal="true"')
    expect(cta).toContain('aria-labelledby={titleId}')
    expect(cta).toContain('aria-live="polite"')
  })

  it('gives the iframe a title', () => {
    const cta = adapterFiles.find((f) => f.name === 'QuoteCta.tsx')?.text ?? ''
    expect(cta).toMatch(/<iframe[\s\S]*?title=\{title\}/)
  })

  it('respects reduced motion in CSS as well as in the controller', () => {
    const css = adapterFiles.find((f) => f.name === 'QuoteCta.module.css')?.text ?? ''
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('carries a mobile breakpoint and 44px touch targets', () => {
    const css = adapterFiles.find((f) => f.name === 'QuoteCta.module.css')?.text ?? ''
    expect(css).toMatch(/@media\s*\(max-width:\s*40rem\)/)
    expect(css.match(/min-block-size:\s*2\.75rem/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('uses no raw hex colour, so Phase 2D owns the palette', () => {
    const css = adapterFiles.find((f) => f.name === 'QuoteCta.module.css')?.text ?? ''
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
