/**
 * factory-design from-css <site.css> --client <id> --brand <name> --public <dir> --out <contract.json> [--notes <md>]
 * factory-design compile <contract.json> --out <dir>
 */
import { writeFileSync } from 'node:fs'
import { fromCss } from './adapters/from-css.ts'
import { installFonts, SYED_FONTS } from './fonts.ts'
import { compile } from './compile.ts'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (k: string) => {
  const i = rest.indexOf(`--${k}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1]!.startsWith('--')))

if (cmd === 'from-css') {
  const cssPath = positional[0]
  const client = flag('client'),
    brand = flag('brand'),
    pub = flag('public'),
    out = flag('out')
  if (!cssPath || !client || !brand || !pub || !out) {
    console.error(
      'usage: factory-design from-css <site.css> --client <id> --brand <name> --public <dir> --out <contract.json> [--notes <md>]',
    )
    process.exit(2)
  }
  const fonts = { display: installFonts(SYED_FONTS.display, pub), text: installFonts(SYED_FONTS.text, pub) }
  const contract = fromCss({
    cssPath,
    notesPath: flag('notes'),
    client,
    name: `${brand} design contract`,
    brandName: brand,
    fonts,
  })
  writeFileSync(out, JSON.stringify(contract, null, 2) + '\n')
  console.warn(
    `wrote ${out} (${Object.keys(contract.legacyVars).length} legacy vars, ${Object.keys(contract.palette).length} palette entries)`,
  )
} else if (cmd === 'compile') {
  const contract = positional[0],
    out = flag('out')
  if (!contract || !out) {
    console.error('usage: factory-design compile <contract.json> --out <dir>')
    process.exit(2)
  }
  const res = compile(contract, out)
  for (const f of res.files) console.warn(`wrote ${f}`)
  const failed = res.contrast.results.filter((r) => !r.pass)
  for (const r of failed)
    console.error(`✖ contrast ${r.foreground} on ${r.background} (${r.use}) = ${r.ratio} < ${r.required}`)
  console.warn(
    res.contrast.pass
      ? '✔ all declared contrast pairs pass WCAG AA'
      : `✖ ${failed.length} contrast failure(s)`,
  )
  process.exit(res.contrast.pass ? 0 : 1)
} else {
  console.error('usage: factory-design <from-css|compile> ...')
  process.exit(2)
}
