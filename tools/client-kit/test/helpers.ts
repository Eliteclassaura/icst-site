import { cpSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const clients = path.join(repo, 'clients')
export const tmp = (name: string) => mkdtempSync(path.join(os.tmpdir(), `kit0-${name}-`))
/** A scratch copy of `clients/` so tests can add or damage a client without touching the repo. */
export function clientsCopy(): string {
  const d = path.join(tmp('clients'), 'clients')
  cpSync(clients, d, { recursive: true })
  return d
}
