import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), '../..')
const wf = readFileSync(path.join(root, '.github/workflows/h2o-release.yml'), 'utf8')
const actions = ['h2o-setup', 'h2o-media'].map((n) => readFileSync(path.join(root, `.github/actions/${n}/action.yml`), 'utf8'))
const all = [wf, ...actions].join('\n')
const code = all.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')

/** The bodies of every `run: |` script (lines indented deeper than the `run:` key). */
const runScripts = (text: string): string[] => {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(- )?run:\s*\|?\s*(.*)$/.exec(lines[i]!)
    if (!m) continue
    const indent = m[1]!.length + (m[2] ? 2 : 0)
    const body = [m[3] ?? '']
    for (let j = i + 1; j < lines.length && (lines[j]!.trim() === '' || lines[j]!.search(/\S/) > indent); j++) body.push(lines[j]!)
    out.push(body.join('\n'))
  }
  return out
}

/** The text of one top-level job (from "  name:" to the next job). */
const job = (name: string) => {
  const start = wf.indexOf(`\n  ${name}:\n`)
  expect(start, name).toBeGreaterThan(-1)
  const rest = wf.slice(start + 1)
  const next = rest.slice(1).search(/\n  [a-z-]+:\n/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

describe('DEPLOY-PIPE-1 workflow safety (static)', () => {
  it('is inert until H2O_RELEASE_CI_ENABLED = true: every real job hangs off the gate', () => {
    expect(wf).toContain("ENABLED: ${{ vars.H2O_RELEASE_CI_ENABLED }}")
    expect(job('classify')).toContain("needs.gate.outputs.on == 'true'")
    for (const j of ['gates-light', 'static', 'unit', 'crm-db', 'schema', 'image']) expect(job(j), j).toContain('needs: classify')
    expect(job('publish')).toContain('needs.classify.result')
  })
  it('holds no deploy credential: nothing about Coolify, SSH or the VPS, no pull_request_target, no set -x', () => {
    expect(code).not.toMatch(/coolify|ssh-|SSH_|pull_request_target|set -x|id_rsa|\.env/i)
  })
  it('NO personal access token and no repository secret: the only secret is the job-scoped GITHUB_TOKEN, and never inside a run script (Auditor B-1)', () => {
    const used = [...code.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1])
    expect(new Set(used)).toEqual(new Set(['GITHUB_TOKEN']))
    expect(code).not.toMatch(/GHCR_PUSH_TOKEN|\|\|\s*secrets\./)
    const scripts = [...runScripts(wf), ...actions.flatMap(runScripts)]
    expect(scripts.length).toBeGreaterThan(10)
    for (const sc of scripts) expect(sc).not.toContain('secrets.')
  })
  it('workflow_dispatch inputs reach scripts only through env, never interpolated into a run script', () => {
    const jobsPart = wf.slice(wf.indexOf('\njobs:'))
    expect(jobsPart).not.toMatch(/\$\{\{\s*(inputs|github\.event)\./)
    expect(jobsPart).not.toMatch(/\$\{\{\s*github\.head_ref/)
  })
  it('every third-party action is pinned to a full commit SHA with its version in a comment (Auditor F-1), and Dependabot keeps them current', () => {
    const lines = code.split('\n').filter((l) => /uses:/.test(l) && !/uses:\s*\.\//.test(l))
    expect(lines.length).toBeGreaterThan(10)
    for (const l of lines) expect(l, l).toMatch(/uses:\s*[\w./-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+/)
    const dep = readFileSync(path.join(root, '.github/dependabot.yml'), 'utf8')
    expect(dep).toContain('package-ecosystem: github-actions')
    expect(dep).toContain('/.github/actions/h2o-media')
  })
  it('only image and publish hold a WRITE login; unit and gates-light are read-only (Auditor F-2)', () => {
    for (const j of ['gates-light', 'unit']) {
      expect(job(j), j).toContain('packages: read')
      expect(job(j), j).not.toContain('packages: write')
    }
    for (const j of ['image', 'publish']) expect(job(j), j).toContain('packages: write')
    for (const j of ['classify', 'static', 'crm-db', 'schema']) expect(job(j), j).not.toContain('docker/login-action')
  })
  it('the diff base and the previous image cannot be overridden by a run; the previous image must be the deployed head (Auditor F-3)', () => {
    expect(wf).not.toMatch(/base_sha|prev_digest/)
    expect(wf).toContain('BASE_SHA: ${{ vars.H2O_DEPLOYED_SHA }}')
    expect(wf).toContain('PREV_DIGEST: ${{ vars.H2O_DEPLOYED_DIGEST }}')
    expect(job('gate')).toContain("grep -Eq '^sha256:[0-9a-f]{64}$'")
    const media = actions[1]!
    expect(media).toContain("grep -Eq '^sha256:[0-9a-f]{64}$'")
    expect(media).toContain('org.opencontainers.image.revision')
    expect(media).toContain('variables out of step')
  })
  it('light runs the FULL unit suite whenever content/** changed (Auditor F-4)', () => {
    const l = job('gates-light')
    expect(l).toContain("grep -q '^apps/h2o/content/'")
    expect(l).toMatch(/vitest run --maxWorkers=2 --testTimeout=60000/)
    expect(l).toContain('vitest related')
  })
  it('the server URL must be set, or nothing runs (Auditor F-5)', () => {
    expect(job('gate')).toContain('H2O_SERVER_URL must be set')
  })
  it('checkouts keep no credentials (Auditor F-6): persist-credentials false everywhere; the LFS fetch gets the token per process; .git is ignored by the build context and never copied', () => {
    const checkouts = wf.split('actions/checkout@').slice(1)
    expect(checkouts.length).toBeGreaterThanOrEqual(7)
    for (const c of checkouts) expect(c.slice(0, 260)).toContain('persist-credentials: false')
    expect(actions[1]).toContain('H2O_LFS_TOKEN')
    expect(actions[1]).not.toMatch(/extraheader|git config/)
    const ignore = readFileSync(path.join(root, 'apps/h2o/Dockerfile.runtime.dockerignore'), 'utf8').split('\n')
    expect(ignore).toContain('.git')
    expect(readFileSync(path.join(root, 'apps/h2o/Dockerfile.runtime'), 'utf8')).not.toMatch(/^COPY\s+(--\S+\s+)*\.\s/m)
  })
  it('the identity checks run the candidate image with no network, a read-only root and no capabilities (Auditor N-1)', () => {
    const sh = readFileSync(path.join(root, 'apps/h2o/ops/ci/check-image-identity.sh'), 'utf8')
    expect(sh).toContain('--network none --read-only --cap-drop ALL')
    expect(sh).not.toMatch(/docker run (?!"\$\{SAFE)/)
  })
  it('only a fully green release gets the deployable tag; the candidate tag is not deployable', () => {
    const p = job('publish')
    expect(p).toContain("if: steps.verdict.outputs.ok == 'true'")
    expect(p).toContain('imagetools create')
    expect(p).toContain('NOT DEPLOYABLE')
    expect(job('image')).toContain('candidate-')
    expect(job('image')).not.toContain('-production')
  })
  it('the image is built for linux/amd64, by digest, with the revision label and the identity checks before it counts', () => {
    const i = job('image')
    expect(i).toContain('platforms: linux/amd64')
    expect(i).toContain('H2O_REVISION=${{ env.HEAD_SHA }}')
    expect(i).toContain('check-image-identity.sh')
    expect(i).toContain('lfs: false')
  })
  it('both triggers are supported (a release/** push AND workflow_dispatch with a head SHA), the build uses exactly that commit, and a bad sha stops everything', () => {
    expect(wf).toContain("branches: ['release/**']")
    expect(wf).toContain('workflow_dispatch:')
    expect(wf).toContain('head_sha:')
    expect(wf).toContain('HEAD_SHA: ${{ inputs.head_sha || github.sha }}')
    expect(job('gate')).toContain("grep -Eq '^[0-9a-f]{40}$'")
    expect(code).not.toContain('GITHUB_SHA')
    for (const c of wf.split('actions/checkout@').slice(1)) expect(c.slice(0, 260)).toContain("ref: '${{ env.HEAD_SHA }}'")
    expect(code).toContain('${HEAD_SHA:0:12}-production')
  })
  it('release branches are add-only (documented) and the workflow never force-pushes or pushes git refs', () => {
    expect(code).not.toMatch(/git push|--force|force-with-lease/)
    expect(wf).toContain('never force-push')
  })
  it('every checkout is lfs:false (the media comes from the previous image, not from GitHub LFS bandwidth)', () => {
    const checkouts = wf.split('actions/checkout@').slice(1)
    expect(checkouts.length).toBeGreaterThanOrEqual(7)
    for (const c of checkouts) expect(c.slice(0, 120), c.slice(0, 60)).toContain('lfs: false')
  })
  it('the full-class gates include the sharded CRM DB suite, the schema probe and generate:types', () => {
    expect(job('crm-db')).toContain('--shard=${{ matrix.shard }}/4')
    expect(job('crm-db')).toContain('postgres:16-alpine')
    expect(job('schema')).toContain('No schema changes detected')
    expect(job('schema')).toContain('git diff --exit-code -- apps/h2o/src/payload-types.ts')
    expect(readdirSync(path.join(root, '.github/workflows'))).toContain('h2o-release.yml')
  })
})
