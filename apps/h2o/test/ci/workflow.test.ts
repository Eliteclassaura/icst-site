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
  it('the only secrets used are GHCR_PUSH_TOKEN and GITHUB_TOKEN, and never inside a run script', () => {
    const used = [...code.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1])
    expect(new Set(used)).toEqual(new Set(['GHCR_PUSH_TOKEN', 'GITHUB_TOKEN']))
    const scripts = [...runScripts(wf), ...actions.flatMap(runScripts)]
    expect(scripts.length).toBeGreaterThan(10)
    for (const sc of scripts) expect(sc).not.toContain('secrets.')
  })
  it('workflow_dispatch inputs reach scripts only through env, never interpolated into a run script', () => {
    const jobsPart = wf.slice(wf.indexOf('\njobs:'))
    expect(jobsPart).not.toMatch(/\$\{\{\s*(inputs|github\.event)\./)
    expect(jobsPart).not.toMatch(/\$\{\{\s*github\.head_ref/)
  })
  it('actions are pinned to a version tag (never a branch)', () => {
    const uses = [...all.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1]!).filter((u) => !u.startsWith('./'))
    expect(uses.length).toBeGreaterThan(5)
    for (const u of uses) expect(u, u).toMatch(/@v\d+$/)
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
    expect(wf).toContain("grep -Eq '^[0-9a-f]{40}$'")
    expect(code).not.toContain('GITHUB_SHA')
    for (const c of wf.split('actions/checkout@v4').slice(1)) expect(c.slice(0, 160)).toContain("ref: '${{ env.HEAD_SHA }}'")
    expect(code).toContain('${HEAD_SHA:0:12}-production')
  })
  it('release branches are add-only (documented) and the workflow never force-pushes or pushes git refs', () => {
    expect(code).not.toMatch(/git push|--force|force-with-lease/)
    expect(wf).toContain('never force-push')
  })
  it('the push credential: GHCR_PUSH_TOKEN is the supported one, GITHUB_TOKEN only a documented fallback', () => {
    expect(wf).toContain('GHCR_PUSH_TOKEN')
    expect(wf).toContain('do not rely on it')
  })
  it('every checkout is lfs:false (the media comes from the previous image, not from GitHub LFS bandwidth)', () => {
    const checkouts = wf.split('actions/checkout@v4').slice(1)
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
