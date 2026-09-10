/**
 * Asset admission control (C5.5 workstream H).
 *
 * Every byte that enters a bundle, a pack or a design-pull export passes through here. The rule is
 * admission by signature, not by file name: an attacker controls the extension, not the first eight
 * bytes. Anything that is not on the allow-list is refused rather than sanitised, and anything
 * executable — by extension, by mode bit or by shebang — is refused outright, because a design
 * artefact has no reason to be runnable (C5.5 workstream C: no arbitrary code execution).
 */

export type AssetKind =
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'avif'
  | 'svg'
  | 'woff2'
  | 'woff'
  | 'ttf'
  | 'otf'
  | 'pdf'
  | 'text'
  | 'unknown'

export type AssetFinding = { rule: string; detail: string }

export type AssetVerdict = {
  ok: boolean
  kind: AssetKind
  bytes: number
  findings: AssetFinding[]
}

/** Extensions that are executable, or that a host will happily execute if it ever serves them. */
export const EXECUTABLE_EXTENSIONS = [
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.py',
  '.rb',
  '.pl',
  '.php',
  '.php5',
  '.phtml',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bat',
  '.cmd',
  '.com',
  '.ps1',
  '.psm1',
  '.jar',
  '.class',
  '.wasm',
  '.scpt',
  '.applescript',
  '.vbs',
  '.jse',
  '.wsf',
  '.lnk',
  '.desktop',
  '.htaccess',
  '.dockerfile',
] as const

const SIGNATURES: Array<[AssetKind, (b: Buffer) => boolean]> = [
  [
    'png',
    (b) =>
      b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ],
  ['jpeg', (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  [
    'gif',
    (b) =>
      b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a',
  ],
  [
    'webp',
    (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  ],
  [
    'avif',
    (b) =>
      b.length > 12 &&
      b.subarray(4, 8).toString('latin1') === 'ftyp' &&
      /avif|avis/.test(b.subarray(8, 12).toString('latin1')),
  ],
  ['woff2', (b) => b.subarray(0, 4).toString('latin1') === 'wOF2'],
  ['woff', (b) => b.subarray(0, 4).toString('latin1') === 'wOFF'],
  ['otf', (b) => b.subarray(0, 4).toString('latin1') === 'OTTO'],
  [
    'ttf',
    (b) =>
      b.length > 4 &&
      ((b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) ||
        b.subarray(0, 4).toString('latin1') === 'true'),
  ],
  ['pdf', (b) => b.subarray(0, 5).toString('latin1') === '%PDF-'],
]

const MIME: Record<AssetKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pdf: 'application/pdf',
  text: 'text/plain',
  unknown: 'application/octet-stream',
}

export function mimeFor(kind: AssetKind): string {
  return MIME[kind]
}

/** Kind from content only. The declared name is never consulted. */
export function sniffKind(buf: Buffer): AssetKind {
  for (const [kind, test] of SIGNATURES) if (test(buf)) return kind
  const head = buf.subarray(0, 512).toString('utf8')
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'svg'
  if (!buf.includes(0)) return 'text'
  return 'unknown'
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

export function isExecutableName(name: string): boolean {
  const base = name.split('/').pop() ?? name
  if (base.startsWith('.') && EXECUTABLE_EXTENSIONS.includes(base as (typeof EXECUTABLE_EXTENSIONS)[number]))
    return true
  return EXECUTABLE_EXTENSIONS.includes(extensionOf(base) as (typeof EXECUTABLE_EXTENSIONS)[number])
}

export function hasShebang(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0x23 && buf[1] === 0x21
}

export type AssetPolicy = {
  /** Kinds admitted; anything else is refused. */
  allow: readonly AssetKind[]
  maxBytes: number
  /** Unix mode, when the source has one (archive entry or filesystem). */
  mode?: number
}

export const IMAGE_POLICY: AssetPolicy = {
  allow: ['png', 'jpeg', 'webp', 'avif', 'gif', 'svg'],
  maxBytes: 4_000_000,
}
export const FONT_POLICY: AssetPolicy = { allow: ['woff2', 'woff'], maxBytes: 1_500_000 }
export const TEXT_POLICY: AssetPolicy = { allow: ['text'], maxBytes: 2_000_000 }

/**
 * Admit or refuse one asset. `name` is only used for the executable check and the
 * signature/extension agreement check — never to decide the kind.
 */
export function inspectAsset(name: string, buf: Buffer, policy: AssetPolicy): AssetVerdict {
  const findings: AssetFinding[] = []
  const kind = sniffKind(buf)

  if (buf.length > policy.maxBytes)
    findings.push({ rule: 'asset-too-large', detail: `${buf.length} bytes exceeds ${policy.maxBytes}` })
  if (buf.length === 0) findings.push({ rule: 'asset-empty', detail: 'zero-length asset' })
  if (isExecutableName(name))
    findings.push({ rule: 'executable-asset', detail: `executable extension ${extensionOf(name) || name}` })
  if (hasShebang(buf)) findings.push({ rule: 'executable-asset', detail: 'file begins with a shebang' })
  if (policy.mode !== undefined && (policy.mode & 0o111) !== 0)
    findings.push({
      rule: 'executable-asset',
      detail: `mode ${(policy.mode & 0o7777).toString(8)} sets an execute bit`,
    })
  if (!policy.allow.includes(kind))
    findings.push({
      rule: 'asset-kind-refused',
      detail: `signature says ${kind}; allowed: ${policy.allow.join(', ')}`,
    })

  // Signature/extension disagreement is reported even when both are individually allowed: it is the
  // classic "logo.png that is really an HTML document" and a reviewer should see it.
  const ext = extensionOf(name).replace('.', '')
  const expected: Record<string, AssetKind> = {
    jpg: 'jpeg',
    jpeg: 'jpeg',
    png: 'png',
    gif: 'gif',
    webp: 'webp',
    avif: 'avif',
    svg: 'svg',
    woff2: 'woff2',
    woff: 'woff',
    ttf: 'ttf',
    otf: 'otf',
    pdf: 'pdf',
  }
  if (ext in expected && expected[ext] !== kind)
    findings.push({
      rule: 'asset-extension-mismatch',
      detail: `${name} declares .${ext} but the signature says ${kind}`,
    })

  return { ok: findings.length === 0, kind, bytes: buf.length, findings }
}
