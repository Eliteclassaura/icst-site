/**
 * HOME-RENDER-1: the published ledger's rows by decoded path, built once per ledger array (a generation, in payload mode).
 * Callers used to resolve every link with `routes.find(r => decodeURIComponent(r.path) === target)`: a linear scan with a decode on
 * each row, run for each of a page's several hundred links. First match wins, as `find` did. A ledger holding a path that does not
 * decode (none does) has no table (`null`): the caller then runs its original scan, byte for byte.
 */
const tables = new WeakMap<object, Map<string, unknown> | null>()
export function routeTable<T extends { path: string }>(routes: T[]): Map<string, T> | null {
  let table = tables.get(routes)
  if (table === undefined) {
    try {
      const built = new Map<string, T>()
      for (const row of routes) {
        const key = decodeURIComponent(row.path)
        if (!built.has(key)) built.set(key, row)
      }
      table = built
    } catch {
      table = null
    }
    tables.set(routes, table)
  }
  return table as Map<string, T> | null
}
