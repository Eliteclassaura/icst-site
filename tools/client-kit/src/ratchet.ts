import { readFileSync } from 'node:fs'
import path from 'node:path'
import { scanText, type Matcher } from './blocklist.ts'
import { TEXT_FILE, trackedFiles } from './scan.ts'

/**
 * KIT-0 layer 1: the source ratchet. A committed baseline records, per file, how many blocklist hits it has today. The check
 * fails if any file gains hits, a file not in the baseline has any, or the total rises. Counts may fall; `update` only ever
 * writes lower numbers (it refuses to raise one), so the baseline can only ratchet down.
 */
export type RatchetSet = { name: string; roots: string[]; include?: string; exclude: string[] }
export type Baseline = { schemaVersion: 1; set: string; blocklistClients: string[]; total: number; files: Record<string, number> }

export function selectFiles(repo: string, set: RatchetSet): string[] {
  const ex = set.exclude.map((p) => new RegExp(p))
  const inc = set.include ? new RegExp(set.include) : null
  return trackedFiles(repo, set.roots).filter((f) => TEXT_FILE.test(f) && !ex.some((r) => r.test(f)) && (!inc || inc.test(f)))
}

export function countHits(repo: string, set: RatchetSet, m: Matcher): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of selectFiles(repo, set)) {
    let text: string
    try {
      text = readFileSync(path.join(repo, f), 'utf8')
    } catch {
      continue
    }
    const n = scanText(text, m).length
    if (n) out[f] = n
  }
  return out
}

export type RatchetResult = {
  ok: boolean
  total: { baseline: number; now: number }
  worse: Array<{ file: string; baseline: number; now: number }>
  better: Array<{ file: string; baseline: number; now: number }>
}

export function compare(baseline: Baseline, now: Record<string, number>): RatchetResult {
  const worse: RatchetResult['worse'] = []
  const better: RatchetResult['better'] = []
  for (const f of new Set([...Object.keys(baseline.files), ...Object.keys(now)])) {
    const b = baseline.files[f] ?? 0
    const n = now[f] ?? 0
    if (n > b) worse.push({ file: f, baseline: b, now: n })
    else if (n < b) better.push({ file: f, baseline: b, now: n })
  }
  const total = Object.values(now).reduce((a, b) => a + b, 0)
  return { ok: worse.length === 0 && total <= baseline.total, total: { baseline: baseline.total, now: total }, worse, better }
}

/** The next baseline: every count takes the lower of old and new. Files at zero drop out. Never raises a number. */
export function lowered(baseline: Baseline, now: Record<string, number>): Baseline {
  const files: Record<string, number> = {}
  for (const [f, b] of Object.entries(baseline.files)) {
    const n = Math.min(b, now[f] ?? 0)
    if (n > 0) files[f] = n
  }
  return { ...baseline, total: Object.values(files).reduce((a, b) => a + b, 0), files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) }
}

export function freshBaseline(set: string, clients: string[], now: Record<string, number>): Baseline {
  const files = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)))
  return { schemaVersion: 1, set, blocklistClients: [...clients].sort(), total: Object.values(files).reduce((a, b) => a + b, 0), files }
}
