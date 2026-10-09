import { createHash } from 'node:crypto'
import e1Bundled from './data/source/e1-source-text.json'
import e2Bundled from './data/source/e2-source-text.json'
import seed from './data/library-seed.json'
import { parseE1 } from './parse-e1'

/**
 * EMAIL-LIB-1 provenance. Before the importer writes anything it proves, from the source text shipped with the app, that
 * the seed is what the owner's files say:
 *   - each source file (E1 markdown, E2 drafts, E2 topic bank) still hashes to the value recorded in the seed;
 *   - the E1 text is parsed again, and every step must equal the seed's step: its own block hash (the sha256 of that
 *     step's exact block), its subjects, its copy variants and its role variants;
 *   - every subject, copy and role variant appears verbatim in the E1 text;
 *   - the E2 skeletons are rebuilt from the two E2 files and must equal the seed's (each entry's hash, subject, body).
 * Any difference refuses the import. The bundled text lives next to the seed as JSON, so nothing is read from disk at run time.
 */
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
type Sources = { e1: string; e2Drafts: string; e2Topics: string }
export const BUNDLED_SOURCES: Sources = {
  e1: (e1Bundled as { text: string }).text,
  e2Drafts: (e2Bundled as { drafts: string }).drafts,
  e2Topics: (e2Bundled as { topics: string }).topics,
}
type SeedStep = Record<string, unknown> & { role_copy_variants: Array<{ subject_variants: string[]; copy_variants: string[] }> }
const SEED = seed as unknown as {
  sources: Record<string, string>
  e1: SeedStep[]
  e2: Array<Record<string, unknown>>
}
const E1_FILE = 'E1_EXACT_SEQUENCE_STEPS_AND_COPY.md'
const STEP_FIELDS = ['program', 'sequence', 'step', 'step_code', 'type', 'timing', 'subject_variants', 'copy_variants', 'role_copy_variants', 'source_hash', 'source_line'] as const

/** What is wrong, if anything. Empty = the seed is exactly what the shipped sources say. */
export function provenanceProblems(src: Sources = BUNDLED_SOURCES): string[] {
  const out: string[] = []
  if (sha(src.e1) !== SEED.sources[E1_FILE]) out.push('The E1 source file does not match its recorded hash.')
  if (sha(src.e2Drafts) !== SEED.sources['e2_draft_skeletons.json']) out.push('The E2 drafts file does not match its recorded hash.')
  if (sha(src.e2Topics) !== SEED.sources['e2_topic_bank.json']) out.push('The E2 topic bank does not match its recorded hash.')
  if (out.length) return out
  const parsed = parseE1(src.e1)
  if (parsed.length !== SEED.e1.length) out.push(`The E1 source has ${parsed.length} steps; the seed has ${SEED.e1.length}.`)
  for (const [i, p] of parsed.entries()) {
    const s = SEED.e1[i]
    if (!s) break
    for (const f of STEP_FIELDS)
      if (JSON.stringify((p as unknown as Record<string, unknown>)[f]) !== JSON.stringify(s[f])) {
        out.push(`E1 step ${String(s.sequence)}/${String(s.step)}: ${f} differs from the source.`)
        break
      }
    const strings = [
      ...((s.subject_variants as string[]) ?? []),
      ...((s.copy_variants as string[]) ?? []),
      ...s.role_copy_variants.flatMap((r) => [...r.subject_variants, ...r.copy_variants]),
    ]
    for (const v of strings)
      if (!src.e1.includes(v)) {
        out.push(`E1 step ${String(s.sequence)}/${String(s.step)}: a variant is not in the source text.`)
        break
      }
  }
  try {
    const drafts = (JSON.parse(src.e2Drafts) as { drafts: Array<Record<string, unknown>> }).drafts
    const topics = (JSON.parse(src.e2Topics) as { topics: Array<Record<string, unknown>> }).topics
    if (topics.length !== SEED.e2.length) out.push(`The E2 topic bank has ${topics.length} topics; the seed has ${SEED.e2.length}.`)
    for (const [i, t] of topics.entries()) {
      const d = drafts.find((x) => x.topic_id === t.topic_id)
      const s = SEED.e2[i]
      if (!d || !s) {
        out.push(`E2 topic ${String(t.topic_id)}: no draft in the source.`)
        continue
      }
      const same = s.topic_id === t.topic_id && s.month_slot === t.month_slot && s.title === t.title && s.draft_id === d.draft_id && s.subject === d.subject && s.body === d.body && s.source_hash === sha(JSON.stringify(d))
      if (!same) out.push(`E2 skeleton ${String(t.topic_id)} differs from the source.`)
    }
  } catch {
    out.push('The E2 source files could not be read.')
  }
  return out
}

export function assertProvenance(src: Sources = BUNDLED_SOURCES): void {
  const problems = provenanceProblems(src)
  if (problems.length) throw new Error(`Library source check failed: ${problems[0]} Import refused.`)
}
