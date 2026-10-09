/**
 * DEPLOY-PIPE-1, read-only: published site-chrome global vs the code defaults at this head.
 *
 *   payload run ops/ci/chrome-diff.ts -- [--fail-on=footer.columns[0],navigation[1]]
 *   (in the image: node node_modules/payload/bin.js run ops/ci/chrome-diff.ts -- …, with the app's own DATABASE_URI)
 *
 * Prints every differing field as `path | default | published` (site content only: labels, links, copy; no secrets, no customer data). Exit 0
 * unless --fail-on is given and a differing path starts with one of its prefixes (exit 1: the published global overrides a default this release changed).
 * Writes nothing.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { publishedSiteChrome } from '../../src/content/site-chrome'
import type { TxReq } from '../../src/content/snapshot'
import { DEFAULT_SITE_CHROME } from '../../src/site/site-chrome-content'
import { diffChrome, diffUnder } from './chrome-diff-core'

const out = (m: string) => process.stdout.write(`${m}\n`)

async function main() {
  const failOn = (process.argv.find((a) => a.startsWith('--fail-on='))?.slice('--fail-on='.length) ?? '').split(',').filter(Boolean)
  const payload = await getPayload({ config })
  const published = await publishedSiteChrome(payload, { payload } as unknown as TxReq)
  const diffs = diffChrome(DEFAULT_SITE_CHROME, published)
  if (diffs.length === 0) out('site-chrome: the published global equals the code defaults (or no published global: the defaults apply)')
  else {
    out(`site-chrome: ${diffs.length} differing field(s)`)
    for (const d of diffs.slice(0, 300)) out(`${d.path} | ${d.default.slice(0, 90)} | ${d.published.slice(0, 90)}`)
  }
  const hit = diffUnder(diffs, failOn)
  if (hit.length) {
    out(`FAIL: ${hit.length} differing field(s) under ${failOn.join(', ')}`)
    process.exitCode = 1
  }
  process.exit(process.exitCode ?? 0)
}
await main()
