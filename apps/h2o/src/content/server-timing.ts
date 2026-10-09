import { cache } from 'react'
import type { Metadata } from 'next'

/**
 * SPEED-1: durations of the page read (database, composition) for private review.
 *
 * A Next page cannot set response headers, so the durations travel in the document head as `<meta name="h2o-server-timing">` whose content
 * uses the Server-Timing syntax (`db;dur=12.3, compose;dur=1.1`). They are emitted only when H2O_INDEXING_POLICY is not "production"
 * (staging and private review); the production origin never carries them. Durations only: no path, id, query or content.
 */
export const serverTimingEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.H2O_INDEXING_POLICY !== 'production'

export class Timings {
  private readonly ms = new Map<string, number>()
  add(name: string, ms: number): void {
    this.ms.set(name, (this.ms.get(name) ?? 0) + ms)
  }
  /** `name;dur=ms` entries in the order first recorded, or undefined when nothing was recorded. */
  value(): string | undefined {
    if (!this.ms.size) return undefined
    return [...this.ms].map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`).join(', ')
  }
}

/** One collector per server render. */
export const requestTimings = cache((): Timings => new Timings())

/** Time `fn` into the request's collector (a plain call when timing is off). */
export async function timed<T>(name: string, fn: () => Promise<T> | T, timings: Timings = requestTimings(), env: NodeJS.ProcessEnv = process.env): Promise<T> {
  if (!serverTimingEnabled(env)) return fn()
  const start = performance.now()
  try {
    return await fn()
  } finally {
    timings.add(name, performance.now() - start)
  }
}

/** The page metadata with the durations added as a `h2o-server-timing` meta tag; unchanged in production or when nothing was timed. */
export function withServerTiming(metadata: Metadata, timings: Timings = requestTimings(), env: NodeJS.ProcessEnv = process.env): Metadata {
  if (!serverTimingEnabled(env)) return metadata
  const value = timings.value()
  if (!value) return metadata
  return { ...metadata, other: { ...(metadata.other ?? {}), 'h2o-server-timing': value } }
}
