import type { IntakeHeroProps } from './IntakeHero'
import type { IntakeSplitProps } from './IntakeSplit'

/**
 * The client page's layout rows are rendered by the block library, except `contactHero` rows (the Contact hero: photo, scrim, centred title) and `intakeForm` rows: the native quote form's own section (the
 * intake engine beside the contact card), which this app renders. This splits a layout at those rows, in order, so nothing is dropped
 * or reordered. Pure.
 */
type Row = { blockType?: string } & Record<string, unknown>
export type Segment<R extends Row = Row> = { kind: 'blocks'; layout: R[] } | { kind: 'intake'; props: IntakeSplitProps } | { kind: 'hero'; props: IntakeHeroProps }

export function segments<R extends Row>(layout: readonly R[] | null | undefined): Array<Segment<R>> {
  const out: Array<Segment<R>> = []
  let run: R[] = []
  for (const b of layout ?? []) {
    if (b.blockType === 'contactHero') {
      if (run.length) out.push({ kind: 'blocks', layout: run })
      run = []
      const p = b as unknown as IntakeHeroProps
      out.push({ kind: 'hero', props: { eyebrow: p.eyebrow, title: String(p.title ?? ''), image: p.image } })
    } else if (b.blockType === 'intakeForm') {
      if (run.length) out.push({ kind: 'blocks', layout: run })
      run = []
      const p = b as unknown as IntakeSplitProps
      out.push({ kind: 'intake', props: { title: String(p.title ?? ''), lede: p.lede, asideTitle: String(p.asideTitle ?? ''), hotlineLabel: String(p.hotlineLabel ?? ''), officeLabel: String(p.officeLabel ?? '') } })
    } else run.push(b)
  }
  if (run.length) out.push({ kind: 'blocks', layout: run })
  return out
}
