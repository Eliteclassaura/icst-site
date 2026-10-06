/**
 * R3.4 (Control Tower 2026-10-05, owner request): site-verification files served at the site root, configured at RUNTIME so
 * a new token needs no rebuild. Semrush ("bypass website restrictions"), Google, Bing and Yandex verify ownership with a file
 * they issue; staging stays closed to indexing (robots.txt `Disallow: /`, noindex everywhere).
 *
 *   H2O_VERIFICATION_FILES='{"semrush-xxxx.html":"semrush-site-verification: …","google123.html":"google-site-verification: google123.html"}'
 *
 * Rules: a name is one root filename, `^[A-Za-z0-9._-]{1,128}\.(html|txt)$`, with no path separator and not starting with a dot;
 * a body is text of at most 1 KB. An invalid entry (or invalid JSON) is ignored and logged with its position and reason only,
 * never its name or body. The proxy serves an entry only where no route, redirect or public file already answers.
 */
const NAME = /^[A-Za-z0-9._-]{1,128}\.(html|txt)$/
const MAX_BODY_BYTES = 1024

export type VerificationFile = { body: string; contentType: string }

let cachedRaw: string | undefined
let cached: ReadonlyMap<string, VerificationFile> = new Map()

/** The valid entries of a raw H2O_VERIFICATION_FILES value (exported for tests); `warn` receives position and reason only. */
export function parseVerificationFiles(raw: string | undefined, warn: (message: string) => void = (m) => console.warn(m)): ReadonlyMap<string, VerificationFile> {
  const out = new Map<string, VerificationFile>()
  if (!raw || !raw.trim()) return out
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    warn('[h2o] H2O_VERIFICATION_FILES is not valid JSON; no verification file is served')
    return out
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    warn('[h2o] H2O_VERIFICATION_FILES must be a JSON object of filename to body; no verification file is served')
    return out
  }
  Object.entries(data as Record<string, unknown>).forEach(([name, body], i) => {
    const reason = !NAME.test(name) || name.startsWith('.') ? 'filename is not a root .html/.txt name'
      : typeof body !== 'string' ? 'body is not text'
      : Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES ? 'body is over 1 KB'
      : null
    if (reason) { warn(`[h2o] H2O_VERIFICATION_FILES entry ${i + 1} ignored: ${reason}`); return }
    out.set(name, { body: body as string, contentType: name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' })
  })
  return out
}

/** The verification file for a request path (`/name` exactly), read from the environment at request time; else null. */
export function verificationFileFor(pathname: string, env: NodeJS.ProcessEnv = process.env): VerificationFile | null {
  const raw = env.H2O_VERIFICATION_FILES
  if (raw !== cachedRaw) { cachedRaw = raw; cached = parseVerificationFiles(raw) }
  if (!cached.size || !/^\/[^/]+$/.test(pathname)) return null
  return cached.get(pathname.slice(1)) ?? null
}
