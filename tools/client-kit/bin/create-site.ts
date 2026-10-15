#!/usr/bin/env node
/**
 * KIT-0 M11: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin/create-site.ts \\
 *   --slug acme-pumps --name "Acme Pumps" --domain acmepumps.test [--legal "Acme Pumps Co., Ltd."] [--short Acme] [--tenant ACME]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSite } from '../src/create-site.ts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2)
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : undefined
}
const need = (n: string) => flag(n) ?? (console.error(`--${n} is required`), process.exit(2))
try {
  const slug = need('slug')
  const name = need('name')
  const dest = createSite(path.join(repo, 'clients'), {
    slug,
    name,
    legal: flag('legal') ?? name,
    short: flag('short') ?? name,
    domain: need('domain'),
    tenant: flag('tenant') ?? slug.toUpperCase().replace(/-/g, '_'),
  })
  process.stdout.write(`created ${path.relative(repo, dest)}; now replace every synthetic value and complete its blocklist.json\n`)
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
