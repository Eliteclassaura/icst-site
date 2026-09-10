#!/usr/bin/env node
/**
 * Skill trust and provenance gate (C5.5 workstream C, ADR-030 §3).
 *
 *   node tools/scripts/verify-skills.mjs [--update]
 *
 * A skill is text that steers a session, which makes it a supply-chain surface with none of the
 * usual protections: no import graph to audit, no type checker, no review diff anybody reads
 * closely. Two rules make that tractable, and this script enforces both.
 *
 *   1. **First-party skills contain no executable code.** Markdown and JSON only, no execute bits,
 *      no shebangs, no script extensions, and every command a skill may invoke declared in its
 *      `policy.json` and drawn from the repository's own scripts. A skill that cannot run code
 *      cannot be the thing that exfiltrates a token, and reviewing it is reading prose.
 *   2. **Everything is pinned by hash.** First-party skills are pinned per file, so an edit that
 *      does not also update `.claude/skills/MANIFEST.json` fails here and in CI. Vendored skills
 *      keep their directory-level pin from `install-skills.mjs`.
 *
 * Vendored third-party skills DO ship scripts (that is why they are vendored rather than trusted):
 * they are pinned by directory hash and their scripts are never invoked by a Factory skill, which
 * is the boundary this gate keeps.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const skillsDir = join(root, '.claude/skills')
const manifestPath = join(skillsDir, 'MANIFEST.json')
const update = process.argv.includes('--update')

/** Skills this repository authors. Everything else under .claude/skills is vendored. */
const FIRST_PARTY = ['design-sync', 'design-pack', 'design-pull', 'design-change']

/** Only these file types may appear in a first-party skill. */
const ALLOWED_EXT = ['.md', '.json']

/** A first-party skill may name only commands that already exist as repository scripts, plus these. */
const ALLOWED_NON_PNPM = [
  'git status',
  'git diff',
  'git checkout -b',
  'git add',
  'git commit',
  'git push',
  'gh pr create',
]

const findings = []
const fail = (rule, detail) => findings.push({ rule, detail })

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

function walk(dir) {
  const out = []
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push({ path: p, mode: st.mode, size: st.size })
  }
  return out
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const repoScripts = new Set(Object.keys(pkg.scripts ?? {}).map((s) => `pnpm ${s}`))

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
const pinned = new Map(Object.entries(manifest.firstParty ?? {}))
const computed = {}

for (const name of FIRST_PARTY) {
  const dir = join(skillsDir, name)
  if (!existsSync(dir)) {
    fail('skill-missing', `${name} is declared first-party but is not present`)
    continue
  }
  const files = walk(dir)
  if (!files.some((f) => f.path.endsWith('/SKILL.md')))
    fail('skill-no-instructions', `${name} has no SKILL.md`)

  for (const f of files) {
    const rel = relative(skillsDir, f.path).split('\\').join('/')
    const ext = f.path.slice(f.path.lastIndexOf('.'))
    if (!ALLOWED_EXT.includes(ext))
      fail(
        'skill-executable-file',
        `${rel}: first-party skills are ${ALLOWED_EXT.join('/')} only, found ${ext}`,
      )
    if ((f.mode & 0o111) !== 0)
      fail('skill-execute-bit', `${rel}: mode ${(f.mode & 0o7777).toString(8)} sets an execute bit`)
    const bytes = readFileSync(f.path)
    if (bytes.length > 1 && bytes[0] === 0x23 && bytes[1] === 0x21)
      fail('skill-shebang', `${rel}: begins with a shebang`)
    computed[rel] = sha(bytes)
  }

  const policyPath = join(dir, 'policy.json')
  if (!existsSync(policyPath)) {
    fail('skill-no-policy', `${name} has no policy.json`)
    continue
  }
  let policy
  try {
    policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  } catch (e) {
    fail('skill-policy-invalid', `${name}/policy.json is not JSON: ${e.message}`)
    continue
  }
  if (policy.executes !== 'none')
    fail(
      'skill-executes',
      `${name}/policy.json declares executes="${policy.executes}"; first-party skills execute nothing`,
    )
  if (policy.trust !== 'first-party')
    fail('skill-trust', `${name}/policy.json declares trust="${policy.trust}"`)
  if (!Array.isArray(policy.allowedCommands) || policy.allowedCommands.length === 0)
    fail('skill-no-allowlist', `${name}/policy.json declares no allowedCommands`)
  for (const cmd of policy.allowedCommands ?? []) {
    if (ALLOWED_NON_PNPM.includes(cmd)) continue
    if (!repoScripts.has(cmd))
      fail(
        'skill-unknown-command',
        `${name}: allowedCommands names "${cmd}", which is not a repository script`,
      )
  }
  if (!Array.isArray(policy.refuses) || policy.refuses.length === 0)
    fail(
      'skill-no-refusals',
      `${name}/policy.json lists no refusals; a skill that refuses nothing is not reviewed`,
    )

  const text = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  const url = /https?:\/\/(?!(?:www\.)?(?:example|localhost))[^\s)>'"]+/.exec(text)
  if (url)
    fail(
      'skill-external-url',
      `${name}/SKILL.md points at ${url[0].slice(0, 60)}; a skill must not send a session off-repository`,
    )
  for (const risky of [/\bcurl\b/, /\bwget\b/, /\bnpx\b/, /\beval\b/, /\bbase64 -d\b/, /\bchmod \+x\b/]) {
    const m = risky.exec(text)
    if (m) fail('skill-risky-command', `${name}/SKILL.md mentions "${m[0]}"`)
  }
}

// Vendored skills keep their directory pin; a first-party name must not collide with one.
for (const entry of manifest.skills ?? []) {
  if (FIRST_PARTY.includes(entry.name))
    fail('skill-name-collision', `${entry.name} is both vendored and first-party`)
  const dir = join(skillsDir, entry.name)
  if (entry.status === 'pending' || !existsSync(dir)) continue
  // A single-file vendored skill is pinned by that file's content hash (install-skills.mjs §3);
  // a package-sourced one by its directory hash. Match whichever install-skills.mjs wrote.
  const single = join(dir, 'SKILL.md')
  if (entry.source && existsSync(single) && walk(dir).length === 1) {
    const actualFile = sha(readFileSync(single))
    if (entry.sha256 && entry.sha256 !== actualFile)
      fail(
        'vendored-skill-drift',
        `${entry.name}: pinned ${entry.sha256.slice(0, 12)}, on disk ${actualFile.slice(0, 12)} — reinstall with pnpm skills:install`,
      )
    continue
  }
  // Same algorithm as install-skills.mjs's hashDir (basename + bytes, sorted, recursive), so the
  // pin it wrote and the pin checked here are the same number.
  const h = createHash('sha256')
  const hashWalk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p2 = join(d, f)
      if (statSync(p2).isDirectory()) hashWalk(p2)
      else h.update(f).update(readFileSync(p2))
    }
  }
  hashWalk(dir)
  const actual = h.digest('hex')
  if (entry.sha256 && entry.sha256 !== actual)
    fail(
      'vendored-skill-drift',
      `${entry.name}: pinned ${entry.sha256.slice(0, 12)}, on disk ${actual.slice(0, 12)} — reinstall with pnpm skills:install`,
    )
}

if (update) {
  manifest.firstParty = Object.fromEntries(Object.entries(computed).sort())
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.error(
    `✔ pinned ${Object.keys(computed).length} first-party skill file(s) in .claude/skills/MANIFEST.json`,
  )
} else {
  for (const [rel, hash] of Object.entries(computed).sort()) {
    const want = pinned.get(rel)
    if (!want)
      fail(
        'skill-unpinned',
        `${rel} is not pinned in MANIFEST.json (run pnpm skills:verify --update after review)`,
      )
    else if (want !== hash)
      fail('skill-drift', `${rel}: pinned ${want.slice(0, 12)}, on disk ${hash.slice(0, 12)}`)
  }
  for (const rel of pinned.keys())
    if (!(rel in computed)) fail('skill-deleted', `${rel} is pinned but missing from disk`)
}

for (const f of findings) console.error(`✖ [${f.rule}] ${f.detail}`)
if (findings.length) {
  console.error(`\n✖ ${findings.length} skill trust finding(s)`)
  process.exit(1)
}
console.error(
  `✔ skills verified: ${FIRST_PARTY.length} first-party (no executable content, ${Object.keys(computed).length} files pinned), ${(manifest.skills ?? []).filter((s) => s.status !== 'pending').length} vendored pins intact`,
)
