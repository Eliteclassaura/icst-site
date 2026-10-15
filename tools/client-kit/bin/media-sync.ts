/**
 * Stage a client's media into `clients/<slug>/media/` and write the allow-list `MEDIA_INDEX.json`.
 *
 *   node tools/client-kit/bin/media-sync.ts <slug> <media_import dir> [--brand <file>=<key>]... [--check]
 *
 * <media_import dir> holds `wp-content/uploads/...` and a `SHA256SUMS.txt` (`<sha256>  <path relative to the dir>`).
 * Every file is hash-verified at the source and again after the copy; a mismatch stops the run. Only raster images are staged
 * (jpg, jpeg, png, webp, gif). `--brand file=key` stages one hero/brand image at `media/brand/<key>`, served at `/brand-media/<key>`.
 * `--only <list.tsv>` stages only the files whose `url` (column 1) is in the list with a `staging_status` starting with STAGED (Corpus's serving list).
 * `--check` verifies the staged folder against its index and writes nothing.
 * The binaries are not committed (the index is); the image build stages them with this tool and the layer-2 scan runs after.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex')
type Entry = { sha256: string; bytes: number }

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function main(argv: string[]): number {
  const args = argv.slice(2)
  const check = args.includes('--check')
  const brand: Array<[string, string]> = []
  let only: Set<string> | null = null
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--brand') {
      const [f, k] = (args[++i] ?? '').split('=')
      if (!f || !k) { console.error('--brand needs <file>=<key>'); return 2 }
      brand.push([f, k])
    } else if (args[i] === '--only') {
      const rows = readFileSync(path.resolve(args[++i] ?? ''), 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'))
      only = new Set(rows.filter((r) => (r[r.length - 1] ?? '').startsWith('STAGED')).map((r) => (r[0] ?? '').replace(/^\/wp-content\/uploads\//, '')))
    } else if (args[i] !== '--check') rest.push(args[i]!)
  }
  const [slug, srcDir] = rest
  if (!slug || !/^[a-z][a-z0-9-]{1,30}$/.test(slug)) { console.error('usage: media-sync.ts <slug> <media_import dir> [--brand file=key]... [--check]'); return 2 }
  const root = path.resolve(import.meta.dirname, '..', '..', '..', 'clients', slug, 'media')
  const indexPath = path.join(root, 'MEDIA_INDEX.json')

  if (check) {
    const idx = JSON.parse(readFileSync(indexPath, 'utf8')) as { sections: Record<string, { files: Record<string, Entry> }> }
    let bad = 0, n = 0, bytes = 0
    const dirs: Record<string, string> = { uploads: path.join(root, 'wp-content', 'uploads'), brand: path.join(root, 'brand') }
    for (const [sec, { files }] of Object.entries(idx.sections)) {
      for (const [k, e] of Object.entries(files)) { n++; bytes += e.bytes; const f = path.join(dirs[sec]!, k); if (!existsSync(f) || statSync(f).size !== e.bytes || sha(f) !== e.sha256) { bad++; console.error('MISMATCH', sec, k) } }
      const listed = new Set(Object.keys(files))
      for (const f of walk(dirs[sec]!)) { const k = path.relative(dirs[sec]!, f).split(path.sep).join('/'); if (!listed.has(k)) { bad++; console.error('NOT LISTED', sec, k) } }
    }
    console.log(`media check: ${n} files, ${(bytes / 1048576).toFixed(2)} MB, ${bad} problem(s)`)
    return bad ? 1 : 0
  }

  if (!srcDir) { console.error('source dir missing'); return 2 }
  const src = path.resolve(srcDir)
  const sums = readFileSync(path.join(src, 'SHA256SUMS.txt'), 'utf8').split('\n').filter(Boolean)
  const uploads: Record<string, Entry> = {}
  const skipped: Record<string, number> = {}
  const prefix = 'wp-content/uploads/'
  for (const line of sums) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line)
    if (!m) { console.error('bad line in SHA256SUMS.txt'); return 1 }
    const [, want, rel] = m as unknown as [string, string, string]
    if (!rel.startsWith(prefix) || rel.includes('..')) { skipped.outside = (skipped.outside ?? 0) + 1; continue }
    if (only && !only.has(rel.slice(prefix.length))) { skipped.notInList = (skipped.notInList ?? 0) + 1; continue }
    const ext = path.extname(rel).toLowerCase()
    if (!EXT.has(ext)) { skipped[ext || 'none'] = (skipped[ext || 'none'] ?? 0) + 1; continue }
    const from = path.join(src, rel)
    if (sha(from) !== want) { console.error('SOURCE HASH MISMATCH', rel); return 1 }
    const to = path.join(root, rel)
    mkdirSync(path.dirname(to), { recursive: true })
    copyFileSync(from, to)
    if (sha(to) !== want) { console.error('COPY HASH MISMATCH', rel); return 1 }
    uploads[rel.slice(prefix.length)] = { sha256: want, bytes: statSync(to).size }
  }
  const brandFiles: Record<string, Entry> = {}
  for (const [f, k] of brand) {
    const from = path.resolve(f)
    if (!EXT.has(path.extname(k).toLowerCase())) { console.error('brand key must be a raster image'); return 1 }
    const to = path.join(root, 'brand', ...k.split('/'))
    mkdirSync(path.dirname(to), { recursive: true })
    copyFileSync(from, to)
    if (sha(to) !== sha(from)) { console.error('COPY HASH MISMATCH', k); return 1 }
    brandFiles[k] = { sha256: sha(to), bytes: statSync(to).size }
  }
  const sorted = (o: Record<string, Entry>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
  const index = { note: 'Allow-list: only exact keys below are served (see apps/h2o/src/client/site/media.ts). Binaries are staged by tools/client-kit/bin/media-sync.ts and are not committed.', sections: { uploads: { files: sorted(uploads) }, brand: { files: sorted(brandFiles) } } }
  writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n')
  const bytes = Object.values(uploads).concat(Object.values(brandFiles)).reduce((a, e) => a + e.bytes, 0)
  console.log(`staged ${Object.keys(uploads).length} uploads + ${Object.keys(brandFiles).length} brand files, ${(bytes / 1048576).toFixed(2)} MB; skipped ${JSON.stringify(skipped)}`)
  return 0
}
process.exit(main(process.argv))
