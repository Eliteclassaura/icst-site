/**
 * IMPORT-CLI-1 — operator entry point for a contact import without a browser
 * (run with `pnpm --filter @factory/h2o payload run src/crm/import/cli.ts -- <cmd> ...`):
 *
 *   dry   --file <path> --sha256 <hex> --as-admin <email>
 *         verify the file, plan it, print the counts and the approval token. Writes nothing.
 *   apply --file <path> --sha256 <hex> --as-admin <email> --approval <token> --note <who/why, no personal data>
 *         refuses unless email sending, the Revenue Engine and inbound mail are OFF; applies the approved plan; proves
 *         0 new enrollments and 0 new outgoing email; prints the batch ids and counts.
 *   undo  --sha256 <hex> --as-admin <email> --note <why>
 *         archives every batch of this file (archive-only, audited).
 *
 * IMPORT-TYPEFORM-1 — the Typeform leads sheet (contacts + one past quote request per response; post-launch):
 *   tf-dry   --file <path> --sha256 <hex> --as-admin <email>
 *   tf-apply --file <path> --sha256 <hex> --as-admin <email> --approval <token> --note <who/why, no personal data>
 *   tf-undo  --file <path> --sha256 <hex> --as-admin <email> --note <why>
 *
 * Output is counts, batch ids, the file hash and codes only. Exit code 0 = done, 1 = refused (with a code).
 */
import { readFileSync } from 'node:fs'
import config from '@payload-config'
import { getPayload } from 'payload'
import { OperatorError, apply, dryRun, undo } from './operator'
import { applyTypeform, planTypeform, typeformDryOutput, undoTypeform } from './typeform'

const out = (m: unknown) => process.stdout.write(`${JSON.stringify(m)}\n`)
const arg = (args: string[], name: string): string => {
  const i = args.indexOf(`--${name}`)
  const v = i >= 0 ? args[i + 1] : undefined
  if (!v) throw new OperatorError(`ARGUMENT_MISSING_${name.toUpperCase().replace(/-/g, '_')}`)
  return v
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const cmd = args[0]
  const payload = await getPayload({ config })
  if (cmd === 'dry') {
    const r = await dryRun(payload, readFileSync(arg(args, 'file')), arg(args, 'sha256'), arg(args, 'as-admin'))
    out({ ok: true, mode: 'dry', ...r })
  } else if (cmd === 'apply') {
    const r = await apply(payload, readFileSync(arg(args, 'file')), arg(args, 'sha256'), arg(args, 'as-admin'), arg(args, 'approval'), process.env, arg(args, 'note'))
    out({ ok: true, mode: 'apply', ...r })
  } else if (cmd === 'undo') {
    const r = await undo(payload, arg(args, 'sha256'), arg(args, 'as-admin'), arg(args, 'note'))
    out({ mode: 'undo', ...r })
  } else if (cmd === 'tf-dry') {
    out({ ok: true, mode: 'tf-dry', ...typeformDryOutput(await planTypeform(payload, readFileSync(arg(args, 'file')), arg(args, 'sha256'), arg(args, 'as-admin'))) })
  } else if (cmd === 'tf-apply') {
    const r = await applyTypeform(payload, readFileSync(arg(args, 'file')), arg(args, 'sha256'), arg(args, 'as-admin'), arg(args, 'approval'), process.env, arg(args, 'note'))
    out({ ok: true, mode: 'tf-apply', ...r })
  } else if (cmd === 'tf-undo') {
    out({ mode: 'tf-undo', ...(await undoTypeform(payload, readFileSync(arg(args, 'file')), arg(args, 'sha256'), arg(args, 'as-admin'), arg(args, 'note'))) })
  } else throw new OperatorError('UNKNOWN_COMMAND')
  process.exit(0)
}

// awaited: `payload run` exits once the module has loaded, so an un-awaited main() would print nothing and exit 0
await main().catch((err) => {
  // codes only: an unexpected error prints its name, never its message (which could carry a value from the file)
  out({ ok: false, code: err instanceof OperatorError ? err.code : String((err as { name?: unknown })?.name ?? 'ERROR').slice(0, 60) })
  process.exit(1)
})
