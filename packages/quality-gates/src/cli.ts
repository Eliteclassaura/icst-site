import { scan } from './residue.ts'

const [cmd, ...rest] = process.argv.slice(2)
if (cmd !== 'scan') {
  console.error('usage: factory-gates scan <root> [--forbid=word,word] [--json]')
  process.exit(2)
}
const root = rest.find((a) => !a.startsWith('--')) ?? '.'
const forbid =
  rest
    .find((a) => a.startsWith('--forbid='))
    ?.slice('--forbid='.length)
    .split(',')
    .filter(Boolean) ?? []
const json = rest.includes('--json')
const findings = await scan({ root, forbiddenLiterals: forbid })
if (json) {
  console.warn(JSON.stringify({ ok: findings.length === 0, findings }, null, 2))
} else {
  for (const f of findings) console.error(`${f.file}:${f.line}  [${f.rule}]  ${f.detail}`)
  console.error(findings.length ? `\n✖ ${findings.length} residue/secret finding(s)` : '✔ residue scan clean')
}
process.exit(findings.length ? 1 : 0)
