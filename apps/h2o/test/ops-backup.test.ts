import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Patch L3 backup scripts: fail closed, never leak a credential, never restore over a live database.
 * The full dump → encrypt → upload → restore path is exercised by `ops/backup/restore-drill.sh` (needs age, rclone and
 * a synthetic Postgres); these checks need only bash and run in every unit gate.
 */
const DIR = path.join(import.meta.dirname, '..', 'ops', 'backup')
const SECRET = 'S3cret-Pw-never-logged'
const run = (script: string, env: Record<string, string>, args: string[] = []) =>
  // A minimal environment on purpose: nothing from the developer's shell may satisfy the scripts' configuration.
  spawnSync('bash', [path.join(DIR, script), ...args], { env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv, encoding: 'utf8' })

describe('L3 backup scripts', () => {
  it('with nothing configured, a backup run is a clear no-op (NOT_READY), not a failure and not a dump', () => {
    const r = run('h2o-backup.sh', {})
    expect(r.status).toBe(0)
    expect(r.stderr).toMatch(/NOT_READY .*Nothing was dumped/)
  })

  it('a partial or invalid configuration fails loudly and never echoes the database URL', () => {
    const partial = run('h2o-backup.sh', { H2O_BACKUP_DATABASE_URL: `postgres://u:${SECRET}@db.example.test/h2o` })
    expect(partial.status).toBe(2)
    expect(partial.stderr).toMatch(/CONFIG_MISSING H2O_BACKUP_AGE_RECIPIENTS H2O_BACKUP_DEST/)
    expect(partial.stderr).not.toContain(SECRET)
    // A private key pasted where the public key belongs is refused, and not echoed back.
    const secretKey = 'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ'
    const wrongKey = run('h2o-backup.sh', {
      H2O_BACKUP_DATABASE_URL: `postgres://u:${SECRET}@db.example.test/h2o`,
      H2O_BACKUP_AGE_RECIPIENTS: secretKey,
      H2O_BACKUP_DEST: 'r2:h2o-backups/prod',
    })
    expect(wrongKey.status).toBe(2)
    expect(wrongKey.stderr).toMatch(/never a secret key/)
    expect(wrongKey.stderr).not.toContain(secretKey)
    expect(wrongKey.stderr).not.toContain(SECRET)
    const badRetention = run('h2o-backup.sh', {
      H2O_BACKUP_DATABASE_URL: 'postgres://u@db.example.test/h2o',
      H2O_BACKUP_AGE_RECIPIENTS: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
      H2O_BACKUP_DEST: 'r2:h2o-backups/prod',
      H2O_BACKUP_KEEP_DAILY: '0',
    })
    expect(badRetention.status).toBe(2)
  })

  it('restore requires its arguments and refuses a target whose name does not say "restore"', () => {
    expect(run('h2o-restore.sh', {}).status).toBe(2)
    const r = run('h2o-restore.sh', { H2O_BACKUP_DEST: 'r2:h2o-backups/prod' }, [
      '--object', 'latest', '--identity', '/dev/null', '--target-url', 'postgres://u@db.example.test/h2o_production',
    ])
    // Refused on the name before any tool, network or database is touched.
    expect(r.status).toBe(6)
    expect(r.stderr).toMatch(/REFUSED target database name must contain "restore"/)
  })

  it('every script is strict (errexit, nounset, pipefail, private umask) and never traces commands', () => {
    for (const f of ['h2o-backup.sh', 'h2o-restore.sh', 'entrypoint.sh', 'restore-drill.sh']) {
      const text = readFileSync(path.join(DIR, f), 'utf8')
      expect(text, f).toMatch(/^set -euo pipefail$/m)
      expect(text, f).not.toMatch(/set -x|bash -x|set -o xtrace/)
      if (f !== 'entrypoint.sh') expect(text, f).toMatch(/^umask 077$/m)
      // Credentials are only ever passed to tools, never printed.
      expect(text, f).not.toMatch(/(echo|printf)[^\n]*\$\{?(H2O_BACKUP_DATABASE_URL|DB_URL|RCLONE_CONFIG_[A-Z_]*SECRET)/)
    }
  })

  it('the runner image pins the server major and does not run as root', () => {
    const docker = readFileSync(path.join(DIR, 'Dockerfile'), 'utf8')
    expect(docker).toMatch(/^FROM postgres:16-alpine$/m)
    expect(docker).toMatch(/^USER postgres$/m)
    expect(docker).not.toMatch(/^EXPOSE/m)
  })
})
