import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'
import { bootstrapAdmin, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem, planBootstrap } from '../bootstrap-admin'
import { readHidden } from '../hidden-prompt'

/**
 * The first-admin bootstrap (no database): the environment is validated, the password rule, the refusal when any admin exists, that
 * the password goes to Payload and nowhere else, and the hidden prompt. The real-database run is in the delivery note.
 */
const PW = 'Correct-Horse-Battery-7' // a throwaway test value

describe('planBootstrap', () => {
  it('needs a valid email; the name is optional and cleaned; the email is lower-cased', () => {
    expect(planBootstrap({})).toMatchObject({ ok: false })
    expect(planBootstrap({ BOOTSTRAP_ADMIN_EMAIL: 'not an email' })).toMatchObject({ ok: false })
    expect(planBootstrap({ BOOTSTRAP_ADMIN_EMAIL: 'a@b' })).toMatchObject({ ok: false })
    expect(planBootstrap({ BOOTSTRAP_ADMIN_EMAIL: ' Owner@Example.Test ', BOOTSTRAP_ADMIN_NAME: '  Pat   Owner ' })).toEqual({ ok: true, input: { email: 'owner@example.test', name: 'Pat Owner' } })
    expect(planBootstrap({ BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test' })).toEqual({ ok: true, input: { email: 'owner@example.test', name: 'Administrator' } })
  })
  it('refuses a name with control characters or an absurd length', () => {
    expect(planBootstrap({ BOOTSTRAP_ADMIN_EMAIL: 'o@example.test', BOOTSTRAP_ADMIN_NAME: 'a\nb' })).toMatchObject({ ok: false })
    expect(planBootstrap({ BOOTSTRAP_ADMIN_EMAIL: 'o@example.test', BOOTSTRAP_ADMIN_NAME: 'x'.repeat(81) })).toMatchObject({ ok: false })
  })
  it('never reads a password from the environment', () => {
    const plan = planBootstrap({ BOOTSTRAP_ADMIN_EMAIL: 'o@example.test', BOOTSTRAP_ADMIN_PASSWORD: PW, PASSWORD: PW })
    expect(JSON.stringify(plan)).not.toContain(PW)
  })
})

describe('passwordProblem', () => {
  it('requires the minimum length, refuses a huge one, the email name inside it, and one repeated character', () => {
    expect(passwordProblem('x'.repeat(MIN_PASSWORD_LENGTH - 1), 'o@example.test')).toMatch(/at least/)
    expect(passwordProblem('x1'.repeat(MAX_PASSWORD_LENGTH), 'o@example.test')).toMatch(/at most/)
    expect(passwordProblem('prefix-owner-suffix-1234', 'owner@example.test')).toMatch(/email name/)
    expect(passwordProblem('a'.repeat(20), 'o@example.test')).toMatch(/repeated/)
    expect(passwordProblem(PW, 'owner@example.test')).toBeNull()
  })
})

describe('bootstrapAdmin', () => {
  function fake(adminExists: boolean, failCreate = false) {
    const created: Array<Record<string, unknown>> = []
    const finds: unknown[] = []
    const payload = {
      find: async (args: unknown) => {
        finds.push(args)
        return { docs: adminExists ? [{ id: 'u1' }] : [] }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failCreate) throw Object.assign(new Error(`insert failed for ${String(data.email)} ${String(data.password)}`), { name: 'DatabaseError' })
        created.push(data)
        return { id: 'new-id' }
      },
    } as unknown as Payload
    return { payload, created, finds }
  }
  const input = { email: 'owner@example.test', name: 'Pat Owner' }
  it('creates exactly one platform-admin with the typed password handed to Payload', async () => {
    const { payload, created, finds } = fake(false)
    const r = await bootstrapAdmin(payload, input, PW)
    expect(r).toEqual({ ok: true, created: true, userId: 'new-id' })
    expect(created).toHaveLength(1)
    expect(created[0]).toEqual({ email: 'owner@example.test', name: 'Pat Owner', password: PW, roles: ['platform-admin'] })
    expect(JSON.stringify(r)).not.toContain(PW)
    expect(JSON.stringify(finds[0])).toContain('platform-admin')
    expect(JSON.stringify(finds[0])).toContain('client-admin') // either admin role counts
  })
  it('REFUSES when any admin already exists and creates nothing; the answer does not carry the password', async () => {
    const { payload, created } = fake(true)
    const r = await bootstrapAdmin(payload, input, PW)
    expect(r).toMatchObject({ ok: false, code: 'ADMIN_EXISTS' })
    expect(created).toHaveLength(0)
    expect(JSON.stringify(r)).not.toContain(PW)
    expect(await bootstrapAdmin(payload, input, PW)).toMatchObject({ ok: false, code: 'ADMIN_EXISTS' }) // and again: still nothing
    expect(created).toHaveLength(0)
  })
  it('a weak password is refused before the database is touched', async () => {
    const { payload, created, finds } = fake(false)
    expect(await bootstrapAdmin(payload, input, 'short')).toMatchObject({ ok: false, code: 'BAD_PASSWORD' })
    expect(created).toHaveLength(0)
    expect(finds).toHaveLength(0)
  })
  it('a failed create reports the error NAME only, never the message (which could echo the email or the password)', async () => {
    const { payload } = fake(false, true)
    const r = await bootstrapAdmin(payload, input, PW)
    expect(r).toMatchObject({ ok: false, code: 'CREATE_FAILED' })
    expect(JSON.stringify(r)).not.toContain(PW)
    expect(JSON.stringify(r)).not.toContain('owner@example.test')
    expect(JSON.stringify(r)).toContain('DatabaseError')
  })
})

describe('the hidden prompt', () => {
  const drive = async (typed: string) => {
    const input = new PassThrough()
    const written: string[] = []
    const p = readHidden(input as never, { write: (s: string) => written.push(s) }, 'Password: ')
    input.write(typed)
    return { value: await p.catch((e: Error) => e), written }
  }
  it('returns what was typed, applies Backspace, and ends at Enter', async () => {
    const { value } = await drive(`${PW}x\u007f\r`)
    expect(value).toBe(PW)
  })
  it('echoes nothing of the typed text (only the prompt and the final newline)', async () => {
    const { written } = await drive(`${PW}\r`)
    expect(written.join('')).toBe('Password: \n')
    expect(written.join('')).not.toContain(PW.slice(0, 5))
  })
  it('Ctrl-C and Ctrl-D abort without returning a value', async () => {
    expect(((await drive('abc\u0003')).value as Error).message).toBe('aborted')
    expect(((await drive('abc\u0004')).value as Error).message).toBe('aborted')
  })
})

describe('the hidden prompt switches echo off before it shows the prompt', () => {
  it('raw mode is set first on a terminal, and restored at the end', async () => {
    const calls: string[] = []
    const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: (on: boolean) => calls.push(`raw:${on}`) })
    const p = readHidden(input as never, { write: (s: string) => calls.push(`out:${JSON.stringify(s)}`) }, 'P: ')
    input.write('pw\r')
    await p
    expect(calls).toEqual(['raw:true', 'out:"P: "', 'raw:false', 'out:"\\n"'])
  })
})

describe('the run entry', () => {
  const src = readFileSync(path.join(__dirname, '../bootstrap-admin.run.ts'), 'utf8')
  it('refuses without a terminal, takes no password argument or environment value, and prints no password', () => {
    expect(src).toContain('process.stdin.isTTY')
    expect(src).not.toMatch(/process\.argv|BOOTSTRAP_ADMIN_PASSWORD|process\.env\.PASSWORD/)
    expect(src).not.toMatch(/\$\{\s*(first|second)\s*\}/) // the typed values are never interpolated into any text
    expect(src.match(/\b(first|second)\b/g)!.length).toBeLessThan(14) // and used only in the comparison, the rule check and the create call
    expect(src).not.toMatch(/console\.(log|error|info)/)
  })
})
