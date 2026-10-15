import config from '@payload-config'
import { getPayload } from 'payload'
import { bootstrapAdmin, MIN_PASSWORD_LENGTH, passwordProblem, planBootstrap } from './bootstrap-admin'
import { readHidden } from './hidden-prompt'

/**
 * `pnpm bootstrap-admin` (payload run), by the operator with the owner at the keyboard of the PRIVATE host, after
 * migrate, identity-step and seed-pack. Needs BOOTSTRAP_ADMIN_EMAIL (and optionally BOOTSTRAP_ADMIN_NAME). Refuses without a terminal:
 * the password is typed by the owner at a hidden prompt, never taken from an argument, a variable, a pipe or a file.
 * Top-level await on purpose: `payload run` exits when the module has loaded.
 */
const out = (s: string) => process.stdout.write(`${s}\n`)
const plan = planBootstrap(process.env)
if (!plan.ok) {
  out(plan.problem)
  process.exit(2)
}
if (!process.stdin.isTTY) {
  out('This command needs a terminal: the owner types the password at a hidden prompt. It never reads a password from a pipe, a file or the environment.')
  process.exit(3)
}
const payload = await getPayload({ config })
out(`Creating the first platform-admin for ${plan.input.email}. The owner chooses the password now (at least ${MIN_PASSWORD_LENGTH} characters; nothing is shown as it is typed).`)
const first = await readHidden(process.stdin, process.stdout, 'Password: ')
const second = await readHidden(process.stdin, process.stdout, 'Password again: ')
if (first !== second) {
  out('The two entries differ. Nothing was created. Run the command again.')
  process.exit(4)
}
const problem = passwordProblem(first, plan.input.email)
if (problem) {
  out(`${problem} Nothing was created. Run the command again.`)
  process.exit(4)
}
const result = await bootstrapAdmin(payload, plan.input, first)
if (!result.ok) {
  out(result.message)
  process.exit(result.code === 'ADMIN_EXISTS' ? 5 : 6)
}
const base = (process.env.NEXT_PUBLIC_SERVER_URL ?? '').replace(/\/+$/, '')
out('Created. Next, the owner (in person, on this private host):')
out(`  1. Open ${base}/admin/login/ and sign in with that email and the password just typed.`)
out('  2. Scan the QR code with an authenticator app, enter the code, and save the recovery codes it shows.')
out('Nothing else holds the password: Payload stored only a hash of it.')
process.exit(0)
