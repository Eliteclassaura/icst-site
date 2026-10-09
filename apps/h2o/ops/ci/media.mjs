#!/usr/bin/env node
/**
 * DEPLOY-PIPE-1: assemble apps/h2o/public/ WITHOUT downloading the Git-LFS media (685 MB) on every run.
 *
 * The checkout is made with lfs:false, so every LFS file in the tree is a small pointer holding the file's sha256 (`oid`).
 * The previous production image already contains the real files and /app/MEDIA_IDENTITY.sha256 (path → sha256). So:
 *   - a path whose expected sha256 (pointer oid, or the sha256 of a regular file) equals the previous image's is COPIED from it;
 *   - only the paths that are new or changed are fetched from LFS (`git lfs pull --include=…`);
 *   - every file is then verified against its expected sha256 and no pointer may remain.
 * A CSS or copy fix therefore downloads nothing. With no previous image (first run) every LFS file is fetched.
 *
 *   node media.mjs plan   --prev-identity <MEDIA_IDENTITY.sha256|none> [--root apps/h2o/public]   → prints the plan as JSON
 *   node media.mjs apply  --prev-dir <dir with the previous public/> --prev-identity <file> [--root …]
 */
import { createHash } from 'node:crypto'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const POINTER = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize (\d+)\n?$/
export const looksLikePointer = (buf) => buf.length < 400 && buf.toString('utf8', 0, 40).startsWith(`version https://git-${'lfs'}`) // (written so this file itself never contains the pointer signature)

/** Parse MEDIA_IDENTITY.sha256 lines ("<sha256>  <path>") → Map(path → sha256). Paths are repo-relative (apps/h2o/public/...). */
export function parseIdentity(text) {
  const m = new Map()
  for (const line of text.split('\n')) {
    const x = /^([0-9a-f]{64}) [ *]?(.+)$/.exec(line.trim())
    if (x) m.set(x[2], x[1])
  }
  return m
}

/** entries: [{ path, expected, lfs }]; prev: Map(path → sha). → { reuse: [paths], fetch: [paths], regular: [paths] } */
export function planMedia(entries, prev) {
  const reuse = []
  const fetch = []
  const regular = []
  for (const e of entries) {
    if (prev.get(e.path) === e.expected) reuse.push(e.path)
    else if (e.lfs) fetch.push(e.path)
    else regular.push(e.path) // a regular tracked file is already real in the checkout
  }
  return { reuse, fetch, regular }
}

export const sha256File = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(f))
    else out.push(f)
  }
  return out
}

/** Read the checkout's public/ tree → entries with the expected sha256. */
export async function readEntries(rootAbs, repoRoot) {
  const entries = []
  for (const f of walk(rootAbs)) {
    const buf = readFileSync(f)
    const rel = path.relative(repoRoot, f).split(path.sep).join('/')
    if (looksLikePointer(buf)) {
      const m = POINTER.exec(buf.toString('utf8'))
      if (!m) throw new Error(`unreadable LFS pointer: ${rel}`)
      entries.push({ path: rel, expected: m[1], lfs: true })
    } else entries.push({ path: rel, expected: createHash('sha256').update(buf).digest('hex'), lfs: false })
  }
  return entries
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const arg = (n) => (rest.includes(`--${n}`) ? rest[rest.indexOf(`--${n}`) + 1] : undefined)
  const root = path.resolve(arg('root') ?? 'apps/h2o/public')
  const repoRoot = path.resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim())
  const prevIdentity = arg('prev-identity')
  const prev = prevIdentity && prevIdentity !== 'none' && existsSync(prevIdentity) ? parseIdentity(readFileSync(prevIdentity, 'utf8')) : new Map()
  const entries = await readEntries(root, repoRoot)
  const plan = planMedia(entries, prev)
  if (cmd === 'plan') {
    console.log(JSON.stringify({ total: entries.length, reuse: plan.reuse.length, fetch: plan.fetch.length, regular: plan.regular.length }))
    return
  }
  if (cmd !== 'apply') throw new Error('usage: media.mjs plan|apply …')
  const prevDir = arg('prev-dir') ?? ''
  for (const p of plan.reuse) {
    const src = path.join(prevDir, path.relative('apps/h2o/public', p))
    const dst = path.join(repoRoot, p)
    mkdirSync(path.dirname(dst), { recursive: true })
    copyFileSync(src, dst)
  }
  // fetch only what is new or changed, in chunks (command-line length)
  for (let i = 0; i < plan.fetch.length; i += 200) {
    const chunk = plan.fetch.slice(i, i + 200)
    execFileSync('git', ['lfs', 'pull', '--include', chunk.join(',')], { stdio: 'inherit', cwd: repoRoot })
  }
  // verify: every file equals its expected sha256, and no pointer remains
  const expected = new Map(entries.map((e) => [e.path, e.expected]))
  let bad = 0
  for (const [p, sha] of expected) {
    const f = path.join(repoRoot, p)
    if (!existsSync(f) || (await sha256File(f)) !== sha) {
      bad++
      console.error(`media verify FAILED: ${p}`)
    } else if (looksLikePointer(readFileSync(f))) {
      bad++
      console.error(`LFS pointer remains: ${p}`)
    }
  }
  const bytes = [...expected.keys()].reduce((n, p) => n + statSync(path.join(repoRoot, p)).size, 0)
  console.log(JSON.stringify({ total: expected.size, reused: plan.reuse.length, fetched: plan.fetch.length, regular: plan.regular.length, bytes, failures: bad }))
  if (bad) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
