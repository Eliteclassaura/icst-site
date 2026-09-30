/**
 * Operator entry point (run with `pnpm --filter @factory/h2o payload run src/content/import/cli.ts -- <cmd>`):
 *
 *   import  <outDir> [authorityRoot]   rerunnable authority → Payload import; writes import-ledger.tsv /
 *                      redirect-ledger.tsv. authorityRoot (default: cwd) is an accepted source checkout's
 *                      apps/h2o (content/ + release/authority.mjs), e.g. mounted read-only into the image.
 *   sync               build + promote the published snapshot and search index now (same code as the runner)
 *   rollback           point the snapshot `current` back at the previous (last-good) generation
 *
 * Never run against production. The import writes rows only; schema changes are migrations.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import config from '@payload-config'
import { getPayload } from 'payload'
import { importAuthority } from './authority-import'
import { siteChromeSeed } from '../site-chrome'
import { runPublishingSync } from '../jobs'
import { recordPublicationEvent } from '../events'
import { currentRelease, listReleases, repointRelease, validateRelease } from '../release'

/** CLI output goes to stdout (the lint rule reserves console for warnings and errors). */
const out1 = (m: string) => process.stdout.write(`${m}\n`)

const tsv = (rows: unknown[][]) => rows.map((r) => r.map((v) => String(v ?? '').replaceAll('\t', ' ').replaceAll('\n', ' ')).join('\t')).join('\n') + '\n'

async function main() {
  const [cmd, arg, rootArg] = process.argv.slice(2).filter((a) => a !== '--')
  const payload = await getPayload({ config })
  if (cmd === 'import') {
    const out = path.resolve(arg ?? 'import-report')
    mkdirSync(out, { recursive: true })
    const t0 = Date.now()
    const root = path.resolve(rootArg ?? process.cwd())
    const { ledger, redirects, intents } = await importAuthority(payload, root, { log: (m) => out1(m) })
    writeFileSync(
      path.join(out, 'import-ledger.tsv'),
      tsv([
        ['SOURCE_ID', 'RECORD_ROUTE_ID', 'TARGET_ID', 'CANONICAL_PATH', 'FAMILY', 'TEMPLATE', 'DISPOSITION', 'PUBLISHED', 'MEDIA_REFS', 'MEDIA_UNRESOLVED', 'STATUS', 'NOTE'],
        ...ledger.map((l) => [l.sourceId, l.recordRouteId, l.targetId, l.path, l.family, l.template, l.state, l.published, l.mediaRefs, l.mediaMissing, l.status, l.note]),
      ]),
    )
    writeFileSync(path.join(out, 'redirect-ledger.tsv'), tsv([['SOURCE', 'DESTINATION', 'STATUS', 'TARGET_STATE', 'RESULT'], ...redirects.map((r) => [r.source, r.destination, r.status, r.targetState, r.status2])]))
    writeFileSync(
      path.join(out, 'quote-intent-ledger.tsv'),
      tsv([['ROUTE_ID', 'SOURCE_KEY', 'ELEMENT_ID', 'RULE', 'ACTION', 'LABEL', 'SOURCE_HREF', 'PRODUCT_ROUTE_ID'], ...intents.map((d) => [d.routeId, d.key, d.elementId, d.rule, d.action, d.label, d.sourceHref, d.product ?? ''])]),
    )
    const count = (s: string) => ledger.filter((l) => l.status === s).length
    const summary = { records: ledger.length, applied: count('APPLIED'), unchanged: count('UNCHANGED'), heldConflict: count('HELD_CONFLICT'), error: count('ERROR'), published: ledger.filter((l) => l.published).length, redirects: redirects.length, quoteIntents: intents.length, seconds: Math.round((Date.now() - t0) / 1000) }
    writeFileSync(path.join(out, 'import-summary.json'), JSON.stringify(summary, null, 2))
    // Seed the navigation/footer global with the accepted chrome once, so editors start from the live content.
    const chrome = (await payload.findGlobal({ slug: 'site-chrome' as never, depth: 0, overrideAccess: true })) as unknown as { navigation?: unknown[] }
    if (!chrome?.navigation?.length) {
      await payload.updateGlobal({ slug: 'site-chrome' as never, data: { ...siteChromeSeed(), _status: 'published' } as never, overrideAccess: true })
      out1('site-chrome seeded from the accepted defaults')
    }
    // One committed event for the whole import, so the next release is required to reflect it.
    if (summary.applied) await recordPublicationEvent(payload, null, 'import', null)
    out1(JSON.stringify(summary))
  } else if (cmd === 'sync') {
    out1(JSON.stringify(await runPublishingSync(payload, null)))
  } else if (cmd === 'rollback') {
    // Derived-pair rollback only: re-point the release at the previous validated content+search pair.
    // The database (content, CRM, media) is not touched; events committed after that pair stay pending, so
    // withdrawals after it remain revoked and the runner rebuilds on its next job/reconcile tick.
    const cur = currentRelease()
    const target = cur?.previous ?? listReleases().find((m) => m.id !== cur?.id)?.id ?? null
    if (!target) {
      console.error('no previous validated release is retained')
      process.exitCode = 3
    } else {
      const m = repointRelease(target)
      out1(JSON.stringify({ scope: 'DERIVED_RELEASE_PAIR_ONLY', release: m.id, content: m.content, search: m.search, database: 'UNCHANGED' }))
    }
  } else if (cmd === 'release-status') {
    const cur = currentRelease()
    out1(JSON.stringify({ release: cur?.id ?? null, valid: validateRelease(cur).ok, retained: listReleases().map((m) => m.id) }))
  } else {
    console.error('usage: import <outDir> [authorityRoot] | sync | rollback | release-status')
    process.exitCode = 2
  }
  process.exit()
}
await main()
