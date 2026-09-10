/**
 * One-shot importer: subscribers.php?export=payload  ->  Payload.
 *
 *   npx tsx import-subscribers.ts ./syedai-subscribers-payload-2026-09-03.json
 *
 * Idempotent by design. It matches on externalId and updates rather than
 * creating, so running it twice does not double the list — which matters
 * because you will run it twice, once to test and once for real.
 */
import fs from 'node:fs'
import { getPayload } from 'payload'
import config from '../../payload.config'

type Doc = Record<string, unknown> & { externalId?: string; email?: string }

async function main() {
  const path = process.argv[2]
  if (!path) throw new Error('Pass the exported JSON file as the first argument.')

  const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as { docs?: Doc[] }
  const docs = parsed.docs ?? []
  if (!docs.length) throw new Error('No docs in that file.')

  const payload = await getPayload({ config })
  let created = 0
  let updated = 0
  const failed: Array<{ email?: string; error: string }> = []

  for (const doc of docs) {
    try {
      const existing = doc.externalId
        ? await payload.find({
            collection: 'subscribers',
            where: { externalId: { equals: doc.externalId } },
            limit: 1,
          })
        : { docs: [] as Array<{ id: string | number }> }

      if (existing.docs.length) {
        await payload.update({
          collection: 'subscribers',
          id: existing.docs[0].id,
          data: doc as never,
        })
        updated++
      } else {
        await payload.create({ collection: 'subscribers', data: doc as never })
        created++
      }
    } catch (err) {
      // One bad row must not abort the run — collect and report at the end.
      failed.push({ email: doc.email, error: err instanceof Error ? err.message : String(err) })
    }
  }

  console.log(`created ${created}, updated ${updated}, failed ${failed.length}`)
  if (failed.length) console.table(failed)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
