/**
 * Publication lifecycle read-back (R1 residual, Control Tower 2026-10-05).
 *
 * Payload drafts: an admin read with `draft=false` returns the MAIN row whatever its `_status`. A withdrawn page therefore
 * still comes back from that read, with `_status: 'draft'`. R1 counted "a document came back" as "still published", so all
 * 17 withdrawals were reported as failures, including the 13 whose PATCH (200) had in fact unpublished them (the
 * bridge/r1b DB tests prove `PATCH {_status:'draft'}` revokes the page). The proof is now explicit on both sides.
 */
/** The main row is published as decided: published, PUBLIC, and the decided indexability. */
export const publishedAsDecided = (main, want) => Boolean(main) && main._status === 'published' && main.disposition?.state === 'PUBLIC' && main.disposition?.indexable === want.indexable
/**
 * Withdrawn as decided: the main row is unpublished (`draft`) and carries the decided REDIRECT disposition, and a
 * published-only query for the path returns nothing (`publishedDocs`: the docs of `where[_status][equals]=published`).
 */
export const withdrawnAsDecided = (main, publishedDocs, want) =>
  Boolean(main) && main._status === 'draft' && main.disposition?.state === want.state && (main.disposition?.redirect ?? null) === (want.redirect ?? null) && (publishedDocs ?? []).length === 0
