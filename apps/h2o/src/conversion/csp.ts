/**
 * H2O Phase 2C-min — CSP and origin contract.
 *
 * The adapter needs exactly **one** CSP allowance: `frame-src https://form.typeform.com`.
 *
 * That is the whole surface because the adapter does not load Typeform's embed SDK. It renders its
 * own `<iframe>` and handles `postMessage` itself, so no third-party script ever executes in the
 * H2O origin. Nothing is added to `script-src`, nothing to `connect-src`, and the form's own network
 * traffic happens inside its own browsing context, governed by its own policy, not ours. A visitor
 * who never opens the form downloads nothing from Typeform at all.
 *
 * H2O has no security-header layer yet — `apps/syed-ai/src/proxy.ts` is the Factory's established
 * pattern and H2O's equivalent is not part of 2C-min. So this module is the contract plus a
 * merge function that a future header layer calls; it is proved by test here and wired there.
 */

/** Directive additions, exhaustively. One directive, one exact host, no wildcard. */
export const TYPEFORM_CSP_ADDITIONS: Readonly<Record<string, readonly string[]>> = {
  'frame-src': ['https://form.typeform.com'],
}

/** A source expression that would widen a policy beyond a named host. */
const isUnsafeSource = (source: string): boolean =>
  source.includes('*') || source === "'unsafe-inline'" || source === "'unsafe-eval'" || source === 'data:'

export type CspMergeResult =
  | { ok: false; reason: 'ADDITION_UNSAFE'; directive: string; source: string }
  | { ok: true; policy: string }

type Directives = Map<string, string[]>

const parse = (policy: string): Directives => {
  const out: Directives = new Map()
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter((t) => t !== '')
    if (tokens.length === 0) continue
    const [name, ...sources] = tokens
    out.set(name as string, sources)
  }
  return out
}

const serialise = (directives: Directives): string =>
  [...directives.entries()].map(([name, sources]) => [name, ...sources].join(' ')).join('; ')

/**
 * Add the adapter's allowances to an existing policy.
 *
 * It only ever **adds** a source to a directive. It never removes one, never relaxes an existing
 * directive, and never creates a fallback: if the base policy has no `frame-src`, the addition
 * inherits from `default-src` in the base policy's own terms, so the new directive is seeded from
 * `default-src` rather than from nothing — otherwise adding `frame-src` would silently *widen* the
 * policy from `default-src 'self'` to "Typeform only, everything else blocked" in some browsers and
 * "Typeform plus whatever" in others. Seeding keeps the effective policy explicit.
 *
 * An unsafe addition is refused outright rather than sanitised, so a mistake in a future caller
 * surfaces as a failure instead of a quietly weakened header.
 */
export const mergeTypeformCsp = (
  basePolicy: string,
  additions: Readonly<Record<string, readonly string[]>> = TYPEFORM_CSP_ADDITIONS,
): CspMergeResult => {
  const directives = parse(basePolicy)

  for (const [directive, sources] of Object.entries(additions)) {
    for (const source of sources) {
      if (isUnsafeSource(source)) return { directive, ok: false, reason: 'ADDITION_UNSAFE', source }
    }
    const existing = directives.get(directive)
    const seed = existing ?? directives.get('default-src') ?? []
    const merged = [...seed]
    for (const source of sources) if (!merged.includes(source)) merged.push(source)
    directives.set(directive, merged)
  }

  return { ok: true, policy: serialise(directives) }
}

/**
 * The iframe's own sandbox. `allow-same-origin` is required for Typeform to run at all — without it
 * the frame is opaque-origin and its own storage and network calls fail — and it is safe here
 * because the frame's origin is Typeform's, not ours. `allow-top-navigation` is deliberately absent:
 * the embedded document must not be able to navigate the H2O page anywhere.
 */
export const TYPEFORM_IFRAME_SANDBOX = 'allow-forms allow-popups allow-same-origin allow-scripts'

/** Referrer policy for the frame: the form learns the site, never the exact page. */
export const TYPEFORM_IFRAME_REFERRER_POLICY = 'strict-origin'
