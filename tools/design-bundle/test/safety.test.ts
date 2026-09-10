import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertNoSymlink,
  safeJoin,
  safeRelativePath,
  UnsafePathError,
  inspectAsset,
  sniffKind,
  isExecutableName,
  IMAGE_POLICY,
  FONT_POLICY,
  checkMarkup,
  checkCss,
  checkSvg,
  isAllowedUrl,
  decodeSvgDataUrl,
  escapeHtml,
  readZipSafely,
} from '../src/safety/index.ts'

// ── the threat model, one test per named threat ──────────────────────────────────────────────

describe('path safety — traversal, absolute paths, symlinks', () => {
  it('refuses every shape of escape', () => {
    for (const bad of [
      '../etc/passwd',
      'a/../../b',
      '/etc/passwd',
      'C:\\Windows\\system32',
      '\\\\server\\share\\x',
      '//server/share/x',
      'a/\0b',
      '',
      '.',
      'con.txt',
      'nested/../../../out',
    ])
      expect(() => safeRelativePath(bad), bad).toThrow(UnsafePathError)
  })

  it('accepts ordinary member names and normalises them', () => {
    expect(safeRelativePath('components/hero/default-390.html')).toBe('components/hero/default-390.html')
    expect(safeRelativePath('./a/./b.txt')).toBe('a/b.txt')
    expect(safeRelativePath('a\\b.txt')).toBe('a/b.txt')
  })

  it('safeJoin keeps a resolved path under its root', () => {
    const root = mkdtempSync(join(tmpdir(), 'safejoin-'))
    expect(safeJoin(root, 'a/b.txt').startsWith(root)).toBe(true)
    expect(() => safeJoin(root, '../outside.txt')).toThrow(UnsafePathError)
  })

  it('refuses a symlinked segment even when the name itself is innocent', () => {
    const root = mkdtempSync(join(tmpdir(), 'symlink-'))
    const outside = mkdtempSync(join(tmpdir(), 'outside-'))
    writeFileSync(join(outside, 'secret.txt'), 'x')
    mkdirSync(join(root, 'real'))
    symlinkSync(outside, join(root, 'link'))
    expect(() => assertNoSymlink(root, 'link/secret.txt')).toThrow(UnsafePathError)
    expect(() => assertNoSymlink(root, 'real/absent.txt')).not.toThrow()
  })
})

describe('asset admission — signatures, executables, size', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  it('decides the kind from bytes, not from the name', () => {
    expect(sniffKind(png)).toBe('png')
    expect(sniffKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg')
    expect(sniffKind(Buffer.from('wOF2....'))).toBe('woff2')
    expect(sniffKind(Buffer.from('%PDF-1.7'))).toBe('pdf')
  })

  it('reports an HTML document wearing a .png extension', () => {
    const v = inspectAsset('logo.png', Buffer.from('<!doctype html><script>alert(1)</script>'), IMAGE_POLICY)
    expect(v.ok).toBe(false)
    expect(v.findings.map((f) => f.rule)).toContain('asset-kind-refused')
    expect(v.findings.map((f) => f.rule)).toContain('asset-extension-mismatch')
  })

  it('refuses anything executable by name, by shebang or by mode', () => {
    expect(isExecutableName('build.sh')).toBe(true)
    expect(isExecutableName('a/b/postinstall.js')).toBe(true)
    expect(isExecutableName('hero.png')).toBe(false)
    expect(
      inspectAsset('notes.txt', Buffer.from('#!/bin/sh\nrm -rf /'), {
        allow: ['text'],
        maxBytes: 100,
      }).findings.map((f) => f.rule),
    ).toContain('executable-asset')
    expect(
      inspectAsset('hero.png', png, { ...IMAGE_POLICY, mode: 0o755 }).findings.map((f) => f.rule),
    ).toContain('executable-asset')
  })

  it('enforces the size cap and refuses an empty asset', () => {
    expect(
      inspectAsset('hero.png', Buffer.concat([png, Buffer.alloc(50)]), {
        ...IMAGE_POLICY,
        maxBytes: 10,
      }).findings.map((f) => f.rule),
    ).toContain('asset-too-large')
    expect(inspectAsset('x.woff2', Buffer.alloc(0), FONT_POLICY).findings.map((f) => f.rule)).toContain(
      'asset-empty',
    )
  })
})

describe('markup, CSS and SVG policy', () => {
  const rules = (findings: Array<{ rule: string }>) => findings.map((f) => f.rule)

  it('refuses every scripting and embedding route', () => {
    expect(rules(checkMarkup('<script>x()</script>'))).toContain('script-element')
    expect(rules(checkMarkup('<div onclick="x()">'))).toContain('event-handler')
    expect(rules(checkMarkup('<a href="javascript:alert(1)">x</a>'))).toContain('javascript-url')
    expect(rules(checkMarkup('<iframe src="/x"></iframe>'))).toContain('embed-element')
    expect(rules(checkMarkup('<object data="x"></object>'))).toContain('embed-element')
    expect(rules(checkMarkup('<base href="/x">'))).toContain('base-element')
    expect(rules(checkMarkup('<meta http-equiv="refresh" content="0;url=/x">'))).toContain('meta-refresh')
    expect(rules(checkMarkup('<svg><foreignObject><body></body></foreignObject></svg>'))).toContain(
      'foreign-object',
    )
    expect(rules(checkMarkup('<div srcdoc="<script>x</script>">'))).toContain('srcdoc')
  })

  it('refuses network reach and entity expansion', () => {
    expect(rules(checkMarkup('<img src="https://evil.test/p.gif">'))).toContain('external-resource')
    expect(rules(checkMarkup('<img src="//evil.test/p.gif">'))).toContain('external-resource')
    expect(rules(checkMarkup('<link rel="stylesheet" href="https://evil.test/a.css">'))).toContain(
      'external-stylesheet',
    )
    expect(rules(checkMarkup('<!DOCTYPE x [<!ENTITY a "b">]>'))).toContain('doctype-entity')
    expect(rules(checkMarkup('<!ENTITY lol "lollol">'))).toContain('entity-declaration')
    expect(rules(checkMarkup('<style>@import url(x.css)</style>'))).toContain('import-directive')
  })

  it('leaves an ordinary outbound anchor alone — a link is content, not a fetch', () => {
    expect(checkMarkup('<a href="https://example.test/paper">source</a>')).toEqual([])
  })

  it('does not mistake scroll-behavior for the IE binding property', () => {
    expect(checkCss('html{scroll-behavior:smooth}')).toEqual([])
    expect(rules(checkCss('a{behavior:url(x.htc)}'))).toContain('css-binding')
    expect(rules(checkCss('a{width:expression(alert(1))}'))).toContain('css-expression')
    expect(rules(checkCss('a{background:url(https://evil.test/x.png)}'))).toContain('css-external-url')
    expect(checkCss('@font-face{src:url(../assets/fonts/a.woff2)}')).toEqual([])
  })

  it('refuses hostile SVG and accepts a generated placeholder', () => {
    expect(rules(checkSvg('<svg><script>x()</script></svg>'))).toContain('script-element')
    expect(rules(checkSvg('<svg><image href="https://evil.test/x.png"/></svg>'))).toContain(
      'svg-external-image',
    )
    expect(rules(checkSvg('<svg><use href="https://evil.test/x#y"/></svg>'))).toContain('svg-external-use')
    expect(rules(checkSvg('<svg><a><animate attributeName="href" to="javascript:x"/></a></svg>'))).toContain(
      'svg-animated-href',
    )
    expect(
      checkSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2" fill="#000"/></svg>',
      ),
    ).toEqual([])
  })

  it('decodes a data-url SVG so its payload can be inspected', () => {
    const hostile = `data:image/svg+xml;utf8,${encodeURIComponent('<svg><script>x()</script></svg>')}`
    const decoded = decodeSvgDataUrl(hostile)
    expect(decoded).toContain('<script>')
    expect(rules(checkSvg(decoded as string))).toContain('script-element')
    expect(decodeSvgDataUrl('data:image/png;base64,AAAA')).toBeNull()
  })

  it('admits only in-document, relative and declared data URLs', () => {
    expect(isAllowedUrl('#main')).toBe(true)
    expect(isAllowedUrl('../assets/fonts/a.woff2')).toBe(true)
    expect(isAllowedUrl('https://evil.test/x')).toBe(false)
    expect(isAllowedUrl('//evil.test/x')).toBe(false)
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedUrl('mailto:someone@example.test')).toBe(false)
    expect(isAllowedUrl('data:image/png;base64,AAA', { allowData: true })).toBe(true)
    expect(isAllowedUrl('data:text/html;base64,AAA', { allowData: true })).toBe(false)
    expect(isAllowedUrl('data:image/png;base64,AAA')).toBe(false)
  })

  it('escapes interpolated values', () => {
    expect(escapeHtml('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;')
  })
})

// ── archive reader ───────────────────────────────────────────────────────────────────────────

type Entry = { name: string; data: Buffer; stored?: boolean; mode?: number; lieUncompressed?: number }

/** Minimal ZIP writer, so a hostile archive can be built exactly rather than fetched. */
function makeZip(entries: Entry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const raw = e.data
    const comp = e.stored ? raw : deflateRawSync(raw)
    const crc = 0
    const uncompressed = e.lieUncompressed ?? raw.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(e.stored ? 0 : 8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(uncompressed, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, comp)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(e.stored ? 0 : 8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comp.length, 20)
    central.writeUInt32LE(uncompressed, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + comp.length
  }
  const localBuf = Buffer.concat(locals)
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(localBuf.length, 16)
  return Buffer.concat([localBuf, centralBuf, eocd])
}

describe('archive reader — traversal, symlinks, decompression abuse, executables', () => {
  it('reads an ordinary archive', () => {
    const zip = makeZip([{ name: 'tokens/design-contract.json', data: Buffer.from('{"a":1}') }])
    const r = readZipSafely(zip)
    expect(r.refusals).toEqual([])
    expect(r.entries.map((e) => e.name)).toEqual(['tokens/design-contract.json'])
    expect(r.entries[0]!.bytes.toString()).toBe('{"a":1}')
  })

  it('refuses a traversing member without extracting it', () => {
    const r = readZipSafely(makeZip([{ name: '../../.ssh/authorized_keys', data: Buffer.from('key') }]))
    expect(r.entries).toEqual([])
    expect(r.refusals[0]!.rule).toBe('path-traversal')
  })

  it('refuses an absolute member', () => {
    const r = readZipSafely(makeZip([{ name: '/etc/cron.d/evil', data: Buffer.from('x') }]))
    expect(r.refusals[0]!.rule).toBe('path-absolute')
  })

  it('refuses a symlink member', () => {
    const r = readZipSafely(makeZip([{ name: 'link', data: Buffer.from('/etc/passwd'), mode: 0o120777 }]))
    expect(r.entries).toEqual([])
    expect(r.refusals[0]!.rule).toBe('archive-symlink')
  })

  it('refuses an executable member', () => {
    const r = readZipSafely(makeZip([{ name: 'hook.bin', data: Buffer.from('x'), mode: 0o100755 }]))
    expect(r.refusals[0]!.rule).toBe('executable-asset')
  })

  it('refuses a decompression bomb by ratio, before and after inflating', () => {
    const bomb = Buffer.alloc(2_000_000, 0x41) // compresses to ~2 KiB
    const r = readZipSafely(makeZip([{ name: 'bomb.txt', data: bomb }]), {
      maxEntries: 10,
      maxEntryBytes: 4_000_000,
      maxTotalBytes: 8_000_000,
      maxRatio: 50,
    })
    expect(r.entries).toEqual([])
    expect(r.refusals[0]!.rule).toBe('decompression-ratio')
  })

  it('refuses an entry that declares more than the per-entry cap', () => {
    const r = readZipSafely(makeZip([{ name: 'big.txt', data: Buffer.alloc(5000, 0x42) }]), {
      maxEntries: 10,
      maxEntryBytes: 1000,
      maxTotalBytes: 10_000,
      maxRatio: 10_000,
    })
    expect(r.refusals[0]!.rule).toBe('entry-too-large')
  })

  it('refuses the whole archive when the declared total is over the cap', () => {
    const zip = makeZip([
      { name: 'a.txt', data: Buffer.alloc(3000, 0x41) },
      { name: 'b.txt', data: Buffer.alloc(3000, 0x42) },
    ])
    expect(() =>
      readZipSafely(zip, { maxEntries: 10, maxEntryBytes: 5000, maxTotalBytes: 4000, maxRatio: 10_000 }),
    ).toThrow(/uncompressed/)
  })

  it('reports a header that lies about the uncompressed size', () => {
    const r = readZipSafely(makeZip([{ name: 'a.txt', data: Buffer.from('hello'), lieUncompressed: 4 }]))
    expect(r.entries).toEqual([])
    expect(r.refusals[0]!.rule).toBe('size-mismatch')
  })

  it('refuses more entries than the cap allows before reading any', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.txt`, data: Buffer.from('x') }))
    expect(() =>
      readZipSafely(makeZip(many), { maxEntries: 2, maxEntryBytes: 100, maxTotalBytes: 100, maxRatio: 10 }),
    ).toThrow(/entries/)
  })

  it('rejects something that is not a ZIP at all', () => {
    expect(() => readZipSafely(Buffer.from('not a zip'))).toThrow(/not a ZIP/)
  })
})
