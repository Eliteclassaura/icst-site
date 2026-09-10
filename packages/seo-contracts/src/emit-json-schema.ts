/** Emits JSON Schema (draft 2020-12) for every contract to schemas/ — for OGCS and any non-TypeScript consumer. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { CONTRACTS } from './index'

mkdirSync(new URL('../schemas/', import.meta.url), { recursive: true })
for (const [name, schema] of Object.entries(CONTRACTS)) {
  const file = name.split('/')[1] + '.schema.json'
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any', io: 'input' })
  writeFileSync(
    new URL(`../schemas/${file}`, import.meta.url),
    JSON.stringify({ $id: `https://factory.local/schemas/${file}`, ...json }, null, 2) + '\n',
  )
  console.error(`wrote schemas/${file}`)
}
