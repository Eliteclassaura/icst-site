import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { INTAKE_CONTEXT_KEYS } from '../intake/typeform/parse'
import { isConsumerDomain } from '../free-mail'
import { addressQualityOf } from '../address-quality'

/**
 * Static CRM boundaries (syntax-aware, same technique as `site/__tests__/integration-boundary.test.ts`).
 *
 *   - The public site and the conversion adapter never import CRM code, and the static public build never
 *     copies it.
 *   - CRM never imports the public conversion adapter (it is boundary-tested by the site suite).
 *   - CRM source has no network client, no mail transport, no console logging.
 *   - Fixtures contain only reserved example domains.
 */
const DIR = path.dirname(fileURLToPath(import.meta.url))
const CRM = path.resolve(DIR, '..')
const SRC = path.resolve(CRM, '..')
const APP = path.resolve(SRC, '..')

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return walk(full)
    return /\.(ts|tsx|mts|js|mjs)$/.test(e.name) ? [full] : []
  })

const specifiers = (file: string): string[] => {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    )
      out.push(n.moduleSpecifier.text)
    if (
      ts.isCallExpression(n) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === 'require')) &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0])
    )
      out.push(n.arguments[0].text)
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal))
      out.push(n.argument.literal.text)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}
const resolvesInto = (from: string, spec: string, dir: string): boolean => {
  if (spec.startsWith('@/')) return path.resolve(SRC, spec.slice(2)).startsWith(dir)
  if (!spec.startsWith('.')) return false
  return path.resolve(path.dirname(from), spec).startsWith(dir)
}

describe('public site ⟂ CRM', () => {
  it('no file under src/site, src/conversion or src/app/(site) imports src/crm', () => {
    const offenders = [path.join(SRC, 'site'), path.join(SRC, 'conversion'), path.join(SRC, 'app', '(site)')]
      .flatMap(walk)
      .filter((f) => specifiers(f).some((s) => resolvesInto(f, s, CRM)))
    expect(offenders).toEqual([])
  })
  it('the static public build copies site, conversion and (site) only — never src/crm or payload config', () => {
    const prepare = readFileSync(path.join(APP, 'release', 'prepare.mjs'), 'utf8')
    expect(prepare).toMatch(/'src\/site'/)
    expect(prepare).toMatch(/'src\/conversion'/)
    expect(prepare).not.toMatch(/src\/crm|payload\.config/)
    expect(readFileSync(path.join(APP, 'release', 'build.mjs'), 'utf8')).toMatch(
      /delete env\.PAYLOAD_SECRET;delete env\.DATABASE_URI/,
    )
  })
  it('no public-surface source (pages, search index, sitemap, release, site chrome) reads a CRM collection', () => {
    // Go-live (Control Tower 2026-10-02): intake data never reaches public HTML, search or the sitemap. Every
    // public renderer, the search-index builder, the release/sitemap routes and the publishing job live under
    // these four directories; none of them may name a crm-* collection or a crm_* table, or import src/crm.
    const publicDirs = [path.join(SRC, 'content'), path.join(SRC, 'site'), path.join(SRC, 'conversion'), path.join(SRC, 'app', '(site)')]
    const files = publicDirs
      .flatMap(walk)
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !f.includes(`${path.sep}__dbtests__${path.sep}`))
    expect(files.length).toBeGreaterThan(50)
    const offenders = files.filter((f) => {
      const t = readFileSync(f, 'utf8')
      return /['"`]crm-[a-z]|\bcrm_[a-z]+\b/.test(t) || specifiers(f).some((s) => resolvesInto(f, s, CRM))
    })
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
  })
  it('CRM never imports the public conversion adapter', () => {
    const offenders = walk(CRM).filter((f) =>
      specifiers(f).some((s) => resolvesInto(f, s, path.join(SRC, 'conversion'))),
    )
    expect(offenders).toEqual([])
  })
  it('the intake context allowlist equals the accepted adapter allowlist exactly', () => {
    const src = readFileSync(path.join(SRC, 'conversion', 'context.ts'), 'utf8')
    const block = /export const SAFE_CONTEXT_KEYS = \[([\s\S]*?)\] as const/.exec(src)![1]!
    const adapter = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...INTAKE_CONTEXT_KEYS]).toEqual(adapter)
  })
})

describe('CRM source: no live network, no mail, no console, no secrets', () => {
  const files = walk(CRM).filter(
    (f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !f.includes(`${path.sep}__dbtests__${path.sep}`),
  )
  const text = (f: string) => readFileSync(f, 'utf8')
  it('no fetch/http client, no mail transport, no sendEmail', () => {
    const banned =
      /\bfetch\s*\(|from ['"](node:)?(https?|net|tls|dgram)['"]|nodemailer|smtp|sendEmail|axios|undici|XMLHttpRequest|WebSocket/i
    expect(files.filter((f) => banned.test(text(f))).map((f) => path.relative(CRM, f))).toEqual([])
  })
  it('no console logging (logs go through the allowlisted intake logger)', () => {
    expect(
      files
        .filter((f) => /console\.(log|info|warn|error|debug)/.test(text(f)))
        .map((f) => path.relative(CRM, f)),
    ).toEqual([])
  })
  it('no real-looking secret or production host', () => {
    expect(
      files
        .filter((f) => /h2ocooling\.com|BEGIN [A-Z ]*PRIVATE KEY|sk_live_|AKIA[0-9A-Z]{16}/.test(text(f)))
        .map((f) => path.relative(CRM, f)),
    ).toEqual([])
  })
  it('fixtures use only reserved example domains (RFC 2606) and consumer-domain probes', () => {
    const fixtureFiles = [
      path.join(CRM, 'fixtures', 'synthetic.ts'),
      ...walk(path.join(CRM, '__dbtests__')),
      ...walk(path.join(CRM, '__tests__')),
    ]
    const domains = fixtureFiles.flatMap((f) =>
      [...text(f).matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map((m) =>
        m[1]!.toLowerCase(),
      ),
    )
    // Consumer/provider-domain probes (Wave 1: the shared free-mail list) are public mailbox providers, not people.
    // Address-quality probes (provider typos and disposable-inbox services) are not anyone's employer either.
    const allowed = (d: string) =>
      /(^|\.)example\.(com|test)$/.test(d) ||
      d.endsWith('.example') ||
      isConsumerDomain(d) ||
      ['SUSPECT_TYPO', 'DISPOSABLE'].includes(String(addressQualityOf(d)))
    expect([...new Set(domains)].filter((d) => !allowed(d))).toEqual([])
  })
})

describe('registration', () => {
  it('payload.config registers the CRM collections and no agency-core CRM layer', () => {
    const cfg = readFileSync(path.join(SRC, 'payload.config.ts'), 'utf8')
    expect(cfg).toMatch(/\.\.\.crmCollections/)
    expect(cfg).not.toMatch(/@factory\/agency-core\/cms\/crm/)
    // CRM go-live: exactly one root endpoint list, the CRM's own (the Typeform intake webhook).
    expect(cfg.match(/endpoints\s*:/g)).toHaveLength(1)
    // Patch L2 adds exactly one more list: the two-factor verify endpoint.
    expect(cfg).toMatch(/endpoints:\s*\[\.\.\.crmEndpoints, \.\.\.mfaEndpoints\]/)
    expect(cfg).not.toMatch(/typeformWebhookHandler/)
  })
})
