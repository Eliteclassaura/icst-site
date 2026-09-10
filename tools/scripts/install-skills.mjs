// Installs the adopted build-time design skills (docs/build-skills.md, ADR-021) into .claude/skills/
// from PINNED npm packages, plus the vendored Anthropic frontend-design SKILL.md. Idempotent.
// Skills are build-time only; nothing under apps/ or packages/ imports them.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const out = resolve(root, '.claude/skills')
mkdirSync(out, { recursive: true })

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`))
const version = (name) => JSON.parse(readFileSync(join(pkgDir(name), 'package.json'), 'utf8')).version
const hashDir = (dir) => {
  const h = createHash('sha256')
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else h.update(f).update(readFileSync(p))
    }
  }
  walk(dir)
  return h.digest('hex')
}

const manifest = []

// 1. ui-ux-pro-max — the `design` skill + its data/scripts (the other bundled skills are Tailwind/shadcn-shaped and not adopted).
{
  const src = join(pkgDir('ui-ux-pro-max-cli'), 'assets')
  const dest = join(out, 'ui-ux-pro-max')
  rmSync(dest, { recursive: true, force: true })
  cpSync(join(src, 'skills/design'), dest, { recursive: true })
  if (!existsSync(join(dest, 'scripts')))
    cpSync(join(src, 'scripts'), join(dest, 'scripts'), { recursive: true })
  rmSync(join(dest, 'scripts/tests'), { recursive: true, force: true })
  // Generators that call a hosted model (Gemini) for icons/logos/CIP are excluded: build-time skills make no provider calls (ADR-021).
  for (const gen of ['cip', 'icon', 'logo'])
    rmSync(join(dest, 'scripts', gen), { recursive: true, force: true })
  manifest.push({
    name: 'ui-ux-pro-max',
    package: `ui-ux-pro-max-cli@${version('ui-ux-pro-max-cli')}`,
    sha256: hashDir(dest),
    adopted: 'design skill + search data/scripts',
    ignored:
      'ui-styling, design-system (Tailwind/shadcn), slides, banner-design, brand; scripts/{cip,icon,logo} (call Gemini API)',
  })
}

// 2. ux-ui-agent-skills (plugin87) — persona, accessibility, tokens, taste, workflows, scripts; examples/templates excluded.
{
  const src = pkgDir('ux-ui-agent-skills')
  const dest = join(out, 'ux-ui-agent-skills')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const d of [
    'CLAUDE.md',
    'README.md',
    'accessibility',
    'tokens',
    'taste',
    'workflows',
    'content',
    'components',
    'scripts',
    'docs',
  ]) {
    if (existsSync(join(src, d))) cpSync(join(src, d), join(dest, d), { recursive: true })
  }
  rmSync(join(dest, 'scripts/__pycache__'), { recursive: true, force: true })
  // The skill's own SKILL.md front door for Claude Code
  writeFileSync(
    join(dest, 'SKILL.md'),
    `---\nname: ux-ui-agent-skills\ndescription: Senior UX/UI design architect — DTCG design tokens, WCAG 2.2 AA audits (/a11y-audit, /design-review), component specs. Use for design review and accessibility checks of blocks. Precedence: design-contract.json and quality gates win over this skill's defaults.\n---\n\nRead CLAUDE.md in this folder for the persona and the runnable skills. Framework reference implementations (React+Tailwind) are NOT used in this repository; blocks are CSS Modules on design-contract tokens.\n`,
  )
  manifest.push({
    name: 'ux-ui-agent-skills',
    package: `ux-ui-agent-skills@${version('ux-ui-agent-skills')}`,
    sha256: hashDir(dest),
    adopted: 'persona, accessibility, tokens, taste, workflows, scripts',
    ignored: 'frameworks/, design-systems/library, examples/, templates/',
  })
}

// 3. frontend-design (Anthropic) — vendored file, pinned by content hash.
{
  const f = join(out, 'frontend-design/SKILL.md')
  if (existsSync(f))
    manifest.push({
      name: 'frontend-design',
      source:
        'https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md',
      sha256: createHash('sha256').update(readFileSync(f)).digest('hex'),
      adopted: 'design-planning + critique process',
      note: 'anti-pattern list is advisory; design-contract wins (ADR-021)',
    })
}

// 4. Fixers (accessibility, motion+performance, baseline UI) — pending: source repositories to be confirmed before vendoring.
manifest.push({
  name: 'fixers',
  status: 'pending',
  note: 'Fixing Accessibility / Fixing Motion+Performance / Baseline UI — listed in the Frontend Design Toolkit; add when their canonical repos are confirmed (docs/build-skills.md).',
})

// 5. Verify against the committed manifest (the lockfile for prompts). A skill whose content hash
// changed is refused unless --accept-new-hash is passed explicitly — skills are prompts, so a silent
// upstream change is a prompt-injection channel (ADR-023). Renovate bumps land here for a human to read.
const manifestPath = join(out, 'MANIFEST.json')
const acceptNew = process.argv.includes('--accept-new-hash')
if (existsSync(manifestPath)) {
  const prev = JSON.parse(readFileSync(manifestPath, 'utf8')).skills ?? []
  const drift = []
  for (const m of manifest) {
    const before = prev.find((p) => p.name === m.name)
    if (!before) {
      if (m.sha256) drift.push(`${m.name}: new skill (no committed hash)`)
      continue
    }
    if (before.sha256 && m.sha256 && before.sha256 !== m.sha256)
      drift.push(`${m.name}: content hash changed ${before.sha256.slice(0, 12)}… → ${m.sha256.slice(0, 12)}…`)
    if (before.package && m.package && before.package !== m.package)
      drift.push(`${m.name}: package ${before.package} → ${m.package}`)
  }
  if (drift.length && !acceptNew) {
    console.error('Skill content differs from .claude/skills/MANIFEST.json:\n  ' + drift.join('\n  '))
    console.error('Read the diff, then rerun with --accept-new-hash to record the new hashes.')
    process.exit(2)
  }
  if (drift.length) console.warn('Accepted new skill hashes:\n  ' + drift.join('\n  '))
}

writeFileSync(
  manifestPath,
  JSON.stringify({ generatedBy: 'tools/scripts/install-skills.mjs', skills: manifest }, null, 2) + '\n',
)
console.log(manifest.map((m) => `${m.name}: ${m.package ?? m.source ?? m.status}`).join('\n'))
