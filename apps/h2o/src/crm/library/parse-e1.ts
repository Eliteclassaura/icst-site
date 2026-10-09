import { createHash } from 'node:crypto'

/**
 * EMAIL-LIB-1: parser for `E1_EXACT_SEQUENCE_STEPS_AND_COPY.md` (the owner's E1.1–E1.4 exact copy). Pure; no database.
 *
 * The source is generated mechanically from the frozen sequence_library.json / sequence_steps.json, so its shape is
 * regular: `## ICS_EMAIL_REVENUE_E1_n_…` per program, `### SEQUENCE / n / STEP_CODE` per step, then `**Heading**`
 * blocks of bullet lines. Copy is taken VERBATIM: nothing is trimmed inside a variant, reflowed or reworded. Each
 * step carries `source_hash` = sha256 of its exact source block, so a re-import and a later test can prove the stored
 * text is the source text.
 */

export const E1_PROGRAMS = ['E1.1', 'E1.2', 'E1.3', 'E1.4'] as const
export type E1Program = (typeof E1_PROGRAMS)[number]

export type RoleVariant = {
  role_class: string
  subject_variants: string[]
  copy_variants: string[]
  required_role_evidence: string
}

export type ParsedStep = {
  program: E1Program
  sequence: string // e.g. ICS_RFQ_RECEIPT_FIRST_RESPONSE
  step: number
  step_code: string // e.g. ACK_PERSISTED_RFQ
  type: 'EMAIL' | 'TASK'
  timing: string
  approval: string // 'REQUIRED' | 'See JSON' (as written in the source)
  subject_variants: string[]
  copy_variants: string[]
  role_copy_variants: RoleVariant[] // E1.4 role-classed copy (JSON blocks in the source)
  placeholders: string[] // "Required Crm Placeholders"
  evidence_fields: string[]
  stop_conditions: string[]
  pause_conditions: string[]
  reply_handling: string
  task_creation: string
  ai_skeleton: string
  merge_fields: string[] // {{names}} actually used in subject/copy variants, sorted
  source_line: number // 1-based line of the `###` heading
  source_hash: string // sha256 of the exact source block (heading through last line before the next heading)
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

/** Bullet lines under a heading: each `- text` line is one item; wrapped text is joined only if the source wraps it. */
function bullets(block: string): string[] {
  return block
    .split(/\r?\n/)
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
}

export function parseE1(source: string): ParsedStep[] {
  const lines = source.split(/\r?\n/)
  const out: ParsedStep[] = []
  let program: E1Program | null = null
  const steps: number[] = []
  lines.forEach((l, i) => {
    if (/^### \S+ \/ \d+ \/ \S+\s*$/.test(l)) steps.push(i)
  })
  // Walk the program headings in order so each step knows its program.
  let ptr = 0
  for (const idx of steps) {
    for (let i = ptr; i < idx; i++) {
      const p = /^## ICS_EMAIL_REVENUE_(E1_[1-4])_/.exec(lines[i]!)
      if (p) program = p[1]!.replace('_', '.') as E1Program
    }
    ptr = idx
    const end = (() => {
      for (let i = idx + 1; i < lines.length; i++) if (/^#{2,3} /.test(lines[i]!)) return i
      return lines.length
    })()
    const blockLines = lines.slice(idx, end)
    const block = blockLines.join('\n')
    const m = /^### (\S+) \/ (\d+) \/ (\S+)\s*$/.exec(lines[idx]!)!
    if (!program) throw new Error(`E1 parse: step at line ${idx + 1} has no program`)
    const field = (name: string): string =>
      new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.*?)\\s*$`, 'm').exec(block)?.[1] ?? ''
    const section = (name: string): string => {
      const mm = new RegExp(
        `^\\*\\*${name}\\*\\*\\s*\\n([\\s\\S]*?)(?=^\\*\\*[A-Za-z ]+\\*\\*\\s*$|(?![\\s\\S]))`,
        'm',
      ).exec(block)
      return mm ? mm[1]! : ''
    }
    const type = field('Type')
    if (type !== 'EMAIL' && type !== 'TASK')
      throw new Error(`E1 parse: ${m[1]}/${m[2]} has unknown type "${type}"`)
    const subject_variants = bullets(section('Subject Variants'))
    const copy_variants = bullets(section('Copy Variants'))
    const role_copy_variants: RoleVariant[] = [
      ...section('Role Copy Variants').matchAll(/```json\s*\n([\s\S]*?)\n```/g),
    ].map((j) => {
      const o = JSON.parse(j[1]!) as Partial<RoleVariant>
      return {
        role_class: String(o.role_class ?? ''),
        subject_variants: o.subject_variants ?? [],
        copy_variants: o.copy_variants ?? [],
        required_role_evidence: String(o.required_role_evidence ?? ''),
      }
    })
    const used = new Set<string>()
    for (const t of [
      ...subject_variants,
      ...copy_variants,
      ...role_copy_variants.flatMap((r) => [...r.subject_variants, ...r.copy_variants]),
    ])
      for (const f of t.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) used.add(f[1]!)
    out.push({
      program,
      sequence: m[1]!,
      step: Number(m[2]),
      step_code: m[3]!,
      type,
      timing: field('Timing'),
      approval: field('Approval'),
      subject_variants,
      copy_variants,
      role_copy_variants,
      placeholders: bullets(section('Required Crm Placeholders')),
      evidence_fields: bullets(section('Required Evidence Fields')),
      stop_conditions: bullets(section('Stop Conditions')),
      pause_conditions: bullets(section('Pause Conditions')),
      reply_handling: section('Reply Handling').trim(),
      task_creation: section('Task Creation').trim(),
      ai_skeleton: section('Ai Skeleton').trim(),
      merge_fields: [...used].sort(),
      source_line: idx + 1,
      source_hash: sha256(block),
    })
  }
  return out
}

/** Sentence-case label for a sequence code (DD: the ALL_CAPS code is secondary text, not the row title). */
export function sequenceLabel(code: string): string {
  const words = code
    .replace(/^ICS_(E1_4_)?/, '')
    .toLowerCase()
    .split('_')
    .map((w) => (w === 'rfq' ? 'RFQ' : w))
  const s = words.join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
