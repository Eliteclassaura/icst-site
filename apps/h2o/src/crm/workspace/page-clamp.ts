/**
 * 1.3a-C2: a list asked for a page past its end (an old bookmark, `?page=999`) shows the LAST page. Before, the empty page was
 * read as "no records" and a directory that held records said "No contacts yet". A genuinely empty list (no records at all) and a
 * page inside the range are untouched: the clamp runs only when records exist and the page is beyond the last one.
 */
export type PagedResult = { docs: unknown[]; totalDocs: number; totalPages?: number }

export async function findClamped<T extends PagedResult>(requested: number, run: (page: number) => Promise<T>): Promise<T> {
  const res = await run(requested)
  const last = res.totalPages ?? 1
  if (requested > 1 && res.docs.length === 0 && res.totalDocs > 0 && requested > last) return run(last)
  return res
}
