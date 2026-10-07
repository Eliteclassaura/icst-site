import type { CollectionBeforeValidateHook, Field } from 'payload'

type Doc = Record<string, unknown>
type AnyField = Field & { name?: string; type: string; access?: { update?: unknown }; fields?: Field[]; tabs?: Array<{ name?: string; fields: Field[] }> }

/**
 * RESTORE-1 (CT ruling 2026-10-07): a version restore restores editable content only.
 *
 * Payload 3.90.2 `restoreVersion` runs field `beforeValidate` over the restored version with
 * `req.context.isRestoringVersion` set. Every field with a field-level `update` rule that denies the user is deleted from the
 * data, and the usual refill from the stored document is skipped while restoring; a named group then comes back as `{}`.
 * Field `beforeChange` returns that data unmerged, and the operation writes it to the main row and the new version. So an
 * editor's restore blanked admin-owned values (and was refused by the public-routes guard, which saw an empty
 * `disposition`), every restore dropped `update: () => false` fields such as `document`, and an admin's restore brought back
 * the old version's admin values.
 *
 * This collection `beforeValidate` hook runs after the field pass, on the restore path only, and sets every field that has a
 * field-level `update` rule to its CURRENT stored value (`originalDoc`), for every user. Disposition, URL, provenance, price
 * and truth-state changes stay separately reviewed writes; the restore carries the editable content.
 */
export function restoreKeepsCurrent(fieldsOf: () => Field[]): CollectionBeforeValidateHook {
  return ({ context, data, originalDoc }) => {
    if (!(context as Doc | undefined)?.isRestoringVersion || !data || !originalDoc) return data
    keepCurrent(fieldsOf() as AnyField[], data as Doc, originalDoc as Doc)
    return data
  }
}

const copy = <T>(v: T): T => (v === undefined || v === null ? v : structuredClone(v))

/** Exported for the unit test: walks named groups and unnamed containers (rows, collapsibles, unnamed tabs). */
export function keepCurrent(fields: AnyField[], data: Doc, current: Doc): void {
  for (const f of fields) {
    if (f.type === 'tabs' && Array.isArray(f.tabs)) {
      for (const t of f.tabs) {
        if (t.name) keepCurrent([{ type: 'group', name: t.name, fields: t.fields } as AnyField], data, current)
        else keepCurrent(t.fields as AnyField[], data, current)
      }
      continue
    }
    if (!f.name) {
      if (Array.isArray(f.fields)) keepCurrent(f.fields as AnyField[], data, current)
      continue
    }
    if (f.access?.update) {
      const value = current[f.name]
      if (value === undefined) delete data[f.name]
      else data[f.name] = copy(value)
      continue
    }
    if (f.type === 'group' && Array.isArray(f.fields)) {
      const group = data[f.name]
      const target = group && typeof group === 'object' && !Array.isArray(group) ? (group as Doc) : (data[f.name] = {} as Doc)
      keepCurrent(f.fields as AnyField[], target, ((current[f.name] ?? {}) as Doc))
    }
  }
}
