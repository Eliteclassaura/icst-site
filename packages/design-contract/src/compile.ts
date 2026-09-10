import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseContract, type DesignContract } from './schema.ts'
import { emitCss, emitFontsCss, emitTs, contrastReport } from './emit/index.ts'

export type CompileResult = { files: string[]; contrast: ReturnType<typeof contrastReport> }

/** Validate a contract and write tokens.css, fonts.css, tokens.ts, contrast-report.json into outDir. */
export function compile(contractOrPath: DesignContract | string, outDir: string): CompileResult {
  const contract =
    typeof contractOrPath === 'string'
      ? parseContract(JSON.parse(readFileSync(contractOrPath, 'utf8')))
      : parseContract(contractOrPath)
  mkdirSync(outDir, { recursive: true })
  const contrast = contrastReport(contract)
  const out: Record<string, string> = {
    'tokens.css': emitCss(contract),
    'fonts.css': emitFontsCss(contract),
    'tokens.ts': emitTs(contract),
    'contrast-report.json': JSON.stringify(contrast, null, 2) + '\n',
  }
  for (const [name, text] of Object.entries(out)) writeFileSync(join(outDir, name), text)
  return { files: Object.keys(out).map((f) => join(outDir, f)), contrast }
}
