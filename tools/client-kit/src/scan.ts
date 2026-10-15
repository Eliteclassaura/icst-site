import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { scanText, type Hit, type Matcher } from './blocklist.ts'

/** Text files worth scanning in source, compiled output, rendered pages and seed dumps. */
export const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|jsx|json|md|mdx|css|html|htm|xml|txt|tsv|csv|yml|yaml|rsc|webmanifest|svg|eml)$/i
const MAX_BYTES = 8 * 1024 * 1024

export type FileHits = { file: string; hits: Hit[] }

/** Walk a directory (compiled output, rendered pages, seed dump). `exclude` matches the path relative to `root`. */
export function scanTree(root: string, m: Matcher, opts: { exclude?: RegExp; textFile?: RegExp } = {}): FileHits[] {
  const out: FileHits[] = []
  const text = opts.textFile ?? TEXT_FILE
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name)
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (opts.exclude?.test(rel)) continue
      if (d.isDirectory()) walk(full)
      else if (d.isFile() && text.test(d.name) && statSync(full).size <= MAX_BYTES) {
        const hits = scanText(readFileSync(full, 'utf8'), m)
        if (hits.length) out.push({ file: rel, hits })
      }
    }
  }
  walk(root)
  return out.sort((a, b) => a.file.localeCompare(b.file))
}

/** Tracked files under `roots` (relative to `repo`), via git so the set is exactly what would ship from source. */
export function trackedFiles(repo: string, roots: readonly string[]): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...roots], { cwd: repo, maxBuffer: 256 * 1024 * 1024 }).toString('utf8')
  return out.split('\0').filter(Boolean)
}

/** Seed dumps and API read-backs: scan every string value in a JSON-ish list of rows, reporting the row and field path. */
export function scanRows(rows: unknown, m: Matcher): Array<{ path: string; hits: Hit[] }> {
  const out: Array<{ path: string; hits: Hit[] }> = []
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      const hits = scanText(v, m)
      if (hits.length) out.push({ path: p, hits })
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`))
    else if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`)
  }
  walk(rows, '$')
  return out
}
