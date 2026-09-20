/**
 * H2O Phase 2D — the integration boundary the accepted 2C-min static test used to hold.
 *
 * Phase 2C-min shipped an assertion that nothing outside `src/conversion/` imports the adapter.
 * That was true and correct for 2C-min: the adapter was additive and mounted nowhere. Phase 2D is
 * authorized to mount it, so that assertion is superseded — not broken, and not wrong when it was
 * written. The accepted adapter's files are kept byte-identical and the frozen assertion is
 * preserved in place as historical evidence; the integrated gate excludes it by name, and this file
 * is what replaces it.
 *
 * A replacement has to be at least as strict as what it supersedes, or the exclusion is a way of
 * deleting a check.
 *
 * **Detection is syntax-aware, not textual.** R2.1 found importers with a regular expression that
 * only matched single-quoted static imports. The project's ESLint configuration does not enforce
 * quote style, so a double-quoted import — `import { X } from "../conversion/config"` — was a valid
 * way past the boundary, and Control Tower proved it. A quote character is not a security boundary.
 *
 * This file parses every source file with the TypeScript compiler already in the toolchain and
 * collects module specifiers from every syntactic form that can reach another module:
 *
 *   - `import … from '…'` and `import … from "…"`, including default, named and namespace forms;
 *   - type-only imports (`import type …`, and `import { type X }`);
 *   - side-effect imports (`import '…'`);
 *   - re-exports (`export … from '…'`, `export * from '…'`, `export * as ns from '…'`);
 *   - dynamic `import('…')`, anywhere in an expression;
 *   - `import x = require('…')`;
 *   - `require('…')` calls;
 *   - type positions: `import('…').Thing` and `typeof import('…')`.
 *
 * A specifier counts when it **resolves onto a path inside the adapter directory**, so a longer
 * relative path or the `@/` alias is caught as readily as `../conversion/config`, and a package
 * whose name merely contains the word "conversion" is not.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { integratedTestNamePattern, SUPERSEDED_ASSERTIONS } from '../../../vitest.integrated.config'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_SRC = path.resolve(DIR, '..', '..')
const APP_ROOT = path.resolve(APP_SRC, '..')
const ADAPTER_DIR = path.join(APP_SRC, 'conversion')

/**
 * The only files in this application authorized to reference the accepted conversion adapter.
 *
 * Each is here for a stated reason, and the reason is what makes the list reviewable:
 *
 *   - `proxy.ts` merges the adapter's own CSP addition rather than editing a policy string;
 *   - `site/gate.ts` asks the adapter whether its configuration resolves, as one of the conditions
 *     the mount gate requires;
 *   - `site/RfqMount.tsx` renders the accepted interface on a named accepted surface;
 *   - `site/FloatingQuoteLauncher.tsx` renders the same accepted interface on the one surface the
 *     bounded staging overlay adds, `floating_quote_launcher`. It is a fourth authorized importer
 *     rather than a loosened rule: it reaches exactly the two adapter modules `RfqMount` reaches,
 *     and nothing else. That is the point of this list — a new surface is added by naming it here,
 *     in review, not by widening what "outside the adapter" means.
 */
const AUTHORIZED_IMPORTERS = [
  'proxy.ts',
  'site/FloatingQuoteLauncher.tsx',
  'site/RfqMount.tsx',
  'site/gate.ts',
] as const

/** The exact adapter modules each authorized file may reach. */
const AUTHORIZED_SPECIFIERS: Record<string, string[]> = {
  'proxy.ts': ['./conversion/csp'],
  'site/FloatingQuoteLauncher.tsx': ['../conversion/QuoteCta', '../conversion/resolve'],
  'site/RfqMount.tsx': ['../conversion/QuoteCta', '../conversion/resolve'],
  'site/gate.ts': ['../conversion/config'],
}

/** The accepted 2C-min file carrying the superseded assertion, and its accepted bytes. */
const FROZEN_ASSERTION_FILE = 'conversion/__tests__/boundaries.static.test.ts'
const FROZEN_ASSERTION_SHA256 = '2e56014ad828adead9b14fe3cf139452715c28605d060e68df04d83f399407e9'

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(ts|tsx|mts|cts|js|jsx)$/.test(entry.name) ? [full] : []
  })

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

/** Every module specifier a file reaches, in any syntactic form. */
const moduleSpecifiers = (file: string): string[] => {
  const found: string[] = []
  const push = (node: ts.Node | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node)) found.push(node.text)
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      push(node.moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      push(node.moduleReference.expression)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      push(node.argument.literal)
    } else if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const required = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (dynamic || required) push(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }

  visit(parse(file))
  return found
}

/**
 * Does this specifier, written in this file, land inside the adapter directory?
 *
 * Resolution rather than string matching: `../conversion/config`, `../../src/conversion/config` and
 * `@/conversion/config` all resolve onto the same directory and are all caught, while a package
 * named `some-conversion-lib` resolves nowhere near it and is not.
 */
const resolvesIntoAdapter = (file: string, specifier: string): boolean => {
  let base: string
  if (specifier.startsWith('.')) base = path.resolve(path.dirname(file), specifier)
  else if (specifier.startsWith('@/')) base = path.resolve(APP_SRC, specifier.slice(2))
  else return false

  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
  const resolved = candidates.find((candidate) => existsSync(candidate)) ?? base
  const real = path.resolve(resolved)
  return real === ADAPTER_DIR || real.startsWith(ADAPTER_DIR + path.sep)
}

const adapterSpecifiers = (file: string): string[] =>
  moduleSpecifiers(file).filter((specifier) => resolvesIntoAdapter(file, specifier))

const relative = (file: string): string => path.relative(APP_SRC, file).split(path.sep).join('/')

const importersOutsideTheAdapter = (): string[] =>
  walk(APP_SRC)
    .filter((file) => !file.startsWith(ADAPTER_DIR + path.sep))
    .filter((file) => adapterSpecifiers(file).length > 0)
    .map(relative)
    .sort()

describe('Phase 2D integration boundary — replaces the superseded 2C-min assertion', () => {
  it('is referenced by exactly the three authorized files and no others', () => {
    expect(importersOutsideTheAdapter()).toEqual([...AUTHORIZED_IMPORTERS].sort())
  })

  it('names an authorized importer for every file that references the adapter', () => {
    for (const importer of importersOutsideTheAdapter()) {
      expect(AUTHORIZED_IMPORTERS).toContain(importer)
    }
  })

  it('reaches only the adapter modules those three files are authorized to use', () => {
    for (const importer of AUTHORIZED_IMPORTERS) {
      const specifiers = adapterSpecifiers(path.join(APP_SRC, importer))
      expect([...new Set(specifiers)].sort()).toEqual([...(AUTHORIZED_SPECIFIERS[importer] ?? [])].sort())
    }
  })

  it("leaves the accepted adapter's own module set exactly as accepted — nothing added or removed", () => {
    const adapterFiles = readdirSync(ADAPTER_DIR)
      .filter((name) => /\.(css|ts|tsx)$/.test(name))
      .sort()
    expect(adapterFiles).toEqual([
      'QuoteCta.module.css',
      'QuoteCta.tsx',
      'config.ts',
      'context.ts',
      'csp.ts',
      'dialog.ts',
      'events.ts',
      'index.ts',
      'messages.ts',
      'resolve.ts',
      'sensitive.ts',
      'url.ts',
    ])
  })

  it('has no importer that writes into the accepted adapter directory', () => {
    for (const importer of AUTHORIZED_IMPORTERS) {
      const text = readFileSync(path.join(APP_SRC, importer), 'utf8')
      expect(text).not.toMatch(/writeFileSync|appendFileSync|renameSync|rmSync|unlinkSync/)
    }
  })

  it('references nothing from the adapter in the accepted Payload collections or hooks', () => {
    const payloadSide = walk(APP_SRC).filter((file) =>
      /\/(collections|hooks|fields|payload\.config\.ts)/.test(file.split(path.sep).join('/')),
    )
    const offenders = payloadSide.filter((file) => adapterSpecifiers(file).length > 0).map(relative)
    expect(offenders).toEqual([])
  })
})

describe('detection is syntax-aware, so quote style is not the boundary', () => {
  /** Parse a snippet the same way the boundary does, from a path inside `src/site/`. */
  const specifiersOf = (source: string, extension = '.ts'): string[] => {
    const pretendPath = path.join(APP_SRC, 'site', `__boundary-probe__${extension}`)
    const sourceFile = ts.createSourceFile(
      pretendPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      extension === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const found: string[] = []
    const push = (node: ts.Node | undefined): void => {
      if (node !== undefined && ts.isStringLiteralLike(node)) found.push(node.text)
    }
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) push(node.moduleSpecifier)
      else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
        push(node.moduleReference.expression)
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) push(node.argument.literal)
      else if (ts.isCallExpression(node)) {
        const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
        const required = ts.isIdentifier(node.expression) && node.expression.text === 'require'
        if (dynamic || required) push(node.arguments[0])
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return found.filter((specifier) => resolvesIntoAdapter(pretendPath, specifier))
  }

  it.each([
    ['single-quoted static import', "import { FORM_ID_PATTERN } from '../conversion/config'"],
    ['double-quoted static import', 'import { FORM_ID_PATTERN } from "../conversion/config"'],
    ['type-only import', "import type { TypeformConfig } from '../conversion/config'"],
    ['inline type import', "import { type TypeformConfig } from '../conversion/config'"],
    ['default import', "import config from '../conversion/config'"],
    ['namespace import', "import * as adapter from '../conversion/config'"],
    ['side-effect import', "import '../conversion/config'"],
    ['re-export', "export { FORM_ID_PATTERN } from '../conversion/config'"],
    ['star re-export', "export * from '../conversion/config'"],
    ['namespaced star re-export', "export * as adapter from '../conversion/config'"],
    ['dynamic import', "const load = () => import('../conversion/config')"],
    ['dynamic import, double-quoted', 'const load = () => import("../conversion/config")'],
    ['dynamic import inside an expression', "const p = Promise.all([import('../conversion/config')])"],
    ['import-equals require', "import adapter = require('../conversion/config')"],
    ['require call', "const adapter = require('../conversion/config')"],
    ['import type node in a type position', "type C = import('../conversion/config').TypeformConfig"],
    ['typeof import', "type C = typeof import('../conversion/config')"],
    ['a longer relative path', "import { X } from '../../src/conversion/config'"],
    ['the @/ path alias', "import { X } from '@/conversion/config'"],
    ['the adapter barrel', "import { FORM_ID_PATTERN } from '../conversion'"],
  ])('detects %s', (_label, source) => {
    expect(specifiersOf(source).length).toBeGreaterThan(0)
  })

  it.each([
    ['a package whose name merely contains the word', "import x from 'some-conversion-helper'"],
    ['a sibling module of the same shape', "import { cohort } from './cohort'"],
    ['a string that looks like a specifier but is data', "const note = '../conversion/config'"],
  ])('does not mistake %s for an adapter reference', (_label, source) => {
    expect(specifiersOf(source)).toEqual([])
  })

  it('reads the same specifier whichever quote style writes it', () => {
    expect(specifiersOf("import { X } from '../conversion/config'")).toEqual(
      specifiersOf('import { X } from "../conversion/config"'),
    )
  })
})

describe('the superseded assertion is preserved, and exactly one is excluded', () => {
  it('leaves the accepted 2C-min assertion file byte-identical to the accepted bytes', () => {
    const bytes = readFileSync(path.join(APP_SRC, FROZEN_ASSERTION_FILE))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(FROZEN_ASSERTION_SHA256)
  })

  it('still carries the superseded assertion in that accepted file, unmodified', () => {
    const text = readFileSync(path.join(APP_SRC, FROZEN_ASSERTION_FILE), 'utf8')
    for (const entry of SUPERSEDED_ASSERTIONS) {
      expect(text).toContain(entry.name)
      expect(path.join(APP_ROOT, entry.file)).toBe(path.join(APP_SRC, FROZEN_ASSERTION_FILE))
    }
  })

  it('excludes exactly one test name across the whole suite, and it is the declared one', () => {
    const excluded = allTestNames().filter((entry) => !integratedTestNamePattern.test(entry.fullName))
    expect(excluded.map((entry) => entry.title)).toEqual(SUPERSEDED_ASSERTIONS.map((e) => e.name))
    expect([...new Set(excluded.map((entry) => entry.file))]).toEqual([FROZEN_ASSERTION_FILE])
  })

  it('excludes no test in any Phase 2D test file', () => {
    const twoD = allTestNames().filter((entry) => entry.file.startsWith('site/__tests__/'))
    expect(twoD.length).toBeGreaterThan(50)
    for (const entry of twoD) expect(integratedTestNamePattern.test(entry.fullName)).toBe(true)
  })

  it('names a replacement for every excluded assertion, and that replacement exists', () => {
    for (const entry of SUPERSEDED_ASSERTIONS) {
      const replacement = path.join(APP_ROOT, entry.replacedBy)
      expect(existsSync(replacement)).toBe(true)
      expect(statSync(replacement).size).toBeGreaterThan(0)
    }
  })
})

/** Every `it`/`test` title in the suite, with its enclosing `describe` titles, read from the AST. */
const allTestNames = (): Array<{ file: string; fullName: string; title: string }> => {
  const out: Array<{ file: string; fullName: string; title: string }> = []
  const testFiles = walk(APP_SRC).filter((file) => /\.test\.(ts|tsx)$/.test(file))

  for (const file of testFiles) {
    const rel = relative(file)
    const visit = (node: ts.Node, ancestors: string[]): void => {
      let next = ancestors
      if (ts.isCallExpression(node)) {
        const name = calleeName(node.expression)
        const first = node.arguments[0]
        const title = first !== undefined && ts.isStringLiteralLike(first) ? first.text : null
        if (title !== null && name === 'describe') next = [...ancestors, title]
        else if (title !== null && (name === 'it' || name === 'test')) {
          out.push({ file: rel, fullName: [...ancestors, title].join(' '), title })
        }
      }
      ts.forEachChild(node, (child) => visit(child, next))
    }
    visit(parse(file), [])
  }
  return out
}

/** `describe`, `describe.only`, `it.each(…)` and friends all reduce to their root identifier. */
const calleeName = (expression: ts.Expression): string | null => {
  let node: ts.Expression = expression
  for (;;) {
    if (ts.isPropertyAccessExpression(node)) node = node.expression
    else if (ts.isCallExpression(node)) node = node.expression
    else if (ts.isTaggedTemplateExpression(node)) node = node.tag
    else break
  }
  return ts.isIdentifier(node) ? node.text : null
}
