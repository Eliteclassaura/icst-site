/**
 * Brand markers inside fixtures (ADR-026 §3).
 *
 * Fixtures are shared by every client, so they hold no client's identity: a scalar identity field
 * is written as a `{{brand.*}}` placeholder, and a list-valued one (social links, offices) is
 * written as a marker that the injector expands. Both are resolved at render time by
 * `applyBrand()` in `@factory/design-bundle` — the seed, `/dev/blocks` and `design:bundle` all go
 * through it, so an unresolved marker is a bug the unit tests catch rather than something a
 * client ever sees.
 */
export type BrandListName = 'social' | 'offices'

/**
 * A placeholder element that expands, in place, to the brand's own list. Typed as the element it
 * stands in for so fixtures keep their static types; the cast is the whole point of the helper
 * being here rather than repeated at each call site.
 */
export function brandList<T>(name: BrandListName): T {
  return { $brandList: name } as unknown as T
}
