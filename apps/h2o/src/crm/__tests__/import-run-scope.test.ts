/**
 * IMPORT-GUARD-1.1 (Security Auditor amendment A2): `runAsImport` sets the AsyncLocalStorage store that makes the outgoing-email queue and
 * enrollments refuse every create. It must live only in the operator import paths. If it ever ran inside the server (a route, a server
 * action, instrumentation, a worker), a real RFQ's alert could silently fail to queue. This test pins the call sites.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.join(process.cwd(), 'src')
const files = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p)
  }
  return out
}
const rel = (p: string) => path.relative(process.cwd(), p).split(path.sep).join('/')
const isTest = (r: string) => /\/__tests__\/|\/__dbtests__\/|\.test\.|\.dbtest\./.test(r)
const mentions = files(SRC).filter((p) => /\brunAsImport\b|import\/scope['"]|from '\.\/scope'/.test(readFileSync(p, 'utf8'))).map(rel)

describe('runAsImport call sites', () => {
  it('is defined in scope.ts and called from nowhere but operator.ts, typeform.ts and tests', () => {
    const production = mentions.filter((r) => !isTest(r))
    expect(production.sort()).toEqual(['src/crm/collections/email-outbox.ts', 'src/crm/collections/enrollments.ts', 'src/crm/import/operator.ts', 'src/crm/import/scope.ts', 'src/crm/import/typeform.ts'])
    const callers = production.filter((r) => /\brunAsImport\s*\(/.test(readFileSync(path.join(process.cwd(), r), 'utf8')) && r !== 'src/crm/import/scope.ts')
    expect(callers.sort()).toEqual(['src/crm/import/operator.ts', 'src/crm/import/typeform.ts'])
  })
  it('the two collection hooks only READ the store (refuseWhenImporting); they never start a run', () => {
    for (const r of ['src/crm/collections/email-outbox.ts', 'src/crm/collections/enrollments.ts']) {
      const text = readFileSync(path.join(process.cwd(), r), 'utf8')
      expect(text, r).toContain('refuseWhenImporting')
      expect(text, r).not.toMatch(/\brunAsImport\b/)
    }
  })
  it('nothing the server loads imports the operator import modules: not app/, not instrumentation, not a route or server action', () => {
    const operator = /crm\/import\/(?:operator|typeform|cli|engine)['"]|from '\.\.?\/(?:import\/)?(?:operator|typeform|cli)['"]/
    const offenders = files(SRC)
      .map(rel)
      .filter((r) => !isTest(r) && !r.startsWith('src/crm/import/'))
      .filter((r) => operator.test(readFileSync(path.join(process.cwd(), r), 'utf8')))
    // engine.ts is also the admin import page's engine (a request-scoped session, never an import run): only these server files may use it
    const allowed = offenders.filter((r) => /^src\/(?:crm\/workspace|app\/\(crm\))\//.test(r))
    expect(offenders.filter((r) => !allowed.includes(r)), 'a server entry point imports an operator import module').toEqual([])
    for (const r of offenders) expect(readFileSync(path.join(process.cwd(), r), 'utf8'), r).not.toMatch(/\brunAsImport\b/)
    // the server entry points specifically
    for (const entry of ['src/instrumentation.ts']) {
      try {
        expect(readFileSync(path.join(process.cwd(), entry), 'utf8')).not.toMatch(/runAsImport|crm\/import\/(?:operator|typeform|cli)/)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
    }
  })
})
