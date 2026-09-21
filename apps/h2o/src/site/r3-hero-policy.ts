/**
 * H2O R3 — presentation policy for the 24 frozen HERO placements.
 *
 * WHAT THIS IS NOT: it is not a change to `MEDIA_PLACEMENT_AUTHORITY.tsv`. Every frozen placement is
 * still loaded and still hash-verified by `media.ts`. No row is edited, removed or repointed, and
 * no binary is touched. This module decides only whether a placement is *presented* as the route's
 * hero, which is a presentation-layer decision of exactly the kind the accepted media overlay's own
 * crop policy already establishes ("a crop is applied at render time; the binary on disk remains
 * the recovered original at its recorded sha256").
 *
 * WHY IT EXISTS: rendered QA of all 24 frozen heroes as a contact sheet showed that 22 of them are
 * not photographs at all. They are branded editorial title cards — an ICS logo plate, a headline
 * that restates the route's own H1, decorative geometry, and in most cases a bar containing the
 * production domain rendered into the pixels. Presented at hero scale they produce three defects at
 * once:
 *
 *   1. a production URL on a public surface, which the repository rules forbid outright;
 *   2. a duplicated logo and a duplicated headline directly beneath the real ones;
 *   3. the "converted PDF / content farm" reading that R3 exists to remove.
 *
 * This is the MEDIA_INPUT finding the R2.2 Visual Director pass recorded and held: the frozen
 * placements carry no crop column, so a branded card can only render full-frame. R3 is the pass
 * authorised to act on it.
 *
 * WHAT IT DOES: a route listed here renders the R3 typographic masthead instead of the card. The
 * suppression is per-route, reviewable, and derived from direct visual review of each asset — not
 * from a filename heuristic, and not from a guess about content. Two routes carry genuine
 * photographs and are deliberately NOT suppressed.
 *
 * A crop window cannot be substituted here: choosing 22 crop rectangles is a per-image judgment
 * that needs the selected originals from the parallel Visual + Media extraction lane. When those
 * arrive, a bounded media completion pass can replace suppression with real crops, and this module
 * is the single place that decision lives.
 */

/** Frozen HERO placements whose asset is a branded editorial card, by direct visual review. */
export const BRANDED_CARD_HERO_ROUTES: ReadonlySet<string> = new Set([
  'RT-0241',
  'RT-0275',
  'RT-0292',
  'RT-0303',
  'RT-0314',
  'RT-0318',
  'RT-0321',
  'RT-0325',
  'RT-0335',
  'RT-0350',
  'RT-0356',
  'RT-0358',
  'RT-0360',
  'RT-0361',
  'RT-0400',
  'RT-0403',
  'RT-0426',
  'RT-0480',
  'RT-0495',
  'RT-0732',
  'RT-1203',
  'RT-1236',
])

/**
 * Frozen HERO placements kept: reviewed and found to be photographs rather than title cards.
 * RT-0004 is a plain photograph of cooling towers; RT-1245 is a tower louvre face.
 */
export const PHOTOGRAPHIC_HERO_ROUTES: ReadonlySet<string> = new Set(['RT-0004', 'RT-1245'])

export const heroIsPresentable = (routeId: string): boolean =>
  !BRANDED_CARD_HERO_ROUTES.has(routeId)

export type HeroPolicyRow = {
  decision: 'PRESENT' | 'SUPPRESS_BRANDED_EDITORIAL_CARD'
  reason: string
  routeId: string
}

/** The policy as data, for the R3 media-use ledger. */
export const heroPolicyRows = (): HeroPolicyRow[] => [
  ...[...BRANDED_CARD_HERO_ROUTES].sort().map((routeId) => ({
    decision: 'SUPPRESS_BRANDED_EDITORIAL_CARD' as const,
    reason:
      'Branded editorial title card: logo plate, headline duplicating the route H1, and in most cases a production domain rendered into the pixels. Placement row preserved and hash-verified; presentation suppressed pending a real crop window from the Visual + Media extraction lane.',
    routeId,
  })),
  ...[...PHOTOGRAPHIC_HERO_ROUTES].sort().map((routeId) => ({
    decision: 'PRESENT' as const,
    reason: 'Reviewed and found to be a photograph rather than a branded card. Presented unchanged.',
    routeId,
  })),
]
