/**
 * Residue and secret scan (ADR-001, ADR-018, risks R1/R2).
 *
 * Fails when any file OUTSIDE the allow-listed reference paths contains:
 *  - the compromised legacy admin key (matched by SHA-256 so the literal never appears here),
 *  - any host from the confidential proxy allowlist (loaded at scan time from the legacy file and
 *    hashed per host — the hosts themselves are never written into this package or its output),
 *  - a committed .env file, or a `.env` inside a built bundle (Next standalone copies it),
 *  - generic secret shapes: private-key blocks, AWS/Google/GitHub/Slack/Stripe/Anthropic/OpenAI
 *    tokens, or a `*_SECRET= / *_PASSWORD= / *_TOKEN= / *_API_KEY=` assignment with a real-looking value.
 * Client-residue words (brand names, domains) are supplied by the caller for create-site scans.
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import fg from 'fast-glob'

export type Finding = { file: string; line: number; rule: string; detail: string }

export type ScanOptions = {
  root: string
  /** Paths (relative to root) whose contents are reference material and are skipped. */
  referencePaths?: string[]
  /** Extra literal strings that must not appear (e.g. a client's brand words when scanning a starter). */
  forbiddenLiterals?: string[]
  /** Legacy proxy allowlist file, relative to root; hosts are hashed, never echoed. */
  legacyAllowlistFile?: string
  /** Extra key hashes to treat as the compromised key (tests plant a fake one). */
  keyHashes?: Set<string>
  maxFileBytes?: number
}

/** sha256 of the compromised key that was at legacy-reference subscribers.php:20 / diagnose.php:20 (literal redacted in this copy — ADR-027). */
export const LEGACY_KEY_SHA256 = '1baadc53e62c18f5b7d6fe7fef945a7427d015c54297ea2625b8bc0b75672cf5'
const KEY_SHAPE = /\b[0-9a-f]{18}\b/g
const HOST_SHAPE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi

const PLACEHOLDER =
  /^(?:\$\{|<|os\.environ|process\.env|getenv\(|env\(|\$[A-Z_]|your[-_ ]|change[-_ ]?me|placeholder|generate-|build-time|example|xxx|\*|replace|dummy|test-|c0-spike|s3rver|minioadmin|postgres$)/i

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['stripe-live-key', /\bsk_live_[0-9a-zA-Z]{20,}\b/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['openai-key', /\bsk-(?:proj-)?[A-Za-z0-9]{40,}\b/],
]
const ENV_ASSIGN =
  /^\s*(?:export\s+)?([A-Z0-9_]*(?:SECRET|PASSWORD|PASS|TOKEN|API_KEY|PRIVATE_KEY))\s*=\s*['"]?([^\s'"#]+)/i

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/pnpm-lock.yaml',
  '**/*.{png,jpg,jpeg,webp,gif,woff2,woff,ico,pdf,zip}',
]

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** Domains the owner controls; they are the pilot brand and legitimately appear everywhere. */
export const OWNER_DOMAINS = ['syed.ai', 'websitecontentstrategy.com']
const FILE_EXT_TLDS = new Set([
  'php',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'json',
  'html',
  'htm',
  'txt',
  'md',
  'css',
  'xml',
  'svg',
  'png',
  'jpg',
  'webp',
  'yaml',
  'yml',
  'env',
  'log',
  'sh',
])

/**
 * Hashes of the legacy proxy allowlist. Prefers the committed `allowlist.sha256.json` beside the
 * proxy file (the literals were redacted before the first push — ADR-027); falls back to parsing a
 * pristine `proxy.php` when one is present locally. Hosts are hashed, never echoed.
 */
export function loadLegacyHostHashes(file: string, ownDomains: string[] = OWNER_DOMAINS): Set<string> {
  const hashFile = file.replace(/[^/\\]+$/, 'allowlist.sha256.json')
  if (existsSync(hashFile)) {
    const j = JSON.parse(readFileSync(hashFile, 'utf8')) as { sha256?: string[] }
    return new Set((j.sha256 ?? []).filter((h) => /^[0-9a-f]{64}$/.test(h)))
  }
  if (!existsSync(file)) return new Set()
  const src = readFileSync(file, 'utf8')
  const hosts = new Set<string>()
  for (const m of src.matchAll(/['"]([a-z0-9.-]+\.[a-z]{2,})['"]/gi)) {
    const h = m[1]!.toLowerCase()
    if (FILE_EXT_TLDS.has(h.split('.').pop()!)) continue
    if (ownDomains.some((d) => h === d || h.endsWith('.' + d))) continue
    hosts.add(h)
  }
  return new Set([...hosts].map(sha256))
}

function isUnder(root: string, file: string, dirs: string[]): boolean {
  const rel = relative(root, file).split(sep).join('/')
  return dirs.some((d) => rel === d || rel.startsWith(d.replace(/\/$/, '') + '/'))
}

export function scanText(
  text: string,
  file: string,
  ctx: { hostHashes: Set<string>; forbidden: string[]; keyHashes?: Set<string> },
): Finding[] {
  const keyHashes = ctx.keyHashes ?? new Set([LEGACY_KEY_SHA256])
  const out: Finding[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    const ln = i + 1
    for (const m of line.matchAll(KEY_SHAPE)) {
      if (keyHashes.has(sha256(m[0])))
        out.push({ file, line: ln, rule: 'legacy-admin-key', detail: 'compromised legacy admin key present' })
    }
    if (ctx.hostHashes.size) {
      for (const m of line.matchAll(HOST_SHAPE)) {
        if (ctx.hostHashes.has(sha256(m[0].toLowerCase())))
          out.push({
            file,
            line: ln,
            rule: 'legacy-allowlist-host',
            detail: 'confidential client host from proxy allowlist',
          })
      }
    }
    for (const lit of ctx.forbidden) {
      if (lit && line.toLowerCase().includes(lit.toLowerCase()))
        out.push({ file, line: ln, rule: 'forbidden-literal', detail: `contains "${lit}"` })
    }
    for (const [rule, re] of SECRET_PATTERNS) {
      if (re.test(line)) out.push({ file, line: ln, rule, detail: line.trim().slice(0, 80) })
    }
    const env = line.match(ENV_ASSIGN)
    if (env && env[2]!.length >= 12 && !PLACEHOLDER.test(env[2]!)) {
      out.push({
        file,
        line: ln,
        rule: 'env-secret-assignment',
        detail: `${env[1]}=<redacted ${env[2]!.length} chars>`,
      })
    }
  })
  return out
}

/** Convert simple .gitignore lines to fast-glob ignore patterns (negations are not supported and skipped). */
export function gitignoreToGlobs(text: string): string[] {
  const out: string[] = []
  for (let line of text.split(/\r?\n/)) {
    line = line.trim()
    if (!line || line.startsWith('#') || line.startsWith('!')) continue
    const anchored = line.startsWith('/')
    line = line.replace(/^\//, '')
    const dir = line.endsWith('/')
    line = line.replace(/\/$/, '')
    const base = anchored ? line : `**/${line}`
    out.push(dir ? `${base}/**` : base, dir ? base : `${base}/**`)
  }
  return out
}

export async function scan(opts: ScanOptions): Promise<Finding[]> {
  const root = resolve(opts.root)
  // Respect the root .gitignore: local, uncommitted files (e.g. a developer's .env) are not findings.
  // A committed .env, or one copied into a build bundle scanned explicitly, still is.
  const giPath = resolve(root, '.gitignore')
  const gitignored = existsSync(giPath) ? gitignoreToGlobs(readFileSync(giPath, 'utf8')) : []
  const referencePaths = opts.referencePaths ?? [
    'legacy-reference',
    'docs/discovery',
    'docs/baselines',
    'docs/reference-buildroadmap-other-project.html',
  ]
  const hostHashes = loadLegacyHostHashes(
    resolve(
      root,
      opts.legacyAllowlistFile ?? 'legacy-reference/search-evidence-suite/search-evidence-console/proxy.php',
    ),
  )
  const forbidden = opts.forbiddenLiterals ?? []
  const maxBytes = opts.maxFileBytes ?? 2_000_000
  const files = await fg(['**/*'], {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: [...DEFAULT_IGNORE, ...gitignored],
    absolute: true,
    followSymbolicLinks: false,
  })
  const findings: Finding[] = []
  for (const f of files) {
    const rel = relative(root, f).split(sep).join('/')
    if (isUnder(root, f, referencePaths)) continue
    const base = rel.split('/').pop()!
    if (/^\.env(\..+)?$/.test(base) && !/\.example$/.test(base)) {
      const inBundle = rel.includes('/.next/') || rel.includes('/standalone/') || rel.includes('/dist/')
      findings.push({
        file: rel,
        line: 0,
        rule: 'env-file-present',
        detail: inBundle ? '.env inside a build bundle' : 'env file must not be committed or shipped',
      })
    }
    if (statSync(f).size > maxBytes) continue
    let text: string
    try {
      text = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\u0000')) continue // binary
    findings.push(...scanText(text, rel, { hostHashes, forbidden, keyHashes: opts.keyHashes }))
  }
  return findings
}
