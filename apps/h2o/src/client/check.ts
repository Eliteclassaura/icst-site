/* GENERATED from tools/client-kit/src/check.ts by tools/client-kit/bin/sync-app.ts. Do not edit: change the source and re-run. */
/**
 * KIT-0 tiny validator: no dependencies, erasable TypeScript only (runs under `node` type stripping).
 * Every helper pushes `{ path, message }` issues instead of throwing, so one run reports everything that is wrong.
 */
export type Issue = { path: string; message: string }

export class Checker {
  readonly issues: Issue[] = []
  fail(path: string, message: string): void {
    this.issues.push({ path, message })
  }
  obj(v: unknown, path: string, allowed: readonly string[], required: readonly string[] = allowed): Record<string, unknown> | null {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      this.fail(path, 'must be an object')
      return null
    }
    const o = v as Record<string, unknown>
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.fail(`${path}.${k}`, 'is not a known field')
    for (const k of required) if (!(k in o)) this.fail(`${path}.${k}`, 'is required')
    return o
  }
  str(v: unknown, path: string, opts: { min?: number; max?: number; pattern?: RegExp; what?: string } = {}): string | null {
    if (typeof v !== 'string') {
      this.fail(path, 'must be a string')
      return null
    }
    const s = v.trim()
    if (s.length < (opts.min ?? 1)) this.fail(path, 'must not be empty')
    if (v.length > (opts.max ?? 500)) this.fail(path, `must be at most ${opts.max ?? 500} characters`)
    if (opts.pattern && !opts.pattern.test(v)) this.fail(path, `must be ${opts.what ?? `like ${opts.pattern}`}`)
    return v
  }
  oneOf<T extends string>(v: unknown, path: string, values: readonly T[]): T | null {
    if (typeof v === 'string' && (values as readonly string[]).includes(v)) return v as T
    this.fail(path, `must be one of ${values.join(', ')}`)
    return null
  }
  bool(v: unknown, path: string): boolean | null {
    if (typeof v === 'boolean') return v
    this.fail(path, 'must be true or false')
    return null
  }
  arr(v: unknown, path: string, opts: { min?: number; max?: number } = {}): unknown[] {
    if (!Array.isArray(v)) {
      this.fail(path, 'must be a list')
      return []
    }
    if (v.length < (opts.min ?? 0)) this.fail(path, `must have at least ${opts.min} item(s)`)
    if (v.length > (opts.max ?? 200)) this.fail(path, `must have at most ${opts.max ?? 200} items`)
    return v
  }
  unique(values: string[], path: string): void {
    const seen = new Set<string>()
    for (const v of values) {
      if (seen.has(v)) this.fail(path, `has a duplicate: ${v}`)
      seen.add(v)
    }
  }
}
